import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '../store/auth'
import type { UserRole } from '../store/auth'

// 讓 meta 有型別。沒有這段的話 to.meta.roles 是 unknown，
// 每次用都要 as string[]，而且打錯欄位名（rols）不會被抓到。
declare module 'vue-router' {
  interface RouteMeta {
    /** 不用登入就能看。 */
    public?: boolean
    /** 允許進入的角色。沒寫 = 登入即可。 */
    roles?: UserRole[]
  }
}

// ⚠️ 一定要標 RouteRecordRaw[]。不標的話 TS 會把 meta.roles 推成 string[]，
//    跟宣告合併裡的 UserRole[] 對不上，而且錯誤訊息長到看不出重點。
const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('../views/auth/LoginView.vue'),
    meta: { public: true },
  },
  { path: '/', redirect: '/schedule' },
  {
    path: '/schedule',
    name: 'schedule',
    component: () => import('../views/schedule/ScheduleView.vue'),
  },
  {
    path: '/booking',
    name: 'booking',
    component: () => import('../views/booking/BookingView.vue'),
  },
  {
    path: '/admin',
    name: 'admin',
    component: () => import('../views/admin/AdminView.vue'),
    // ⚠️ 原本這裡寫 roles: ['receptionist']，但後端註冊只會發 'patient'、
    //    也沒有任何地方會發 'receptionist' —— 這個頁面等於誰都進不去。
    //    現在對齊後端 Auth/Roles.cs 的 Admin，跟 [Authorize(Roles = "admin")] 一致。
    meta: { roles: ['admin'] },
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

// =================================================================
// 導覽守衛
//
// ⚠️⚠️ 這不是安全機制，講清楚很重要（面試常考）。
//
//   這段程式碼是跑在「使用者自己的瀏覽器」裡的 JS。
//   使用者對它有 100% 的控制權 —— 開 DevTools 打一行
//     useAuthStore().role = 'admin'
//   或直接在 Sources 面板把這個 return 改掉，就進去了。
//   整個 bundle 本來就是下載到他電腦上的檔案，沒有任何隱私可言。
//
//   那它到底在幹嘛？它管的是「體驗」：
//     - 沒登入的人不要看到一個空白破圖的頁面，直接送去登入頁
//     - 沒權限的人不要點進去等三秒才看到 403
//     - 記住原本要去哪（redirect），登入後送他過去
//
//   真正的安全在後端的 [Authorize(Roles = "admin")]，
//   它比對的是 JWT 簽章驗過的 role claim。使用者改不動那個 ——
//   改了簽章就對不上，後端直接 401。
//
//   所以就算他硬闖進 /admin 這個畫面，他也只會看到一個空表格，
//   因為資料在後端那道門後面。
//
//   一句話：前端擋的是「畫面」，後端擋的是「資料」。兩個都要做，但只有一個能信。
// =================================================================
router.beforeEach(async (to) => {
  const auth = useAuthStore()

  // ⚠️ 一定要等開機的靜默 refresh 跑完才能判斷。
  //    access token 只在記憶體，按 F5 之後一開始一定是 null ——
  //    如果不等，第一次導覽會直接判定「未登入」把人踢去 /login，
  //    然後 restore() 才姍姍來遲。使用者看到的就是「每次重新整理都被登出」。
  if (!auth.restored) {
    await auth.restore()
  }

  if (!to.meta.public && !auth.isAuthenticated) {
    // 帶著 redirect，登入後才回得去原本想去的地方
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  // 已經登入了還跑去登入頁，直接送回首頁
  if (to.name === 'login' && auth.isAuthenticated) {
    return { name: 'schedule' }
  }

  const allowed = to.meta.roles
  if (allowed) {
    // ⚠️ 原本寫的是 `allowed && auth.role && !allowed.includes(auth.role)`。
    //    當 auth.role 是 null 時，中間那個條件短路成 false，
    //    整個 if 不成立 —— 等於「沒有角色的人一律放行」。
    //    這種寫法錯得很安靜：測試時你一定有角色，永遠測不到這條路徑。
    //    正確語意是「白名單」：不在名單上就是不行，包含 null。
    if (!auth.role || !allowed.includes(auth.role)) {
      return { name: 'schedule' }
    }
  }

  return true
})

export default router
