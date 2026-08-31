namespace ClinicApi.Api.Entities;

/// <summary>醫師。對應 doctors 表。</summary>
public class Doctor
{
    public int Id { get; set; }

    public int? DepartmentId { get; set; }      // FK -> departments.id（可為 NULL）
    public long? UserId { get; set; }           // FK -> users.id（可為 NULL）

    public string License { get; set; } = null!;
    public string? Phone { get; set; }
    public string? Address { get; set; }
    public string? Description { get; set; }

    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public DateTime? DeletedAt { get; set; }

    public Department? Department { get; set; }
    public User? User { get; set; }
}
