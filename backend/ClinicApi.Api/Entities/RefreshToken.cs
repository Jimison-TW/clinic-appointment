namespace ClinicApi.Api.Entities;

/// <summary>Refresh token。對應 refresh_tokens 表。</summary>
public class RefreshToken
{
    public long Id { get; set; }

    public long UserId { get; set; }            // FK -> users.id（NOT NULL）

    public string TokenHash { get; set; } = null!;

    public DateTime CreatedAt { get; set; }
    public DateTime ExpiresAt { get; set; }
    public DateTime? RevokedAt { get; set; }
    public string? RevokedReason { get; set; }

    public long? ReplacedBy { get; set; }       // FK -> refresh_tokens.id（自我參照）

    public User User { get; set; } = null!;

    // 自我參照的兩端
    public RefreshToken? ReplacedByToken { get; set; }              // 我被誰換掉
    public ICollection<RefreshToken> Replaces { get; set; }         // 我換掉了誰
        = new List<RefreshToken>();
}
