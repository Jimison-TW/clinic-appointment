import axios, {
  AxiosError,
  type AxiosRequestConfig,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'
import { useAuthStore } from '../store/auth'
import router from '../router'
import { API_BASE_URL } from '../api/authClient'

// ⚠️ 關掉 vite proxy 之後，baseURL 必須是絕對位址。
//    原本寫 '/api' 是靠 proxy 幫忙補上 host —— 現在沒有 proxy 了，
//    '/api' 會變成打 http://localhost:5173/api（Vite 自己），回 index.html。
export const http = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
})

// =================================================================
// 併發 refresh 的收斂機制
// =================================================================
//
// 要解決的問題（已用 curl 實測重現）：
//   使用者切到一個要打 5 支 API 的頁面，access token 剛好在這時過期。
//   5 個請求「同時」拿到 401，5 個都跑進 response 攔截器，
//   於是 5 次 POST /api/auth/refresh 幾乎同時送出，帶的是同一張 refresh token。
//
//   後端每次 refresh 都會「輪替」（舊的標記 rotated、發一張新的）。
//   所以：
//     第 1 個到達的  → 200，R1 變成 rotated，發出 R2
//     第 2~5 個到達的 → 它們帶的還是 R1，而 R1 的 RevokedAt 已經有值
//                      → 後端判定「一張已作廢的 token 又出現了」= 重放
//                      → 撤銷這個使用者所有 active token（含剛發出的 R2）
//     結果：連贏的那一個也死了。使用者被強制登出。
//
//   實測輸出：#2 → 200，#1/#3/#4/#5 → 401「偵測到異常」，
//   DB 裡 R1=rotated、R2=replay_detected。
//
// ⚠️ 注意這不是後端的 bug。重放偵測正確地做了它該做的事 ——
//    「同一張 refresh token 被用了兩次」在它眼中就是外洩的訊號，
//    它分不出來是攻擊者，還是前端自己併發打了 5 次。
//    要修的是前端：保證同一時間對同一張 token 只有一次 refresh。
//
// 三層收斂：
//   ① 單一飛行 (single-flight)：同時間只允許一個 refresh 在飛，
//      後到的一律 await 同一個 Promise，不另外發請求。
//   ② 請求閘門 (gate)：refresh 在飛的期間，「新要送出」的請求先等它，
//      不要帶著已知作廢的 token 出門再回來 401，白白多一輪。
//   ③ 版本戳記 (stale check)：每個請求記下自己出門時用的是第幾版 token。
//      401 回來時如果版本已經被別人換掉了，代表新 token 已經到手 ——
//      直接用新的重送就好，完全不需要再 refresh。
// =================================================================

/** 正在飛的那一次 refresh。null = 目前沒有。 */
let refreshPromise: Promise<string> | null = null

/** token 換過幾次。每成功 refresh 一次 +1。 */
let tokenVersion = 0

/** 只給驗證用：實際打出去的 /refresh 次數。 */
export const refreshStats = { calls: 0 }

function refreshOnce(): Promise<string> {
  const auth = useAuthStore()

  // ⚠️ 這個 if 就是「單一飛行」的全部。
  //    因為 JS 是單執行緒、沒有 preemption，
  //    「檢查 refreshPromise 是否為 null」和「把它指派出去」之間
  //    不可能被別的程式碼插隊 —— 所以這裡不需要 mutex/lock。
  //
  //    前端對應物：這就是 lodash 的 memoize，只是快取的有效期是
  //    「這個 Promise 還沒 settle 之前」。
  if (!refreshPromise) {
    refreshStats.calls++
    refreshPromise = auth
      .refreshAccessToken()
      .then((token) => {
        tokenVersion++
        return token
      })
      .finally(() => {
        // ⚠️ 一定要在 finally 清掉，不能只在 then 清。
        //    只在 then 清的話，refresh 失敗那次的 rejected promise 會永遠卡在這裡，
        //    之後每一個請求都會 await 到同一個失敗結果，再也 refresh 不動。
        refreshPromise = null
      })
  }
  return refreshPromise
}

interface TrackedConfig extends InternalAxiosRequestConfig {
  /** 這個請求是不是已經因為 401 重送過一次了。防止無限重送。 */
  _retried?: boolean
  /** 出門時用的是第幾版 token。用來判斷 401 回來時是不是已經有人換過了。 */
  _tokenVersion?: number
}

