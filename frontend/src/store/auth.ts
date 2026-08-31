import { defineStore } from 'pinia'
import { authApi } from '../api/authClient'
import type { AuthResponse } from '../api/generated/models'

/**
 * ⚠️ 必須跟後端 Auth/Roles.cs 逐字一致（大小寫也是）。
 *    原本這裡寫 'doctor' | 'receptionist' | 'patient'，
 *    但後端註冊寫死發 "patient"、router 的 admin 頁卻比對 'receptionist'，
 *    三邊對不起來 —— 而且因為是字串比對，比不中不會報錯，只會靜靜地擋掉人。
 */
export type UserRole = 'admin' | 'doctor' | 'receptionist' | 'patient'

/**
 * ⚠️ refresh token 存哪裡：這是今天唯一一個「知道不是最佳解但先這樣」的決定。
 *
 *   最佳解是後端用 Set-Cookie 發一張 httpOnly + Secure + SameSite=Strict 的
 *   cookie —— httpOnly 代表 JS 讀不到，XSS 就算注入成功也偷不走。
 *   但那要改後端發 cookie、前端開 withCredentials、CORS 開 AllowCredentials
 *   並改掉 AllowAnyHeader（規格不允許 credentials 搭配萬用字元），
 *   是另一整場的工作量。
 *
 *   今天先放 localStorage，並且清楚記著代價：
 *   一旦頁面被 XSS，攻擊者可以讀走這張 refresh token = 30 天的通行證。
 */
const REFRESH_TOKEN_KEY = 'clinic.refreshToken'

interface AuthState {
  /**
   * ⚠️ access token 只放記憶體，絕對不進 localStorage。
   *
   *   理由不是「localStorage 比較不安全」這種模糊講法，而是很具體的取捨：
   *   localStorage 是同源 JS 都讀得到的全域空間。只要頁面上任何一支
   *   第三方腳本（分析、廣告、被投毒的 npm 套件）被攻破，一行
   *   localStorage.getItem 就把 token 帶走了。
   *
   *   放記憶體（JS 變數）的話，攻擊者必須在「同一個分頁、同一個 JS context、
   *   而且在使用者還開著頁面的時候」才拿得到 —— 關掉分頁就沒了。
   *   這不是刀槍不入，但把「偷完可以離線慢慢用」降級成「必須在場」。
   *
   *   代價：按 F5 重新整理，access token 就沒了。
   *   所以 main.ts 開機時要用 refresh token 靜默換一張回來（見 restore()）。
   *   這個代價可以接受，因為 access token 只有 15 分鐘，本來就是「短命、可拋棄」的東西。
   */
  accessToken: string | null
  accessTokenExpiresAt: string | null

  /** 這張是長命的（30 天），所以才需要持久化。 */
  refreshToken: string | null

  /**
   * ⚠️ role / userId / displayName 也只放記憶體，不持久化。
   *   不需要 —— 因為後端的 AuthResponse 在 login 跟 refresh 都會回這三個值，
   *   而開機時本來就要做一次 refresh。順便就拿到了，還保證是最新的：
   *   如果 admin 在後台把你降級成 patient，你下一次 refresh 就會同步到。
   *   持久化反而會讓一份過期的 role 卡在瀏覽器裡。
   */
  role: UserRole | null
  userId: number | null
  displayName: string | null

