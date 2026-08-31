namespace ClinicApi.Api.Dtos;

/// <summary>
/// ⚠️ 刻意「沒有」Role 欄位。
/// 如果讓前端傳 role，任何人都能 POST { role: "admin" } 幫自己開管理員帳號。
/// 角色一律由後端決定：自助註冊固定給 "patient"，
/// 要開 doctor / receptionist / admin 只能由已登入的 admin 走另一支端點。
/// 角色的唯一宣告點在 Auth/Roles.cs。
/// </summary>
public record RegisterRequest(string Account, string Password, string Name);

public record LoginRequest(string Account, string Password);

public record RefreshRequest(string RefreshToken);

/// <summary>
/// login / refresh 的共同回應。
///
/// 為什麼把 UserId / Name / Role 一起回，而不是讓前端解 JWT payload、
/// 也不是讓前端登入完再打一次 /me：
///
///   1. 前端解 JWT payload 會養出危險的心智模型。前端手上沒有簽章金鑰，
///      base64 解出來的 payload 是「未經驗證」的字串 —— 誰都能自己捏一個
///      role:"admin" 的假 token 塞進去。拿來畫選單可以，但團隊裡遲早有人
///      會以為「前端已經驗過 token 了」。乾脆不要開這個頭。
///   2. 打 /me 是多一趟 round trip，而且 refresh 之後角色若異動又要再打一次。
///   3. 走這條路，refresh 也會回最新的 Role —— 因為 login 跟 refresh 共用
///      同一個 IssueTokensAsync。角色被 admin 調整後，使用者下一次自動
///      refresh 就同步了，不用重新登入。
///
/// ⚠️ 但要記得：這些欄位是給「畫面」用的，不是給「授權」用的。
///    真正的授權依據永遠是後端從 JWT 簽章驗出來的 role claim。
/// </summary>
public record AuthResponse(
    string AccessToken,
    string RefreshToken,
    DateTime AccessTokenExpiresAt,
    long UserId,
    string Name,
    string Role);
