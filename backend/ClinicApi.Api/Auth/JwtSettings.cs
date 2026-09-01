namespace ClinicApi.Api.Auth;

/// <summary>
/// 對應 appsettings.json 的 "Jwt" 區段。
/// Key 例外：它存在 user-secrets，不進版控。
/// </summary>
public class JwtSettings
{
    public string Issuer { get; set; } = null!;
    public string Audience { get; set; } = null!;
    public string Key { get; set; } = null!;
    public int AccessTokenMinutes { get; set; } = 15;
    public int RefreshTokenDays { get; set; } = 30;
}
