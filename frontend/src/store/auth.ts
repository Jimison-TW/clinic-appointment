import { defineStore } from 'pinia'
import axios from 'axios'

export type UserRole = 'doctor' | 'receptionist' | 'patient'

interface AuthState {
  accessToken: string | null
  refreshToken: string | null
  role: UserRole | null
  userId: string | null
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    accessToken: localStorage.getItem('accessToken'),
    refreshToken: localStorage.getItem('refreshToken'),
    role: localStorage.getItem('role') as UserRole | null,
    userId: localStorage.getItem('userId'),
  }),

  getters: {
    isAuthenticated: (state) => !!state.accessToken,
  },

  actions: {
    setSession(payload: { accessToken: string; refreshToken: string; role: UserRole; userId: string }) {
      this.accessToken = payload.accessToken
      this.refreshToken = payload.refreshToken
      this.role = payload.role
      this.userId = payload.userId
      localStorage.setItem('accessToken', payload.accessToken)
      localStorage.setItem('refreshToken', payload.refreshToken)
      localStorage.setItem('role', payload.role)
      localStorage.setItem('userId', payload.userId)
    },

    async login(username: string, password: string) {
      // TODO: 換成 orval 產生的 authApi.login，待後端 Swagger 完成後接上
      const { data } = await axios.post('/api/auth/login', { username, password })
      this.setSession(data)
    },

    async refreshAccessToken(): Promise<string> {
      if (!this.refreshToken) {
        throw new Error('沒有 refresh token，無法刷新')
      }
      const { data } = await axios.post('/api/auth/refresh', {
        refreshToken: this.refreshToken,
      })
      this.accessToken = data.accessToken
      localStorage.setItem('accessToken', data.accessToken)
      return data.accessToken
    },

    logout() {
      this.accessToken = null
      this.refreshToken = null
      this.role = null
      this.userId = null
      localStorage.removeItem('accessToken')
      localStorage.removeItem('refreshToken')
      localStorage.removeItem('role')
      localStorage.removeItem('userId')
    },
  },
})
