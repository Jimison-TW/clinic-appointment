namespace ClinicApi.Api.Entities;

/// <summary>科別。對應 departments 表。</summary>
public class Department
{
    public int Id { get; set; }

    public string Name { get; set; } = null!;   // NOT NULL
    public string? Phone { get; set; }
    public string? Address { get; set; }

    public DateTime? DeletedAt { get; set; }    // 軟刪除：NULL = 還活著
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    // 導覽屬性：一個科別有多位醫師
    public ICollection<Doctor> Doctors { get; set; } = new List<Doctor>();
}
