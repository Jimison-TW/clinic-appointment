<script setup lang="ts">
import { reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'

// TODO: 待後端完成後，改成 orval 產生的 bookingApi.createBooking
// 預約衝突（409）在這裡要接住並提示使用者換時段，對應 Day4 的 UNIQUE(doctor_id, slot_start)
const form = reactive({
  doctorId: '',
  date: '',
  time: '',
  note: '',
})

const submitting = ref(false)

async function handleSubmit() {
  submitting.value = true
  try {
    // await bookingApi.createBooking(form)
    ElMessage.success('預約成功（示意，尚未串接後端）')
  } catch (error: any) {
    if (error?.response?.status === 409) {
      ElMessage.error('這個時段剛好被別人搶先預約了，請換一個時段')
    } else {
      ElMessage.error('預約失敗，請稍後再試')
    }
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="booking-page">
    <h2>預約流程</h2>
    <el-form :model="form" label-width="80px" style="max-width: 480px" @submit.prevent="handleSubmit">
      <el-form-item label="醫師">
        <el-select v-model="form.doctorId" placeholder="選擇醫師" style="width: 100%">
          <el-option label="王醫師" value="doctor-1" />
          <el-option label="陳醫師" value="doctor-2" />
        </el-select>
      </el-form-item>
      <el-form-item label="日期">
        <el-date-picker v-model="form.date" type="date" style="width: 100%" />
      </el-form-item>
      <el-form-item label="時段">
        <el-time-select v-model="form.time" start="09:00" step="00:30" end="18:00" style="width: 100%" />
      </el-form-item>
      <el-form-item label="備註">
        <el-input v-model="form.note" type="textarea" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" :loading="submitting" native-type="submit">送出預約</el-button>
      </el-form-item>
    </el-form>
  </div>
</template>

<style scoped>
.booking-page {
  padding: 24px;
}
</style>
