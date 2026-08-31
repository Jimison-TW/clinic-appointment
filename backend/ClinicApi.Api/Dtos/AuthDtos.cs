namespace ClinicApi.Api.Dtos;

/// <summary>
/// ⚠️ 刻意「沒有」Role 欄位。
/// 如果讓前端傳 role，任何人都能 POST { role: "admin" } 幫自己開管理員帳號。
/// 角色一律由後端決定：自助註冊固定給 "patient"，
/// 要開 doctor / staff / admin 只能由已登入的 admin 走另一支端點。
/// </summary>
public record RegisterRequest(string Account, string Password, string Name);

public record LoginRequest(string Account, string Password);

public record RefreshRequest(string RefreshToken);

public record AuthResponse(
    string AccessToken,
    string RefreshToken,
    DateTime AccessTokenExpiresAt);
