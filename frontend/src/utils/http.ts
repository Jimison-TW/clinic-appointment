import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { useAuthStore } from '../store/auth'
import router from '../router'

const http = axios.create({
  baseURL: '/api',
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

export default http
