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

// ---------------------------------------------------------------
// 送出前：掛上 access token
// ---------------------------------------------------------------
http.interceptors.request.use((config) => {
  // ⚠️ 在攔截器「裡面」才呼叫 useAuthStore()，不是在檔案最上面。
  //    這個檔案是在 main.ts 執行 app.use(createPinia()) 之前就被 import 的，
  //    在模組頂層呼叫會拿到「還沒有 active pinia」的錯誤。
  //    放在函式裡 = 延後到真的有請求要送的那一刻才取 store，那時 pinia 一定就緒。
  const auth = useAuthStore()
  if (auth.accessToken) {
    config.headers.Authorization = `Bearer ${auth.accessToken}`
  }
  return config
})

interface RetriableConfig extends InternalAxiosRequestConfig {
  /** 這個請求是不是已經因為 401 重送過一次了。防止無限重送。 */
  _retried?: boolean
}

// ---------------------------------------------------------------
// 回來後：401 就換一張 token 再送一次
// ---------------------------------------------------------------
http.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as RetriableConfig | undefined
    const status = error.response?.status

    // ⚠️⚠️ 只有 401 能觸發 refresh，403 絕對不行。
    //
    //    401 Unauthorized  = 「我不知道你是誰」→ token 過期/無效 → 換一張有救
    //    403 Forbidden     = 「我知道你是誰，但你不夠格」→ 是 role 不對
    //
    //    如果 403 也去 refresh：換到的新 token 上面的 role 一模一樣，
    //    重送一定又 403，然後又 refresh…… 而且每一次 refresh 都會輪替 token，
    //    等於在 DB 裡瘋狂製造垃圾，還可能自己撞上重放偵測。
    //
    //    （實測：patient 打 /api/admin/users 拿到的正是 403，不是 401。）
    if (status !== 401 || !original) {
      return Promise.reject(error)
    }

    // ⚠️ error.response 存在才代表「伺服器真的回了東西」。
    //    如果 CORS 沒設好，瀏覽器根本不把回應交給 JS，
    //    這裡的 error.response 會是 undefined、message 是 "Network Error"，
    //    上面的 status !== 401 就直接 reject 了 —— 自動 refresh 完全不會發生。
    //    這就是為什麼後端 UseCors 一定要排在 UseAuthentication 前面（口訣 112）。

    if (original._retried) {
      // 換過新 token 重送後「又」401 —— 代表不是 token 過期的問題，別再繞了。
      return Promise.reject(error)
    }
    original._retried = true

    const auth = useAuthStore()
    try {
      // ⚠️ 這一步走的是 authClient 那個「沒有攔截器」的實例（見 store/auth.ts），
      //    所以就算 /refresh 自己回 401，也不會再掉回這個攔截器裡遞迴。
      //
      // ⚠️⚠️ 但這個版本有一個明顯的洞：
      //    如果同時有 5 個請求一起 401，這裡就會被進入 5 次，
      //    打出 5 次 /refresh。而後端每次 refresh 都會輪替 token ——
      //    第 2 次打的時候，它手上那張已經在第 1 次被標記 rotated 了
      //    → 觸發重放偵測 → 整條鏈被撤銷 → 使用者被強制登出。
      //    下一個 commit 專門處理這件事。
      const newToken = await auth.refreshAccessToken()
      original.headers.Authorization = `Bearer ${newToken}`
      return http(original)
    } catch (refreshError) {
      // refresh 也失敗 = refresh token 過期/被撤銷/觸發重放偵測。真的沒救了。
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
