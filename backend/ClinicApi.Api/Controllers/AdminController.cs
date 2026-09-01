using ClinicApi.Api.Auth;
using ClinicApi.Api.Data;
using ClinicApi.Api.Dtos;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ClinicApi.Api.Controllers;

/// <summary>
/// 後台管理。整個 controller 都掛 [Authorize(Roles = admin)]。
///
/// ⚠️ 為什麼「前端已經有導覽守衛擋 admin 頁了」，這裡還是要擋一次：
///    導覽守衛擋的是「畫面」，這裡擋的是「資料」。
///    導覽守衛是跑在使用者自己瀏覽器裡的 JS —— 使用者對它有 100% 控制權，
///    開 DevTools 改一行 store 的 role 就繞過去了。
///    但那樣他頂多看到一個空表格，因為真正的資料在這道 [Authorize] 後面，
///    而它比對的是 JWT 簽章驗過的 role claim，前端改不動（改了簽章就不合）。
///
///    一句話：前端的檢查是體驗，後端的檢查才是安全。兩個都要做，但只有一個能信。
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Authorize(Roles = Roles.Admin)]
public class AdminController : ControllerBase
{
    private readonly ClinicDbContext _db;

    public AdminController(ClinicDbContext db) => _db = db;

    /// <summary>GET /api/admin/users — 全院帳號清單。只有 admin 看得到。</summary>
    [HttpGet("users")]
    public async Task<ActionResult<List<AdminUserRow>>> ListUsers()
    {
        // ⚠️ 用 Select 投影出 DTO，不要直接回 User 實體。
        //    直接回實體會把 PasswordHash 也序列化出去。
        var users = await _db.Users
            .OrderBy(u => u.Id)
            .Select(u => new AdminUserRow(
                u.Id, u.Account, u.Name, u.Role, u.IsActive, u.LastLoginAt))
            .ToListAsync();

        return Ok(users);
    }
}
