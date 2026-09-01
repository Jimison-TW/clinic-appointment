using ClinicApi.Api.Entities;

namespace ClinicApi.Api.Services;

public interface ITokenService
{
    /// <summary>簽一張 access token（JWT）。伺服器不儲存它。</summary>
    string CreateAccessToken(User user);

    /// <summary>
    /// 產生一張 refresh token。
    /// 回傳兩個值：Raw 給前端、Hash 存資料庫。伺服器不留 Raw。
    /// </summary>
    (string Raw, string Hash) CreateRefreshToken();

    /// <summary>把前端送回來的 raw token 算成 hash，用來查資料庫。</summary>
    string HashRefreshToken(string raw);
}
