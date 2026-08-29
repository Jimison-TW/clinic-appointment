<script setup lang="ts">
import { ref } from 'vue'

// TODO: 待後端完成後，改成 orval 產生的 adminApi.listAppointments
interface AppointmentRow {
  id: string
  patientName: string
  doctorName: string
  date: string
  time: string
  status: string
}

const appointments = ref<AppointmentRow[]>([])
const loading = ref(false)
</script>

<template>
  <div class="admin-page">
    <h2>後台管理（所有預約）</h2>
    <el-table :data="appointments" v-loading="loading" style="width: 100%">
      <el-table-column prop="date" label="日期" width="120" />
      <el-table-column prop="time" label="時段" width="100" />
      <el-table-column prop="doctorName" label="醫師" width="140" />
      <el-table-column prop="patientName" label="病患" width="140" />
      <el-table-column prop="status" label="狀態" />
      <el-table-column label="操作" width="120">
        <template #default>
          <el-button size="small" type="danger" text>取消預約</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-empty v-if="appointments.length === 0 && !loading" description="尚無預約資料" />
  </div>
</template>

<style scoped>
.admin-page {
  padding: 24px;
}
</style>