  /** 開機那次靜默 refresh 有沒有跑完。導覽守衛要等它，否則會誤判成未登入。 */
  restored: boolean
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    accessToken: null,
    accessTokenExpiresAt: null,
    refreshToken: localStorage.getItem(REFRESH_TOKEN_KEY),
    role: null,
    userId: null,
    displayName: null,
    restored: false,
  }),

  getters: {
    isAuthenticated: (state) => !!state.accessToken,
    isAdmin: (state) => state.role === 'admin',
  },

  actions: {
    /**
     * 把一份 AuthResponse 套進 store。
     * login 跟 refresh 都走這裡 —— 這是修掉輪替 bug 的關鍵：
     * 只要「所有拿到 AuthResponse 的地方」都走同一個入口，
     * 就不可能發生「有人只更新了 accessToken、忘了更新 refreshToken」。
     */
    applySession(res: AuthResponse) {
      this.accessToken = res.accessToken ?? null
      this.accessTokenExpiresAt = res.accessTokenExpiresAt ?? null
      this.role = (res.role as UserRole) ?? null
      this.userId = res.userId ?? null
      this.displayName = res.name ?? null

      // ⚠️⚠️ 這一行就是原本必炸的 bug。
      //
      //   後端每次 /refresh 都會「輪替」：把舊的那張標記 revoked，發一張全新的。
      //   原本的 refreshAccessToken() 只寫了 this.accessToken = data.accessToken，
      //   完全沒動 refreshToken —— 所以前端手上永遠是「第一次登入拿到的那張」。
      //
      //   時間軸（實測會這樣死）：
      //     T0  login          → 前端持有 R1，DB: R1 active
      //     T1  refresh(R1)    → 後端輪替，DB: R1 revoked(rotated), R2 active
      //                          回應含 R2，但前端沒存 → 前端還是持有 R1
      //     T2  再次 refresh(R1) → 後端查到 R1 的 RevokedAt 不是 null
      //                          → 判定為「重放」→ 把該使用者所有 active token
      //                            全部撤銷 → 401「偵測到異常，請重新登入」
      //
      //   也就是說：使用者大約在第二次自動 refresh 時被強制登出，
      //   而且是被自己 Day 3 寫的重放偵測咬到的。
      if (res.refreshToken) {
        this.refreshToken = res.refreshToken
        localStorage.setItem(REFRESH_TOKEN_KEY, res.refreshToken)
      }

      // ⚠️ 拿到一份新的 session 就等於「還原完成了」。
      //    少了這一行的話：login() 成功後 restored 還是 false，
      //    緊接著 router.push 觸發導覽守衛，守衛看到 !restored 就去跑 restore()，
      //    restore() 看到 refreshToken 有值 -> 又打一次 /refresh。
      //    等於每次登入都白白多一趟 round trip、多燒掉一次 token 輪替。
      //    （在 e2e 的網路 log 裡就是 login 200 後面緊跟著一個沒必要的 refresh 200。）
      this.restored = true
    },

    async login(account: string, password: string) {
      // ⚠️ 原本這裡送的是 { username, password }，但後端 DTO 是
      //    LoginRequest(string Account, string Password)。
      //    JSON 的 username 對不到 Account，model binding 給 null，
      //    查不到人 → 一律回 401「帳號或密碼錯誤」。
      //    密碼打對也登不進去，而且錯誤訊息完全不會提示你欄位名錯了。
      const res = await authApi.login({ account, password })
      this.applySession(res)
      return res
    },

    /**
     * 換一張新的 access token。
     * ⚠️ 這個 action 只負責「換」，不負責「處理併發」——
     *    同時有 5 個請求 401 的時候該怎麼收斂，是 src/utils/http.ts 的責任。
     *    如果讓 store 也管併發，兩邊各有一份狀態就會互相打架。
     */
    async refreshAccessToken(): Promise<string> {
      if (!this.refreshToken) {
        throw new Error('沒有 refresh token，無法刷新')
      }
      const res = await authApi.refresh({ refreshToken: this.refreshToken })
      this.applySession(res)
      if (!res.accessToken) {
        throw new Error('refresh 回應沒有 accessToken')
      }
      return res.accessToken
    },

    /**
     * 開機時的靜默還原。
     * 因為 access token 只在記憶體，重新整理後一定是 null；
     * 但 refresh token 還在 localStorage，可以直接換一張新的 access token 回來，
     * 使用者不會感覺到自己被登出過。
     */
    async restore() {
      if (this.restored) return
      try {
        if (this.refreshToken) {
          await this.refreshAccessToken()
        }
      } catch {
        // refresh token 過期 / 被撤銷 / 觸發重放偵測 —— 一律當作沒登入。
        // ⚠️ 這裡只清本地，不打後端 logout：那張 token 後端已經不認了，
        //    再打一次只是多一個必然失敗的請求。
        this.clearSession()
      } finally {
        this.restored = true
      }
    },

    /** 只清本地狀態，不碰後端。給「後端已經不認這張 token」的情境用。 */
    clearSession() {
      this.accessToken = null
      this.accessTokenExpiresAt = null
      this.refreshToken = null
      this.role = null
      this.userId = null
      this.displayName = null
      localStorage.removeItem(REFRESH_TOKEN_KEY)
    },

    /**
     * 使用者主動登出。
     * ⚠️ 一定要打後端 /logout 把 refresh token 撤銷掉。
     *    只清前端狀態的話，那張 refresh token 在 DB 裡還活著 30 天 ——
     *    使用者以為自己登出了，但如果 token 曾經外洩，攻擊者還能繼續用。
     *
     * ⚠️ 但也要記得：logout 撤銷的只有 refresh token。
     *    使用者手上那張 access token 是無狀態的 JWT，後端沒有它的紀錄，
     *    撤不掉，它會一直有效到自己過期（最多 15 分鐘）。
     *    這就是 JWT 換來「不用查 DB」的代價。
     */
    async logout() {
      const token = this.refreshToken
      this.clearSession()
      if (token) {
        // 失敗也無所謂：本地已經清乾淨了，不要讓網路錯誤卡住登出。
        await authApi.logout({ refreshToken: token }).catch(() => undefined)
      }
    },
  },
})
