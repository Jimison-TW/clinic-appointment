<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { AxiosError } from 'axios'
import { useAuthStore } from '../../store/auth'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

// ⚠️ 欄位名從 username 改成 account。
//    後端的 DTO 是 LoginRequest(string Account, string Password)，
//    送 { username: ... } 會讓 model binding 把 Account 綁成 null，
//    查不到人 -> 一律回 401「帳號或密碼錯誤」。
//    密碼打對也登不進去，而且錯誤訊息完全不會提示是欄位名錯了。
const form = reactive({ account: '', password: '' })
const loading = ref(false)

async function handleSubmit() {
  loading.value = true
  try {
    await auth.login(form.account, form.password)
    const redirect = (route.query.redirect as string) || '/schedule'
    router.push(redirect)
  } catch (error) {
    // ⚠️ 分開處理三種失敗，因為它們對使用者的意義完全不同：
    //    401        = 帳密錯（使用者該重打）
    //    沒有 response = 連不上 / CORS 被擋（使用者重打一百次也沒用）
    //    其他        = 伺服器爆了
    if (error instanceof AxiosError && !error.response) {
      ElMessage.error('連不上伺服器（可能是後端沒開，或 CORS 沒放行）')
    } else if (error instanceof AxiosError && error.response?.status === 401) {
      ElMessage.error('登入失敗，請確認帳號密碼')
    } else {
      ElMessage.error('伺服器發生錯誤，請稍後再試')
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <el-card class="login-card">
      <template #header>診所預約系統登入</template>
      <el-form :model="form" label-width="80px" @submit.prevent="handleSubmit">
        <el-form-item label="帳號">
          <el-input v-model="form.account" data-test="account" placeholder="請輸入帳號" />
        </el-form-item>
        <el-form-item label="密碼">
          <el-input
            v-model="form.password"
            data-test="password"
            type="password"
            placeholder="請輸入密碼"
            show-password
          />
        </el-form-item>
        <el-form-item>
          <el-button
            type="primary"
            data-test="submit"
            :loading="loading"
            native-type="submit"
            style="width: 100%"
          >
            登入
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<style scoped>
.login-page { display: flex; justify-content: center; align-items: center; height: 100vh; }
.login-card { width: 360px; }
</style>
