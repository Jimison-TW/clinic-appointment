<script setup lang="ts">
import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from './store/auth'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const showNav = computed(() => !route.meta.public)

/**
 * ⚠️ 選單直接從 router 的設定推導，不在這裡另外手寫一份角色清單。
 *
 *   如果 App.vue 自己維護一份「哪個角色看得到哪個選單」，
 *   而 router 守衛維護另一份「哪個角色進得去哪個路由」，
 *   這兩份清單一定會在某次改動後分岔 ——
 *   使用者會看到一個選單，點下去卻被守衛踢回首頁。
 *
 *   同一份 meta.roles 同時餵給守衛跟選單，結構上就不可能對不起來。
 *
 * ⚠️ 但再強調一次：這只是「不畫出來」，不是「進不去」。
 *    使用者直接在網址列輸入 /admin 一樣會走守衛，
 *    而就算他繞過守衛，資料還有後端的 [Authorize(Roles="admin")] 擋著。
 */
const menuItems = computed(() =>
  router.getRoutes()
    .filter((r) => {
      if (!r.meta.title) return false
      const allowed = r.meta.roles
      if (!allowed) return true
      return !!auth.role && allowed.includes(auth.role)
    })
    .map((r) => ({ path: r.path, title: r.meta.title as string })),
)

const roleLabel: Record<string, string> = {
  admin: '系統管理員',
  doctor: '醫師',
  receptionist: '櫃台',
  patient: '病患',
}

async function handleLogout() {
  await auth.logout()
  router.push({ name: 'login' })
}
</script>

<template>
  <el-container v-if="showNav" class="layout">
    <el-header class="header">
      <span class="title">診所預約管理系統</span>
      <el-menu mode="horizontal" :ellipsis="false" router :default-active="route.path" class="menu">
        <el-menu-item v-for="item in menuItems" :key="item.path" :index="item.path">
          {{ item.title }}
        </el-menu-item>
      </el-menu>
      <span v-if="auth.displayName" class="who">
        {{ auth.displayName }}
        <el-tag size="small" :type="auth.isAdmin ? 'danger' : 'info'" data-test="role-tag">
          {{ roleLabel[auth.role ?? ''] ?? auth.role }}
        </el-tag>
      </span>
      <el-button text data-test="logout" @click="handleLogout">登出</el-button>
    </el-header>
    <el-main>
      <router-view />
    </el-main>
  </el-container>
  <router-view v-else />
</template>

<style scoped>
.layout { min-height: 100vh; }
.header {
  display: flex;
  align-items: center;
  gap: 24px;
  border-bottom: 1px solid #ebeef5;
}
.title { font-weight: 600; white-space: nowrap; }
.menu { flex: 1; }
.who { display: flex; align-items: center; gap: 6px; white-space: nowrap; font-size: 14px; }
</style>
