namespace ClinicApi.Api.Entities;

/// <summary>帳號。對應 users 表。</summary>
public class User
{
    public long Id { get; set; }

    public string Name { get; set; } = null!;
    public string Account { get; set; } = null!;
    public string PasswordHash { get; set; } = null!;
    public string Role { get; set; } = null!;   // 取值只能來自 Auth/Roles.cs

    public bool IsActive { get; set; }
    public short TryCount { get; set; }         // smallint
    public DateTime? LastLoginAt { get; set; }

    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    // 一個 user 最多對應一位 doctor（1:1，可能沒有）
    public Doctor? Doctor { get; set; }
    // 一個 user 最多對應一位 patient（1:1，可能沒有）
    public Patient? Patient { get; set; }
    // 一個 user 可以有多張 refresh token
    public ICollection<RefreshToken> RefreshTokens { get; set; } = new List<RefreshToken>();
}
