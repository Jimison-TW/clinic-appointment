import { defineConfig } from 'orval'

// orval：讀後端的 Swagger（OpenAPI）文件，產生型別 + 呼叫函式。
//
// 前端對應物：這就是「後端型別的 npm i @types/xxx」，
// 差別是它不是別人手寫維護的，而是從後端的真實 schema 自動生出來的 ——
// 後端改了 DTO，這裡重跑一次就會編譯錯誤，不會等到 runtime 才炸。
//
// ⚠️ 跑 npm run api:gen 之前後端必須是「開著」的，
//    因為 target 是一個 http 位址，不是本機檔案。
export default defineConfig({
  clinicApi: {
    input: {
      // ⚠️ 原本寫 5000，但 launchSettings.json 的 http port 是 5080。
      //    5000 是 .NET 5/6 時代的預設值，模板換過了。
      target: 'http://localhost:5080/swagger/v1/swagger.json',
    },
    output: {
      mode: 'tags-split',
      target: 'src/api/generated',
      schemas: 'src/api/generated/models',
      client: 'axios',
      override: {
        // mutator = 產生出來的每一支 API 都改用「我們自己的 axios 實例」，
        // 而不是 orval 內建的裸 axios。
        // 這一行就是「自動 refresh 能不能生效」的關鍵 ——
        // 產生的程式碼會走進 src/utils/http.ts 的攔截器。
        // ⚠️ 這裡原本寫 name: 'default'，orval 會照字面產出
        //      import { default } from '../../../utils/http'
        //    —— default 是 JS 保留字，這行根本無法編譯，而且 orval 不會警告你。
        //    要指向 default export 必須用 default: true，orval 才會產出
        //      import customInstance from '../../../utils/http'
        mutator: {
          path: 'src/utils/http.ts',
          default: true,
        },
      },
    },
  },
})