// ---------------------------------------------------------------
// 送出前：等閘門 → 掛上 access token → 記下版本
// ---------------------------------------------------------------
http.interceptors.request.use(async (config: TrackedConfig) => {
  // ② 請求閘門：如果現在正好有一個 refresh 在飛，先等它換完再出門。
  //
  // ⚠️ 這裡不會死鎖，因為 refresh 本身走的是 authClient.ts 那個
  //    「完全沒有攔截器」的 axios 實例 —— 它不會再繞回這個 request 攔截器。
  //    如果 refresh 也走 http 這個實例，這一行就是死鎖：
  //    refresh 要出門 → 發現有 refresh 在飛 → 等自己完成 → 永遠等下去。
  if (refreshPromise) {
    await refreshPromise.catch(() => undefined) // 失敗也要放行，讓它自己去拿 401
  }

  // ⚠️ 在攔截器「裡面」才呼叫 useAuthStore()，不是在檔案最上面。
  //    這個檔案在 main.ts 執行 app.use(createPinia()) 之前就被 import 了，
  //    在模組頂層呼叫會拿到「沒有 active pinia」的錯誤。
  const auth = useAuthStore()
  if (auth.accessToken) {
    config.headers.Authorization = `Bearer ${auth.accessToken}`
  }
  config._tokenVersion = tokenVersion
  return config
})

// ---------------------------------------------------------------
// 回來後：401 就換一張 token 再送一次
// ---------------------------------------------------------------
http.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as TrackedConfig | undefined
    const status = error.response?.status

    // ⚠️⚠️ 只有 401 能觸發 refresh，403 絕對不行。
    //
    //    401 Unauthorized = 「我不知道你是誰」→ token 過期/無效 → 換一張有救
    //    403 Forbidden    = 「我知道你是誰，但你不夠格」→ 是 role 不對
    //
    //    如果 403 也去 refresh：換到的新 token role 一模一樣，重送一定又 403，
    //    然後又 refresh…… 每一次 refresh 都會輪替，等於瘋狂在 DB 製造垃圾，
    //    還可能自己撞上重放偵測。
    //    （實測：patient 打 /api/admin/users 拿到的正是 403，不是 401。）
    //
    // ⚠️ error.response 存在，才代表「伺服器真的回了東西」。
    //    如果 CORS 沒設好，瀏覽器根本不把回應交給 JS，
    //    error.response 會是 undefined、message 是 "Network Error"，
    //    這裡直接 reject —— 自動 refresh 完全不會發生。
    //    這就是為什麼後端 UseCors 一定要排在 UseAuthentication 前面（口訣 112）。
    if (status !== 401 || !original) {
      return Promise.reject(error)
    }

    if (original._retried) {
      // 換過新 token 重送後「又」401 —— 不是 token 過期的問題，別再繞了。
      return Promise.reject(error)
    }
    original._retried = true

    const auth = useAuthStore()

    // ③ 版本戳記：我出門時是第 N 版，現在已經是第 N+1 版了
    //    → 代表在我來回的這段時間裡，別人已經 refresh 完了。
    //    直接拿新的重送，不要再 refresh 一次（那會多燒掉一次輪替）。
    if (original._tokenVersion !== undefined && original._tokenVersion < tokenVersion) {
      original.headers.Authorization = `Bearer ${auth.accessToken}`
      return http(original)
    }

    try {
      // ① 單一飛行：5 個一起進來，只有第一個真的送出 /refresh，
      //    另外 4 個 await 同一個 Promise，拿到同一張新 token。
      const newToken = await refreshOnce()
      original.headers.Authorization = `Bearer ${newToken}`
      return http(original)
    } catch (refreshError) {
      // refresh 也失敗 = refresh token 過期 / 被撤銷 / 觸發重放偵測。真的沒救了。
      // ⚠️ 用 clearSession() 不用 logout()：後端已經不認這張 token 了，
      //    再打一次 /logout 只是多一個必然失敗的請求。
      auth.clearSession()
      if (router.currentRoute.value.name !== 'login') {
        router.push({ name: 'login', query: { redirect: router.currentRoute.value.fullPath } })
      }
      return Promise.reject(refreshError)
    }
  },
)

// ---------------------------------------------------------------
// orval 的 mutator：產生出來的每一支 API 都會呼叫這個 default export。
//
// ⚠️ 為什麼要包一層，不能直接 export default http（axios 實例）：
//    直接呼叫 axios 實例回傳的是 Promise<AxiosResponse<T>>（外面包一層信封），
//    但 orval 產生的型別假設是 Promise<T>（直接就是 body）。
//    在這裡拆一次 .data，全站都乾淨。
//
//    前端對應物：這就是 fetch 的 res.json() —— 把信封拆開只留內容物。
// ---------------------------------------------------------------
export default <T>(config: AxiosRequestConfig): Promise<T> =>
  http<T, AxiosResponse<T>>(config).then((res) => res.data)
