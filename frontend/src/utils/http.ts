import axios, {
  AxiosError,
  type AxiosRequestConfig,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'
import { useAuthStore } from '../store/auth'
import router from '../router'

// ⚠️ 關掉 vite proxy 之後，baseURL 必須是絕對位址。
//    原本寫 '/api' 是靠 proxy 幫忙補上 host —— 現在沒有 proxy 了，
//    '/api' 會變成打 http://localhost:5173/api（Vite 自己），回 404 的 index.html。
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5080'

export const http = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
})

http.interceptors.request.use((config) => {
  const auth = useAuthStore()
  if (auth.accessToken) {
    config.headers.Authorization = `Bearer ${auth.accessToken}`
  }
  return config
})

// 多支請求同時 401 時，讓大家排隊等同一個 refresh promise，避免打出多次 refresh。
let refreshPromise: Promise<string> | null = null

interface RetriableConfig extends InternalAxiosRequestConfig {
  _retried?: boolean
}

http.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetriableConfig | undefined
    const auth = useAuthStore()

    if (error.response?.status !== 401 || !originalRequest || originalRequest._retried) {
      return Promise.reject(error)
    }

    if (originalRequest.url?.includes('/auth/refresh')) {
      auth.logout()
      router.push('/login')
      return Promise.reject(error)
    }

    originalRequest._retried = true

    if (!refreshPromise) {
      refreshPromise = auth
        .refreshAccessToken()
        .finally(() => {
          refreshPromise = null
        })
    }

    try {
      const newToken = await refreshPromise
      originalRequest.headers.Authorization = `Bearer ${newToken}`
      return http(originalRequest)
    } catch (refreshError) {
      auth.logout()
      router.push('/login')
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
//    不拆掉 .data 的話，型別會對不上，而且每個呼叫端都要多寫一次 .data。
//    在這裡拆一次，全站都乾淨。
//
//    前端對應物：這就是 fetch 的 res.json() —— 把信封拆開只留內容物。
// ---------------------------------------------------------------
export default <T>(config: AxiosRequestConfig): Promise<T> =>
  http<T, AxiosResponse<T>>(config).then((res) => res.data)
