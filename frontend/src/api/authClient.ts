import axios from 'axios'
import type { AuthResponse, LoginRequest, RefreshRequest } from './generated/models'

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5080'

/**
 * ⚠️ 這是一個「乾淨的」axios 實例：完全沒有裝任何攔截器。
 *
 * 為什麼 auth 的三支端點要跟其他 API 分開走：
 *
 *   src/utils/http.ts 那個實例身上裝了「401 就去打 /refresh」的攔截器。
 *   如果 /refresh 自己也走那個實例，那麼當 refresh token 過期、
 *   /refresh 回 401 的時候 —— 攔截器會攔到這個 401，然後再去打一次 /refresh，
 *   再 401，再打…… 無限遞迴。
 *
 *   原本的程式碼是用「檢查 url 有沒有包含 /auth/refresh」來閃過這件事，
 *   但那很脆弱：orval 產出的路徑是 /api/Auth/refresh（大寫 A），
 *   字串比對 '/auth/refresh' 直接失效，遞迴就發生了。
 *
 *   用「不同的實例」而不是「字串比對」來切開，是結構性的解法：
 *   不可能寫錯，也不會因為改了路徑就悄悄失效。
 *
 * 另外，這三支本來就不需要 Authorization header：
 *   login/refresh/logout 的身分憑證都在 request body 裡（帳密或 refresh token），
 *   帶一張過期的 access token 進去也沒有意義。
 */
const authAxios = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
})

export const authApi = {
  login: (body: LoginRequest) =>
    authAxios.post<AuthResponse>('/api/Auth/login', body).then((r) => r.data),

  refresh: (body: RefreshRequest) =>
    authAxios.post<AuthResponse>('/api/Auth/refresh', body).then((r) => r.data),

  logout: (body: RefreshRequest) => authAxios.post<void>('/api/Auth/logout', body),
}
