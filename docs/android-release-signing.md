# Android Release 簽名金鑰管理與覆蓋更新指引

本文件詳細說明《輕鬆記帳》（`com.walkingfish.easyaccounting`）之 Android 發布簽名金鑰（Keystore）設定流程、覆蓋更新機制、GitHub Secrets 配置及安全備份規範。

---

## 一、 核心觀念：為何必須使用固定簽名金鑰？

在 Android 作業系統的安全機制中，應用程式的身份識別由 **應用程式套件名稱（Package Name / ApplicationId）** 與 **發布簽名金鑰憑證（Signing Certificate）** 共同決定：

1. **同金鑰覆蓋更新（Seamless Over-the-air Update）**：
   當使用者下載新版 APK 進行升級時，Android 系統會驗證新舊 APK 的簽名憑證是否完全相同。若一致，系統會在**完全保留使用者本地記帳資料（IndexedDB / SharedPreferences）**的狀態下完成更新。
2. **簽名不一致的嚴重後果**：
   若每次 CI/CD 構建時使用臨時或隨機生成的金鑰簽名，新版 APK 安裝時系統會回傳 `INSTALL_FAILED_UPDATE_INCOMPATIBLE`（安裝失敗：套件簽名與目前安裝版本不符）。使用者將被強制必須先「解除安裝舊版」才能安裝新版，導致本機尚未同步至雲端的記帳資料全部遺失！

---

## 二、 簽名金鑰規格

本專案正式 Release Keystore 採用具備最高相容性之 PKCS#12 規範：

- **金鑰演算法**：RSA 2048 位元
- **格式**：PKCS#12（副檔名 `.keystore` 或 `.jks`，Java 8～21+ 與 Android SDK 全版本通用）
- **金鑰別名 (Alias)**：`easyaccounting`
- **憑證有效年限**：10,000 天（約 27.4 年，有效期至 2054 年）
- **憑證主體 (DName)**：`CN=EasyAccounting, O=WalkingFish, C=TW`
- **憑證 SHA-256 簽名指紋**：
  `D6:7E:49:18:56:52:84:28:FB:12:AC:95:84:B1:69:A6:83:2C:EF:C2:BB:27:83:26:71:83:5F:86:EC:D6:F2:C5`

---

## 三、 GitHub Secrets 配置指引

為了讓 GitHub Actions CI/CD 在構建 Release APK/AAB 時自動進行固定金鑰簽署，必須在 GitHub 儲存庫設定以下 4 個 Repository Secrets：

### 步驟 1：進入 GitHub 儲存庫設定
1. 開啟 GitHub 專案頁面：`https://github.com/<owner>/<repo>`
2. 點擊上方 **Settings** 標籤
3. 在左側選單依序點擊 **Secrets and variables** -> **Actions**
4. 點擊綠色按鈕 **New repository secret**

### 步驟 2：新增以下 4 項 Secrets

| Secret 名稱 | 說明 | 範例值 |
| :--- | :--- | :--- |
| `ANDROID_KEYSTORE_BASE64` | `release.keystore` 檔案的 Base64 編碼字串（單行） | *(見下方匯出指令取得之長字串)* |
| `KEYSTORE_PASSWORD` | Keystore 金鑰庫密碼 | `your_keystore_password_here` |
| `KEY_ALIAS` | 金鑰別名 | `easyaccounting` |
| `KEY_PASSWORD` | 私鑰密碼（PKCS#12 格式通常與 Store 密碼相同） | `your_keystore_password_here` |

### 步驟 3：快速獲取 Base64 字串
於專案根目錄執行以下指令：
```bash
npm run keystore:export
```
終端機將印出格式化好的單行 Base64 字串與設定值，直接複製貼上至 GitHub Secret 即可。

若需將 Base64 獨立儲存為文字檔：
```bash
node scripts/manage-keystore.js export --saveBase64
```

---

## 四、 本地開發與手動建置

### 1. 自動管理腳本工具

專案已內建全自動金鑰管理腳本 `scripts/manage-keystore.js`，支援 `keytool` 與 `openssl` 雙引擎：

- **生成全新金鑰**：
  ```bash
  npm run keystore:generate
  ```
  *(支援 `--keysize 4096`、`--validity 10000`、`--password <自訂密碼>`)*
- **匯出 GitHub Secret**：
  ```bash
  npm run keystore:export
  ```
- **檢查金鑰憑證資訊與指紋**：
  ```bash
  npm run keystore:info
  ```

### 2. Gradle 本地自動簽名配置 (`keystore.properties`)

當執行 `npm run keystore:generate` 時，腳本會自動在 `android/` 目錄建立 `keystore.properties`：

```properties
storeFile=../release.keystore
storePassword=your_keystore_password_here
keyAlias=easyaccounting
keyPassword=your_keystore_password_here
```

專案的 `android/app/build.gradle` 已配置好 `signingConfigs.release`，優先順序如下：
1. `keystore.properties`（位於專案根目錄、`android/` 或 `android/app/`）
2. 環境變數 `KEYSTORE` / `STOREPASS` / `KEYALIAS` / `KEYPASS`
3. 根目錄之 `release.keystore`

因此，在本地終端機執行：
```bash
cd android
./gradlew assembleRelease
```
產出的 APK（如 `android/app/build/outputs/apk/release/app-universal-release.apk`）即會被**自動簽署**完成，可直接安裝至實機測試覆蓋更新。

---

## 五、 CI/CD 簽名安全防護機制

在 `.github/workflows/release.yml` 中已實施嚴格的防呆與安全檢查：

1. **禁止靜默動態隨機金鑰**：
   若儲存庫未設定 `ANDROID_KEYSTORE_BASE64` 且專案中無固定的 `release.keystore`，CI 建置將直接報錯中止（`exit 1`），**絕不會**自動生成丟棄式隨機金鑰，徹底杜絕產出無效簽名 APK 的風險。
2. **自動驗證與指紋稽核**：
   在發布前，工作流程會呼叫 Android SDK 的 `apksigner verify --verbose --print-certs`，在 GitHub Actions 執行記錄中完整印出簽名者的 SHA-256、SHA-1 與 MD5 憑證指紋，方便隨時進行稽核與比對。

---

## 六、 金鑰安全與災難復原備份規範

> [!CAUTION]
> **私鑰遺失即等同失去該應用的升級權限！**
> Android 系統無法透過任何後門或技術手段重設已安裝應用的簽名憑證。一旦金鑰遺失，所有已安裝的使用者都無法再接收任何覆蓋更新。

請務必遵守以下保管規範：
1. **多重離線備份**：
   將 `release.keystore` 檔案與其密碼分別備份至：
   - 加密的密碼庫（例如 1Password, Bitwarden, KeePass 等之安全附件區）
   - 實體離線隨身碟（存放在安全防潮保險箱）
2. **嚴禁提交至 Git 公開儲存庫**：
   - 專案 `.gitignore` 已預先設定排除 `*.keystore`、`*.jks`、`*.p12`、`keystore.properties`。
   - 團隊成員提交程式碼前請務必確認 `git status` 未包含任何金鑰實體或明文密碼檔案。
