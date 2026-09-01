# 診所預約管理系統

由前端轉向後端的資料庫與系統設計練習專案
後端 ASP.NET Core 8 + PostgreSQL，前端 Vue 3。
目前僅提供local端執行啟動，後續完成後再部署到CloudFlare Page

---

## 快速開始（clone 下來在本機跑起來）

需求：.NET SDK 8.0、Node.js 20+、PostgreSQL 16。

```bash
# 1. 取得原始碼（完整功能在 test 分支）
git clone -b test git@github.com:Jimison-TW/clinic-appointment.git
cd clinic-appointment

# 2. 建資料庫
createdb clinic

# 3. 後端
cd backend/ClinicApi.Api
dotnet tool install --global dotnet-ef --version 8.*        # 只需一次
dotnet user-secrets set "Jwt:Key" "$(openssl rand -base64 48)"
dotnet user-secrets set "ConnectionStrings:ClinicDb" \
  "Host=localhost;Port=5432;Database=clinic;Username=<你的 PostgreSQL 帳號>"
dotnet ef database update
dotnet run --launch-profile https                            # 開著別關

# 4. 前端（另開一個終端機，從 repo 根目錄出發）
cd frontend
npm install
npm run dev
```

開 <http://localhost:5173> 會看到登入頁。
⚠️ **前端目前沒有註冊頁**（只有登入），第一個帳號要用 `curl` 打後端的 `/api/auth/register` 建立，
請照下面「[建立測試帳號](#4-建立測試帳號)」操作 —— 那一段同時也會把角色改成 `admin`，
才看得到「後台管理」選單。

幾個 clone 下來一定會遇到的點：

- **分支**：`main` 還停在資料庫設計階段，認證授權那條線在 `test`。直接 `git clone` 不加 `-b test` 會看不到成果。
- **連線字串**：`appsettings.json` 裡寫的是開發者本機的帳號（`Username=fish`）。用上面的 `dotnet user-secrets` 覆蓋掉即可，**不用改動版控裡的檔案**（user-secrets 的優先序高於 `appsettings.json`）。
- **JWT 金鑰**沒設定的話後端會直接啟動失敗並提示指令 —— 這是刻意的，金鑰不進版控。
- **不需要跑 `npm run api:gen`**：orval 產生的 TypeScript client 已經進版控。只有在後端 DTO 改動後才需要重跑，而且重跑時後端必須是開著的。
- 網址請用 `localhost` 而不是 `127.0.0.1`（原因見下方「前端」一節）。

**只想看 API、不想跑前端**：做完步驟 1–3 就好，直接開 Swagger UI <https://localhost:7101/swagger>，
用 `/api/auth/register` → `/api/auth/login` 拿 token，按右上角 Authorize 貼上後即可打需要授權的端點。

詳細說明與逐步解釋見下方「[本機執行](#本機執行)」。

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

# 設定資料庫連線字串（見下方 ⚠️，要在 migration 之前設好）

# 套用 migration
dotnet ef database update

dotnet run --launch-profile https
```

- Swagger UI：<https://localhost:7101/swagger>
- HTTP（前端呼叫的位址）：<http://localhost:5080>

⚠️ 連線字串位於 `appsettings.json` 的 `ConnectionStrings:ClinicDb`，
目前寫的是開發者本機的帳號（`Username=fish`）。請改成你自己的 PostgreSQL 使用者 ——
建議用 user-secrets 覆蓋，不要動到版控裡的檔案：

```bash
dotnet user-secrets set "ConnectionStrings:ClinicDb" \
  "Host=localhost;Port=5432;Database=clinic;Username=<你的帳號>"
```

（Development 環境下 user-secrets 的優先序高於 `appsettings.json`。
真正外部化為環境變數仍是待辦事項之一。）

### 3. 前端

```bash
cd frontend
npm install
npm run dev

# 只有在後端 DTO 改動後才需要重跑（產生的 client 已進版控，且重跑時後端必須開著）
npm run api:gen     # 從後端 Swagger 產生 TypeScript client
```

開啟 <http://localhost:5173>

> 網址請使用 `localhost`。對瀏覽器而言 `localhost` 與 `127.0.0.1` 是不同的 origin，
> 兩者皆已加入後端 CORS 白名單，但 Vite 預設僅綁定 `localhost`。

### 4. 建立測試帳號

⚠️ 前端還沒有註冊頁，所以帳號一律從 API 建立。
註冊端點只會發給 `patient` 角色（刻意設計，避免 over-posting），
因此第一個管理員需要註冊完再以 SQL 改角色：

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
- **前端沒有註冊頁面**：後端的 `POST /api/auth/register` 已完成、orval 也產好了 client，
  但登入頁只有「登入」按鈕，沒有導向註冊的入口。目前只能用 `curl` 或 Swagger 建帳號。
- 尚無自動化測試與 CI。
- 尚未部署。

---

## Roadmap

1. 班表 / 時段 / 預約三張核心表的設計與實作
2. 預約衝突防護（部分唯一索引 + 併發測試）
3. Refresh token 改為 httpOnly cookie
4. xUnit 單元測試、Playwright E2E、GitHub Actions
5. Docker 化與部署
