using System.Security.Claims;
using ClinicApi.Api.Auth;
using ClinicApi.Api.Data;
using ClinicApi.Api.Dtos;
using ClinicApi.Api.Entities;
using ClinicApi.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace ClinicApi.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly ClinicDbContext _db;
    private readonly ITokenService _tokens;
    private readonly JwtSettings _jwt;

    public AuthController(ClinicDbContext db, ITokenService tokens, IOptions<JwtSettings> jwt)
    {
        _db = db;
        _tokens = tokens;
        _jwt = jwt.Value;
    }

    // ================================================================
    // POST /api/auth/register
    // ================================================================
    [HttpPost("register")]
    public async Task<IActionResult> Register(RegisterRequest req)
    {
        var exists = await _db.Users.AnyAsync(u => u.Account == req.Account);
        if (exists)
            return Conflict(new { message = "此帳號已被使用" });

        var user = new User
        {
            Account = req.Account,
            Name = req.Name,
            // BCrypt 自帶 salt：同一個密碼每次 hash 出來都不一樣，防彩虹表。
            // 預設 work factor 11 -> 單次驗證約 100ms，這個「慢」是故意的。
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password),
            Role = "patient",        // ← 寫死。永遠不從 request 拿。
            IsActive = true,
        };

        _db.Users.Add(user);
        await _db.SaveChangesAsync();

        return CreatedAtAction(nameof(Me), new { }, new { user.Id, user.Account, user.Name });
    }

    // ================================================================
    // POST /api/auth/login
    // ================================================================
    [HttpPost("login")]
    public async Task<ActionResult<AuthResponse>> Login(LoginRequest req)
    {
        var user = await _db.Users.SingleOrDefaultAsync(u => u.Account == req.Account);

        // ⚠️ 帳號不存在、密碼錯誤，回一模一樣的訊息。
        //    如果分開回「查無此帳號」/「密碼錯誤」，攻擊者可以拿一份 email 名單
        //    一個一個試，篩出「哪些 email 有註冊」——這叫帳號枚舉（user enumeration）。
        if (user is null || !BCrypt.Net.BCrypt.Verify(req.Password, user.PasswordHash))
        {
            if (user is not null)
            {
                user.TryCount++;                 // 用上 users.try_count
                await _db.SaveChangesAsync();
            }
            return Unauthorized(new { message = "帳號或密碼錯誤" });
        }

        if (!user.IsActive)
            return Unauthorized(new { message = "帳號已停用" });

        user.TryCount = 0;
        // ⚠️ 一律 UtcNow，不要 Now。欄位是 timestamptz，
        //    Npgsql 遇到 Kind=Unspecified 的 DateTime 會直接丟例外。
        user.LastLoginAt = DateTime.UtcNow;

        var response = await IssueTokensAsync(user, replacing: null);
        await _db.SaveChangesAsync();
        return Ok(response);
    }

    // ================================================================
    // POST /api/auth/refresh   ← token 輪替 + 重放偵測
    // ================================================================
    [HttpPost("refresh")]
    public async Task<ActionResult<AuthResponse>> Refresh(RefreshRequest req)
    {
        // 前端送 raw，我們算 hash 去查（DB 裡永遠只有 hash）
        var hash = _tokens.HashRefreshToken(req.RefreshToken);

        var stored = await _db.RefreshTokens
            .Include(t => t.User)
            .SingleOrDefaultAsync(t => t.TokenHash == hash);

        if (stored is null)
            return Unauthorized(new { message = "Refresh token 無效" });

        // ⚠️⚠️ 重放偵測：一張「已經被輪替掉」的 token 又出現了。
        //     正常流程不可能發生 —— 前端每次 refresh 都會換成新的那張。
        //     所以這代表有人握著這條鏈上的舊 token = 外洩。
        //     處置：把這個使用者所有還活著的 token 全部撤銷，強制重新登入。
        if (stored.RevokedAt is not null)
        {
            var active = await _db.RefreshTokens
                .Where(t => t.UserId == stored.UserId && t.RevokedAt == null)
                .ToListAsync();

            foreach (var t in active)
            {
                t.RevokedAt = DateTime.UtcNow;
                t.RevokedReason = "replay_detected";
            }
            await _db.SaveChangesAsync();

            return Unauthorized(new { message = "偵測到異常，請重新登入" });
        }

        if (stored.ExpiresAt <= DateTime.UtcNow)
            return Unauthorized(new { message = "Refresh token 已過期" });

        if (!stored.User.IsActive)
            return Unauthorized(new { message = "帳號已停用" });

        var response = await IssueTokensAsync(stored.User, replacing: stored);
        await _db.SaveChangesAsync();
        return Ok(response);
    }

    // ================================================================
    // POST /api/auth/logout
    // ================================================================
    [HttpPost("logout")]
    public async Task<IActionResult> Logout(RefreshRequest req)
    {
        var hash = _tokens.HashRefreshToken(req.RefreshToken);

        var stored = await _db.RefreshTokens
            .SingleOrDefaultAsync(t => t.TokenHash == hash && t.RevokedAt == null);

        if (stored is not null)
        {
            stored.RevokedAt = DateTime.UtcNow;
            stored.RevokedReason = "logout";
            await _db.SaveChangesAsync();
        }

        // ⚠️ 找不到也回 204。登出不該讓呼叫端知道「這張 token 存不存在」。
        // ⚠️ 而且注意：這只讓 refresh token 失效。
        //    使用者手上那張 access token 仍然有效，直到它自己過期（最多 15 分鐘）。
        //    這就是 JWT 無狀態的代價。
        return NoContent();
    }

    // ================================================================
    // GET /api/auth/me   ← 驗證 [Authorize] 有沒有真的接上
    // ================================================================
    [HttpGet("me")]
    [Authorize]
    public async Task<IActionResult> Me()
    {
        // 因為 Program.cs 清掉了 DefaultInboundClaimTypeMap，
        // 這裡才找得到原始的 "sub"（否則它會被改寫成一長串微軟 URI）。
        var sub = User.FindFirstValue("sub");
        if (!long.TryParse(sub, out var userId))
            return Unauthorized();

        var user = await _db.Users
            .Where(u => u.Id == userId)
            .Select(u => new { u.Id, u.Account, u.Name, u.Role, u.LastLoginAt })
            .SingleOrDefaultAsync();

        return user is null ? Unauthorized() : Ok(user);
    }

    // ================================================================
    // 共用：發一組 token。replacing 有值時做輪替。
    // ================================================================
    private async Task<AuthResponse> IssueTokensAsync(User user, RefreshToken? replacing)
    {
        var (raw, hash) = _tokens.CreateRefreshToken();

        var fresh = new RefreshToken
        {
            UserId = user.Id,
            TokenHash = hash,
            ExpiresAt = DateTime.UtcNow.AddDays(_jwt.RefreshTokenDays),
        };
        _db.RefreshTokens.Add(fresh);

        if (replacing is not null)
        {
            replacing.RevokedAt = DateTime.UtcNow;
            replacing.RevokedReason = "rotated";
            // 用「導覽屬性」而不是直接寫 replacing.ReplacedBy = fresh.Id，
            // 因為 fresh 還沒存進 DB、還沒有 Id。
            // 設導覽屬性，EF 會先 INSERT fresh、拿到 id、再回填 replaced_by。
            replacing.ReplacedByToken = fresh;
        }

        var accessToken = _tokens.CreateAccessToken(user);
        var expiresAt = DateTime.UtcNow.AddMinutes(_jwt.AccessTokenMinutes);

        await Task.CompletedTask;
        return new AuthResponse(accessToken, raw, expiresAt);
    }
}
