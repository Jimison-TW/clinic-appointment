<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { AxiosError } from 'axios'
import { getAdmin } from '../../api/generated/admin/admin'
import type { AdminUserRow } from '../../api/generated/models'
import { refreshStats } from '../../utils/http'

// ⚠️ 這裡用的是 orval 產生的 client，它走 src/utils/http.ts 那個實例，
//    所以自動帶 Authorization、也吃得到 401 自動 refresh。
const adminApi = getAdmin()

const users = ref<AdminUserRow[]>([])
const loading = ref(false)

async function load() {
  loading.value = true
  try {
    users.value = await adminApi.getApiAdminUsers()
  } catch (error) {
    // ⚠️ 403 代表「後端認得你，但你不是 admin」。
    //    這正是「前端守衛被繞過時，後端仍然擋得住」的證據 ——
    //    使用者硬闖進這個畫面，也只會拿到 403 跟一個空表格。
    if (error instanceof AxiosError && error.response?.status === 403) {
      ElMessage.error('你的角色沒有權限查看後台資料（後端回 403）')
    } else {
      ElMessage.error('讀取失敗')
    }
  } finally {
    loading.value = false
  }
}

/**
 * 只給今天的驗證用：一次併發打 5 支需要授權的 API。
 * access token 過期時按下去，就能看到「5 個請求同時 401，
 * 但只打出 1 次 /refresh」—— 也就是併發收斂真的有生效。
 */
async function burst() {
  const before = refreshStats.calls
  await Promise.allSettled(Array.from({ length: 5 }, () => adminApi.getApiAdminUsers()))
  ElMessage.info(`5 個併發請求完成，期間實際打出 ${refreshStats.calls - before} 次 /refresh`)
  await load()
}

onMounted(load)
</script>

<template>
  <div class="admin-page">
    <h2>後台管理（全院帳號）</h2>
    <div class="bar">
      <el-button size="small" data-test="reload" @click="load">重新載入</el-button>
      <el-button size="small" type="warning" data-test="burst" @click="burst">
        併發測試：同時打 5 支
      </el-button>
      <span class="hint">實際 /refresh 次數：{{ refreshStats.calls }}</span>
    </div>
    <el-table :data="users" v-loading="loading" style="width: 100%" data-test="user-table">
      <el-table-column prop="id" label="ID" width="70" />
      <el-table-column prop="account" label="帳號" width="140" />
      <el-table-column prop="name" label="姓名" width="140" />
      <el-table-column prop="role" label="角色" width="140" />
      <el-table-column prop="lastLoginAt" label="最後登入" />
    </el-table>
    <el-empty v-if="users.length === 0 && !loading" description="沒有資料（或沒有權限）" />
  </div>
</template>

<style scoped>
.admin-page { padding: 24px; }
.bar { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.hint { color: #909399; font-size: 13px; }
</style>
