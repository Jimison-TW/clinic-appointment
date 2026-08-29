<script setup lang="ts">
import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from './store/auth'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const showNav = computed(() => !route.meta.public)

function handleLogout() {
  auth.logout()
  router.push('/login')
}
</script>

<template>
  <el-container v-if="showNav" class="layout">
    <el-header class="header">
      <span class="title">診所預約管理系統</span>
      <el-menu mode="horizontal" :ellipsis="false" router :default-active="route.path" class="menu">
        <el-menu-item index="/schedule">醫師班表</el-menu-item>
        <el-menu-item index="/booking">預約</el-menu-item>
        <el-menu-item index="/admin">後台管理</el-menu-item>
      </el-menu>
      <el-button text @click="handleLogout">登出</el-button>
    </el-header>
    <el-main>
      <router-view />
    </el-main>
  </el-container>
  <router-view v-else />
</template>

<style scoped>
.layout {
  min-height: 100vh;
}
.header {
  display: flex;
  align-items: center;
  gap: 24px;
  border-bottom: 1px solid #ebeef5;
}
.title {
  font-weight: 600;
  white-space: nowrap;
}
.menu {
  flex: 1;
}
</style>
