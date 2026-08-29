import { defineConfig } from 'orval'

// 待 Day 3 後端 API 完成、Swagger 可存取後，把 target 換成
// http://localhost:5000/swagger/v1/swagger.json，執行 `npm run api:gen`
export default defineConfig({
  clinicApi: {
    input: {
      target: 'http://localhost:5000/swagger/v1/swagger.json',
    },
    output: {
      mode: 'tags-split',
      target: 'src/api/generated',
      schemas: 'src/api/generated/models',
      client: 'axios',
      override: {
        mutator: {
          path: 'src/utils/http.ts',
          name: 'default',
        },
      },
    },
  },
})
