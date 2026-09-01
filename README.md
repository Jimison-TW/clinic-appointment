# 診所預約管理系統

一套從資料庫設計開始、不依賴自動 CRUD 框架、逐層手工打造的全端練習專案。
後端 ASP.NET Core 8 + PostgreSQL，前端 Vue 3。

---

## ⚠️ 目前進度：只完成「JWT 認證授權」這條線

這個專案還在進行中。**目前已完成的是完整的認證授權流程（含前後端串接）**，
預約系統的核心業務功能（班表、時段、預約）尚未開始。

| 模組 | 狀態 |
|---|---|
| 資料庫設計（`users` / `departments` / `doctors` / `patients` / `refresh_tokens`） | ✅ 完成 |
| JWT 註冊、登入、Token 輪替、登出 | ✅ 完成 |
| 角色授權（`[Authorize(Roles = ...)]`） | ✅ 完成 |
| 前端登入、自動 refresh、依角色顯示選單 | ✅ 完成 |
| **班表 / 時段 / 預約（本專案的主題）** | ⬜ **尚未開始** |
| 預約衝突防護與併發測試 | ⬜ 尚未開始 |
| 部署、CI、自動化測試 | ⬜ 尚未開始 |

前端的「醫師班表」與「預約」兩頁目前是版面骨架，尚未接後端。

---

## 技術棧

| 層 | 技術 |
|---|---|
| 後端 | ASP.NET Core 8（Controller-based）、EF Core 8 + Npgsql、BCrypt.Net |
| 資料庫 | PostgreSQL 16 |
| 前端 | Vue 3（Composition API）、TypeScript、Pinia、Vue Router、Element Plus、Vite |
| 型別同步 | orval（從後端 Swagger 產生 TypeScript client） |

---

## 架構

```
┌─────────────────────────┐         ┌──────────────────────────┐
│  Vue 3 SPA  :5173       │         │  ASP.NET Core 8  :5080   │
│                         │  CORS   │                          │
│  Pinia auth store       │ ──────► │  UseCors                 │
│   · access token 在記憶體│         │  UseAuthentication (JWT) │
│   · refresh token 落地   │         │  UseAuthorization        │
│                         │         │                          │
│  axios interceptor      │         │  AuthController          │
│   · 401 → 自動 refresh   │         │  AdminController         │
│   · 併發收斂為單次       │         │           │              │
└─────────────────────────┘         └───────────┼──────────────┘
            ▲                                   ▼
            │ orval codegen              ┌──────────────┐
            └────── Swagger / OpenAPI ────│ PostgreSQL 16│
                                          └──────────────┘
```

---

## 認證授權怎麼運作

### 兩張 token，職責不同

| | Access Token | Refresh Token |
|---|---|---|
| 形式 | JWT（無狀態，伺服器不儲存） | 隨機亂數，資料庫只存 SHA-256 雜湊 |
| 壽命 | 15 分鐘 | 30 天 |
| 存放 | 前端**記憶體**（不進 localStorage） | 前端 localStorage（見下方「已知限制」） |
| 用途 | 每個請求的 `Authorization: Bearer` | 換一張新的 access token |

Access token 放記憶體的理由：localStorage 是同源任何 JS 都讀得到的空間，
token 被竊取後可以離線使用；放記憶體則需要攻擊者在使用者仍開著分頁時才取得。
代價是重新整理會遺失，因此開機時會用 refresh token 靜默換回一張。

### Token 輪替與重放偵測

每次 `/refresh` 都會把舊的 refresh token 標記為 `rotated` 並發一張新的。
若一張已作廢的 token 再次出現，視為外洩訊號，撤銷該使用者所有有效 token 並要求重新登入。

### 401 自動 refresh 與併發收斂

前端 axios 攔截器在收到 `401` 時自動換 token 並重送原請求（`403` 不觸發 —— 那是角色不足，換 token 無效）。

多個請求同時 401 時，若各自發起 refresh，第二個之後帶的都是已被輪替的舊 token，
會**觸發後端的重放偵測而導致使用者被強制登出**。因此攔截器做三層收斂：

1. **單一飛行** — 共用同一個 refresh Promise，後到的請求排隊等待
2. **請求閘門** — refresh 進行期間，新請求先等待，不帶已知失效的 token 出門
3. **版本戳記** — 401 返回時若 token 已被其他請求換新，直接重送而不重複 refresh

實測：5 個併發請求同時 401，只送出 1 次 `/refresh`。

### 前後端雙重角色檢查

前端路由守衛依角色決定選單與可進入的頁面，但**它只負責使用者體驗，不是安全機制** ——
前端程式碼在使用者的瀏覽器中，可被任意修改。

