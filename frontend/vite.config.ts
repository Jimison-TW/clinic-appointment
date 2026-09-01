import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    AutoImport({
      resolvers: [ElementPlusResolver()],
    }),
    Components({
      resolvers: [ElementPlusResolver()],
    }),
  ],
  server: {
    port: 5173,
    // ⚠️ 沒有 strictPort 的話，5173 被占用時 Vite 會「安靜地」改用 5174，
    //    而後端的 CORS 白名單只有 5173 -> 前端每一個請求都被擋，
    //    你卻只會看到 CORS 紅字，不會意識到自己開在別的 port。
    //    寧可啟動就失敗，也不要拿一個註定被擋的 port 繼續跑。
    strictPort: true,
    // ⚠️ 這裡原本有一段 server.proxy 把 /api 轉去後端。
    //    proxy 的效果是：瀏覽器以為自己只在打 localhost:5173（同源），
    //    真正的跨網域發生在 Vite 的 node 程序裡 —— 而 node 沒有同源政策。
    //    也就是說，走 proxy 等於「把 CORS 藏起來」，開發時一路順暢，
    //    上測試機的那一天才第一次遇到 CORS，而且是在最不想 debug 的時候。
    //
    //    這次刻意拿掉，讓前端真的跨網域打 http://localhost:5080，
    //    CORS 設錯就當場炸 —— 讓真實錯誤當老師。
    //    （順帶一提，port 也從 5000 改成 5080，原本那個 port 是錯的。）
  },
})
