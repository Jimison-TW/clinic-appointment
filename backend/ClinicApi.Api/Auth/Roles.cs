namespace ClinicApi.Api.Auth;

/// <summary>
/// 系統的「正典角色集」。
///
/// 為什麼要有這個檔案：
///   在此之前，角色這件事有三個版本互相打架 ——
///     後端 Register 寫死 "patient"、User.cs 註解寫 admin/doctor/patient/staff、
///     前端型別寫 doctor/receptionist/patient、router 的 admin 頁寫 roles:['receptionist']。
///   結果就是「後端說你是 patient、前端在比對 receptionist」，永遠比不中，
///   而且不會報錯，只會安靜地把人擋在門外或放進不該進的頁面。
///
///   角色字串是前後端的「共用契約」。契約只能有一份，而且要有唯一的宣告點。
///   後端這份是唯一真相；前端 src/store/auth.ts 的 UserRole 型別必須跟這裡逐字一致。
///
/// ⚠️ 這些字串同時也是 JWT 裡 "role" claim 的值，
///    以及 [Authorize(Roles = "...")] 比對的對象 —— 大小寫敏感，不要改動。
/// </summary>
public static class Roles
{
    /// <summary>系統管理員。可看全院資料、管理帳號。</summary>
    public const string Admin = "admin";

    /// <summary>醫師。看自己的班表與自己的病患。</summary>
    public const string Doctor = "doctor";

    /// <summary>櫃台人員。代客建立/取消預約。</summary>
    public const string Receptionist = "receptionist";

    /// <summary>病患。自助註冊預設就是這個 —— 也是唯一能自助取得的角色。</summary>
    public const string Patient = "patient";
}