真正的防線是後端的 `[Authorize(Roles = "admin")]`，它比對的是**經簽章驗證後**的 JWT role claim。
即使前端狀態被竄改而進入後台頁面，API 仍會回 `403`，畫面拿不到任何資料。

---

## API 端點

| 方法 | 路徑 | 授權 | 說明 |
|---|---|---|---|
| POST | `/api/auth/register` | 匿名 | 註冊（角色固定為 `patient`，不從 request 取得） |
| POST | `/api/auth/login` | 匿名 | 登入，回傳兩張 token 與使用者資訊 |
| POST | `/api/auth/refresh` | 匿名 | 換新 token（含輪替與重放偵測） |
| POST | `/api/auth/logout` | 匿名 | 撤銷 refresh token |
| GET | `/api/auth/me` | 登入 | 取得目前使用者 |
| GET | `/api/admin/users` | **admin** | 全院帳號清單 |

角色定義集中於 `backend/ClinicApi.Api/Auth/Roles.cs`：`admin` / `doctor` / `receptionist` / `patient`。

---

## 資料庫

5 張表，schema 手寫於 `db/schema.sql`，並與 EF Core 產生的 migration 逐行比對過（`db/ef-initial.sql` 含比對註解）。

| 表 | 說明 |
|---|---|
| `users` | 帳號、密碼雜湊（BCrypt）、角色、登入失敗次數 |
| `refresh_tokens` | 只存雜湊；`expires_at` / `revoked_at` / `revoked_reason` / `replaced_by`（自我參照，構成輪替鏈） |
| `departments` | 科別 |
| `doctors` | 醫師（與 `users` 一對一） |
| `patients` | 病患（與 `users` 一對一），病歷號由資料庫發號 |

採 Code-First migration；手寫的 `schema.sql` 保留作為設計文件與驗收標準。

---

## 本機執行

### 需求

- .NET SDK 8.0
- Node.js 20+
- PostgreSQL 16

### 1. 資料庫

```bash
createdb clinic
```

### 2. 後端

```bash
cd backend/ClinicApi.Api

# 首次執行需安裝 EF Core CLI
dotnet tool install --global dotnet-ef --version 8.*

# 設定 JWT 簽章金鑰（存在 user-secrets，不會進版控）
dotnet user-secrets set "Jwt:Key" "$(openssl rand -base64 48)"

# 套用 migration
dotnet ef database update

dotnet run --launch-profile https
```

- Swagger UI：<https://localhost:7101/swagger>
- HTTP（前端呼叫的位址）：<http://localhost:5080>

⚠️ 連線字串位於 `appsettings.json` 的 `ConnectionStrings:ClinicDb`，
目前寫的是開發者本機的帳號（`Username=fish`），請改成你自己的 PostgreSQL 使用者。
（外部化為環境變數是待辦事項之一。）

### 3. 前端

```bash
cd frontend
npm install
npm run api:gen     # 從後端 Swagger 產生 TypeScript client（需後端已啟動）
npm run dev
```

開啟 <http://localhost:5173>

> 網址請使用 `localhost`。對瀏覽器而言 `localhost` 與 `127.0.0.1` 是不同的 origin，
> 兩者皆已加入後端 CORS 白名單，但 Vite 預設僅綁定 `localhost`。

### 4. 建立測試帳號

註冊端點只會發給 `patient` 角色（刻意設計，避免 over-posting）。
第一個管理員需要以 SQL 建立：

```bash
curl -X POST http://localhost:5080/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"account":"admin1","password":"Passw0rd!","name":"管理員"}'

psql -d clinic -c "update users set role='admin' where account='admin1';"
```

以 `patient` 登入只會看到「醫師班表 / 預約」；以 `admin` 登入會多出「後台管理」。

---

## 已知限制

- **Refresh token 目前存於 localStorage。** 較安全的做法是由後端以
  `httpOnly` + `Secure` + `SameSite` cookie 下發，使 JavaScript 無法讀取。
  改動牽涉後端改發 cookie、前端啟用 `withCredentials`、CORS 開啟 `AllowCredentials`
  並放棄萬用字元 header，尚未實作。
- Access token 為無狀態 JWT，登出僅撤銷 refresh token；
  已簽發的 access token 會持續有效至過期（最長 15 分鐘）。
- 連線字串與 CORS 允許來源目前寫在 `appsettings.json` / `Program.cs`，尚未外部化為環境變數，
  因此還不具備直接部署的條件。
- 尚無自動化測試與 CI。
- 尚未部署。

---

## Roadmap

1. 班表 / 時段 / 預約三張核心表的設計與實作
2. 預約衝突防護（部分唯一索引 + 併發測試）
3. Refresh token 改為 httpOnly cookie
4. xUnit 單元測試、Playwright E2E、GitHub Actions
5. Docker 化與部署
