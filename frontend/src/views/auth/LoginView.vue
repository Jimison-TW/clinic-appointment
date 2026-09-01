<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { AxiosError } from 'axios'
import { useAuthStore } from '../../store/auth'
import { API_BASE_URL } from '../../api/authClient'

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
      // ⚠️ 沒有 response = 瀏覽器根本沒把回應交給我們。兩種可能：後端沒開，或 CORS 沒過。
      //    把「我是誰」跟「我打去哪」直接印在畫面上 ——
      //    實際踩過的坑：Vite 的 5173 被占用時會「安靜地」換到 5174，
      //    網址列那個數字太容易忽略，而後端白名單只有 5173，
      //    於是每個請求都被擋，但錯誤訊息只寫 CORS，完全看不出是 port 換掉了。
      //    印出 origin 就能一眼比對它跟後端白名單是不是逐字相同。
      ElMessage.error(
        `連不上伺服器：${window.location.origin} → ${API_BASE_URL}\n` +
          `請確認 ① 後端有開 ② 這個 origin 在後端 CORS 白名單內`,
      )
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
