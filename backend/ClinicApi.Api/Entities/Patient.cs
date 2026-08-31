namespace ClinicApi.Api.Entities;

/// <summary>病患。對應 patients 表。</summary>
public class Patient
{
    public long Id { get; set; }

    public long Mrn { get; set; }               // 病歷號，從 1000000 起跳
    public long? UserId { get; set; }           // FK -> users.id（可為 NULL）

    public string IcId { get; set; } = null!;   // 身分證字號
    public string? Phone { get; set; }
    public string? Address { get; set; }
    public DateOnly? BirthDate { get; set; }    // date（沒有時間）

    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public DateTime? DeletedAt { get; set; }

    public User? User { get; set; }
}
