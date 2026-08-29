<script setup lang="ts">
import { ref, computed } from 'vue'

// TODO: 待後端 Swagger 完成後，改成 orval 產生的 scheduleApi.getWeeklySchedule
interface ScheduleSlot {
  date: string
  time: string
  doctorName: string
  status: 'available' | 'booked'
}

const weekStart = ref(new Date())
const slots = ref<ScheduleSlot[]>([])

const weekDays = computed(() => {
  const days: string[] = []
  const start = new Date(weekStart.value)
  start.setDate(start.getDate() - start.getDay())
  for (let i = 0; i < 7; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    days.push(d.toISOString().slice(0, 10))
  }
  return days
})

function slotsForDay(day: string) {
  return slots.value.filter((s) => s.date === day)
}
</script>

<template>
  <div class="schedule-page">
    <h2>醫師班表（週檢視）</h2>
    <el-row :gutter="8">
      <el-col v-for="day in weekDays" :key="day" :span="24 / 7">
        <el-card shadow="hover">
          <template #header>{{ day }}</template>
          <div v-if="slotsForDay(day).length === 0" class="empty">尚無班表資料</div>
          <div v-for="slot in slotsForDay(day)" :key="slot.time" class="slot">
            <el-tag :type="slot.status === 'available' ? 'success' : 'info'">
              {{ slot.time }} {{ slot.doctorName }}
            </el-tag>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<style scoped>
.schedule-page {
  padding: 24px;
}
.empty {
  color: #909399;
  font-size: 13px;
}
.slot {
  margin-bottom: 6px;
}
</style>
