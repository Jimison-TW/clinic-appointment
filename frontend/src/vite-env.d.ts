/// <reference types="vite/client" />

// 讓 import.meta.env.VITE_API_BASE_URL 有型別。
// 沒有這段的話 TS 只知道它是 string | undefined 之外的 any，
// 打錯變數名（VITE_API_BASE_UR）也不會被抓到。
interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
