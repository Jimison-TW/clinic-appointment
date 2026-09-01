using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using ClinicApi.Api.Auth;
using ClinicApi.Api.Entities;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace ClinicApi.Api.Services;

public class TokenService : ITokenService
{
    private readonly JwtSettings _jwt;

    // IOptions<T> 是 ASP.NET Core 讀設定的標準做法：
    // Program.cs 用 Configure<JwtSettings>(...) 綁定，這裡就拿得到強型別物件。
    public TokenService(IOptions<JwtSettings> jwt) => _jwt = jwt.Value;

    public string CreateAccessToken(User user)
    {
        // Claim = payload 裡的一個鍵值對。
        // ⚠️ 這些內容任何人都能 base64 解開讀，只放識別身分的最小資訊。
        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.Id.ToString()),  // 這個人是誰
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()), // 這張 token 的唯一編號
            new("role", user.Role),
            new("name", user.Name),
        };

        var key   = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_jwt.Key));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer:             _jwt.Issuer,
            audience:           _jwt.Audience,
            claims:             claims,
            expires:            DateTime.UtcNow.AddMinutes(_jwt.AccessTokenMinutes),
            signingCredentials: creds);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    public (string Raw, string Hash) CreateRefreshToken()
    {
        // ⚠️ 一定要用 RandomNumberGenerator（密碼學安全亂數），
        //    不能用 Random / Guid.NewGuid()——那些可以被預測。
        var bytes = RandomNumberGenerator.GetBytes(32);   // 256 bit
        var raw   = Convert.ToBase64String(bytes);
        return (raw, HashRefreshToken(raw));
    }

    public string HashRefreshToken(string raw)
    {
        // SHA-256 → 32 bytes → 轉十六進位字串剛好 64 個字元。
        // 這就是 refresh_tokens.token_hash 訂 varchar(64) 的原因。
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(raw));
        return Convert.ToHexString(hash).ToLowerInvariant();
    }
}
