# Easy Accounting PostgreSQL Backup & Sync Server

輕鬆記帳的雲端備份與認證伺服器 — **PostgreSQL + Cloudflare Workers / Node.js**。

本伺服器提供安全的 REST API，作為前端 App（PWA / Android APK）與 PostgreSQL 資料庫之間的橋樑，處理帳號註冊、密碼雜湊驗證、Session 管理以及資料庫備份的加密存取與按需還原。

---

## API 端點

| Method   | Path                  | 說明                              | 認證需求 |
| -------- | --------------------- | --------------------------------- | :------: |
| `POST`   | `/api/auth/register`  | 使用者註冊 (建立帳號並回傳 Token) |    無    |
| `POST`   | `/api/auth/login`     | 使用者登入 (驗證密碼並回傳 Token) |    無    |
| `POST`   | `/api/auth/refresh`   | 展延 / 刷新 Session Token         | 需 Token |
| `POST`   | `/api/auth/logout`    | 登出 (銷毀資料庫 Session)         | 需 Token |
| `GET`    | `/api/auth/me`        | 取得當前登入者資訊                | 需 Token |
| `POST`   | `/api/backup`         | 上傳 / 建立雲端備份 (JSONB)       | 需 Token |
| `GET`    | `/api/backup`         | 取得使用者所有備份清單            | 需 Token |
| `GET`    | `/api/backup/:id`     | 下載單筆備份完整內容              | 需 Token |
| `DELETE` | `/api/backup/:id`     | 刪除指定備份                      | 需 Token |
| `GET`    | `/api/health`         | 服務與資料庫健康檢查              |    無    |

---

## 部署至 Cloudflare Workers（推薦）

專案已配置完整 `server/wrangler.toml` 與 `nodejs_compat` 支援：

### 1. 互動式一鍵部署（本地終端機）
在終端機中切換至 `server` 目錄並登入 Cloudflare：
```bash
cd server
npx wrangler login
npm run deploy
```
*瀏覽器彈出授權後，點擊 Allow 即可自動發布至 `https://easy-accounting-sync.<your-subdomain>.workers.dev`。*

### 2. CI/CD 或 API Token 部署
若有 Cloudflare API Token，可直接設定環境變數進行部署：
```bash
cd server
$env:CLOUDFLARE_API_TOKEN="your-api-token"
npm run deploy
```

---

## 本地開發與自架運行

### 1. 本地 Standalone 執行
```bash
cd server
npm start
# 預設在 http://localhost:8787 啟動，直連 PostgreSQL 資料庫
```

### 2. 根專案開發代理
在根目錄執行：
```bash
npm run dev
# Vite 開發伺服器已內建代理中間件，自動攔截 /api/* 請求直通 PostgreSQL
```
