#!/usr/bin/env node

/**
 * Android Release Keystore Management Utility
 * 
 * Provides automated generation, inspection, and GitHub Actions Secrets export
 * for Android application signing keystores (PKCS#12 / JKS).
 * Guarantees long-term APK signature consistency for over-the-air / side-loaded updates.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

// Default Keystore Configuration
const DEFAULTS = {
  alias: 'easyaccounting',
  keysize: 2048,
  validityDays: 10000, // ~27.4 years
  dname: 'CN=EasyAccounting, O=WalkingFish, C=TW',
  keystorePath: path.join(PROJECT_ROOT, 'release.keystore'),
  propertiesPath: path.join(PROJECT_ROOT, 'android', 'keystore.properties'),
};

/**
 * Locate keytool executable in environment or common directories.
 */
function findKeytool() {
  const checkCmd = (cmd) => {
    try {
      const res = spawnSync(cmd, ['-help'], { stdio: 'ignore' });
      return res.status === 0;
    } catch {
      return false;
    }
  };

  if (checkCmd('keytool')) return 'keytool';

  const javaHome = process.env.JAVA_HOME;
  if (javaHome) {
    const candidate = path.join(javaHome, 'bin', process.platform === 'win32' ? 'keytool.exe' : 'keytool');
    if (fs.existsSync(candidate)) return candidate;
  }

  // Windows common JDK / Android Studio paths
  if (process.platform === 'win32') {
    const candidates = [
      'C:\\Program Files\\Android\\Android Studio\\jbr\\bin\\keytool.exe',
      'C:\\Program Files\\Java',
      'C:\\Program Files\\Eclipse Adoptium',
      'C:\\Program Files\\Microsoft'
    ];

    for (const prefix of candidates) {
      if (prefix.endsWith('keytool.exe') && fs.existsSync(prefix)) return prefix;
      if (fs.existsSync(prefix)) {
        try {
          const dirs = fs.readdirSync(prefix);
          for (const d of dirs) {
            const kt = path.join(prefix, d, 'bin', 'keytool.exe');
            if (fs.existsSync(kt)) return kt;
          }
        } catch {
          // Ignore permission/read errors
        }
      }
    }
  }

  return null;
}

/**
 * Locate openssl executable in environment or common directories.
 */
function findOpenSSL() {
  const checkCmd = (cmd) => {
    try {
      const res = spawnSync(cmd, ['version'], { stdio: 'ignore' });
      return res.status === 0;
    } catch {
      return false;
    }
  };

  if (checkCmd('openssl')) return 'openssl';

  if (process.platform === 'win32') {
    const candidates = [
      'C:\\Program Files\\Git\\usr\\bin\\openssl.exe',
      'C:\\Program Files\\OpenSSL-Win64\\bin\\openssl.exe',
      'C:\\Program Files (x86)\\Git\\usr\\bin\\openssl.exe'
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
  }

  return null;
}

/**
 * Parse CLI arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';
  const options = {};

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      if (key.includes('=')) {
        const [k, v] = key.split('=');
        options[k] = v;
      } else if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        options[key] = args[++i];
      } else {
        options[key] = true;
      }
    }
  }

  return { command, options };
}

/**
 * Generate a random strong password
 */
function generateSecurePassword(length = 24) {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_#$';
  const bytes = crypto.randomBytes(length);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += charset[bytes[i] % charset.length];
  }
  return result;
}

/**
 * Generate Keystore
 */
function handleGenerate(options) {
  const targetPath = path.resolve(options.out || DEFAULTS.keystorePath);
  const alias = options.alias || DEFAULTS.alias;
  const keysize = parseInt(options.keysize || DEFAULTS.keysize, 10);
  const validity = parseInt(options.validity || DEFAULTS.validityDays, 10);
  const dname = options.dname || DEFAULTS.dname;
  const password = options.password || generateSecurePassword();

  if (fs.existsSync(targetPath) && !options.force) {
    console.error(`\x1b[31m[ERROR]\x1b[0m 金鑰庫檔案已存在: ${targetPath}`);
    console.error(`若重新生成將會遺失原先金鑰，導致舊版 APK 使用者無法覆蓋更新！`);
    console.error(`若確認要覆蓋，請加入 --force 參數。`);
    process.exit(1);
  }

  console.log(`\n========================================`);
  console.log(`  Android Release Keystore 生成精靈`);
  console.log(`========================================`);
  console.log(`目標路徑: ${targetPath}`);
  console.log(`金鑰別名 (Alias): ${alias}`);
  console.log(`演算法與長度: RSA ${keysize} 位元`);
  console.log(`有效期限: ${validity} 天 (約 ${(validity / 365).toFixed(1)} 年)`);
  console.log(`主體資訊 (DName): ${dname}`);

  const keytool = findKeytool();
  const openssl = findOpenSSL();

  let generatedVia = '';
  let sha256Fingerprint = '';

  if (keytool) {
    console.log(`\x1b[32m[OK]\x1b[0m 使用 keytool 工具: ${keytool}`);
    const keytoolArgs = [
      '-genkeypair',
      '-v',
      '-keystore', targetPath,
      '-alias', alias,
      '-keyalg', 'RSA',
      '-keysize', String(keysize),
      '-validity', String(validity),
      '-storetype', 'PKCS12',
      '-storepass', password,
      '-keypass', password,
      '-dname', dname
    ];

    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
    }

    const res = spawnSync(keytool, keytoolArgs, { stdio: 'inherit' });
    if (res.status !== 0) {
      console.error(`\x1b[31m[ERROR]\x1b[0m keytool 生成失敗，結束碼: ${res.status}`);
      process.exit(1);
    }
    generatedVia = 'keytool (PKCS12)';

    // Extract fingerprint
    try {
      const listRes = spawnSync(keytool, [
        '-list', '-v',
        '-keystore', targetPath,
        '-alias', alias,
        '-storepass', password
      ], { encoding: 'utf8' });
      const match = listRes.stdout.match(/SHA256:\s*([A-F0-9:]+)/i);
      if (match) sha256Fingerprint = match[1].trim();
    } catch {}
  } else if (openssl) {
    console.log(`\x1b[33m[NOTICE]\x1b[0m 未偵測到 keytool，改用 OpenSSL 產生 Java/Android 相容之 PKCS12 金鑰庫: ${openssl}`);
    const tempDir = path.dirname(targetPath);
    const tempKey = path.join(tempDir, `temp_key_${Date.now()}.pem`);
    const tempCert = path.join(tempDir, `temp_cert_${Date.now()}.pem`);

    const env = { ...process.env, MSYS_NO_PATHCONV: '1' };

    try {
      // 1. Generate RSA key
      const genKeyRes = spawnSync(openssl, ['genrsa', '-out', tempKey, String(keysize)], { stdio: 'pipe', env });
      if (genKeyRes.status !== 0) throw new Error(genKeyRes.stderr.toString());

      // 2. Generate self-signed certificate
      const reqRes = spawnSync(openssl, [
        'req', '-new', '-x509',
        '-key', tempKey,
        '-out', tempCert,
        '-days', String(validity),
        '-subj', `/${dname.replace(/,\s*/g, '/')}`
      ], { stdio: 'pipe', env });
      if (reqRes.status !== 0) throw new Error(reqRes.stderr.toString());

      // Get certificate SHA-256 fingerprint
      const fpRes = spawnSync(openssl, ['x509', '-in', tempCert, '-noout', '-fingerprint', '-sha256'], { encoding: 'utf8', env });
      const fpMatch = fpRes.stdout.match(/Fingerprint=([A-F0-9:]+)/i);
      if (fpMatch) sha256Fingerprint = fpMatch[1].trim();

      // 3. Export to PKCS12 with standard compatibility algorithms
      if (fs.existsSync(targetPath)) {
        fs.unlinkSync(targetPath);
      }

      const p12Res = spawnSync(openssl, [
        'pkcs12', '-export',
        '-out', targetPath,
        '-inkey', tempKey,
        '-in', tempCert,
        '-name', alias,
        '-passout', `pass:${password}`,
        '-certpbe', 'PBE-SHA1-3DES',
        '-keypbe', 'PBE-SHA1-3DES',
        '-macalg', 'sha1'
      ], { stdio: 'pipe', env });
      if (p12Res.status !== 0) throw new Error(p12Res.stderr.toString());

      generatedVia = 'OpenSSL (PKCS12 standard Java-compatible)';
    } finally {
      if (fs.existsSync(tempKey)) fs.unlinkSync(tempKey);
      if (fs.existsSync(tempCert)) fs.unlinkSync(tempCert);
    }
  } else {
    console.error(`\x1b[31m[ERROR]\x1b[0m 系統中未找到 keytool 亦未找到 openssl！請確認已安裝 JDK 或 Git (含 OpenSSL)。`);
    process.exit(1);
  }

  // Calculate file hash and base64
  const keystoreBuffer = fs.readFileSync(targetPath);
  const fileSha256 = crypto.createHash('sha256').update(keystoreBuffer).digest('hex');
  const base64 = keystoreBuffer.toString('base64');

  console.log(`\n\x1b[32m[SUCCESS]\x1b[0m 金鑰庫生成成功！`);
  console.log(`產生途徑: ${generatedVia}`);
  console.log(`金鑰檔案: ${targetPath} (${keystoreBuffer.length} bytes)`);
  console.log(`檔案 SHA-256: ${fileSha256}`);
  if (sha256Fingerprint) {
    console.log(`憑證簽署指紋 (Cert SHA-256): ${sha256Fingerprint}`);
  }

  // Create keystore.properties for local Gradle builds
  const propContent = [
    `# EasyAccounting Android Release Signing Properties`,
    `# Auto-generated on ${new Date().toISOString()}`,
    `# NOTICE: This file contains private credentials. DO NOT commit to public Git!`,
    `storeFile=${path.relative(path.join(PROJECT_ROOT, 'android'), targetPath).replace(/\\/g, '/')}`,
    `storePassword=${password}`,
    `keyAlias=${alias}`,
    `keyPassword=${password}`,
    ``
  ].join('\n');

  const propPath = options.propertiesOut || DEFAULTS.propertiesPath;
  const propDir = path.dirname(propPath);
  if (!fs.existsSync(propDir)) fs.mkdirSync(propDir, { recursive: true });
  fs.writeFileSync(propPath, propContent, 'utf8');
  console.log(`\x1b[32m[OK]\x1b[0m 已同步產生本機 Gradle 設定: ${propPath}`);

  // Print GitHub Secrets configuration
  printSecretsSummary({
    base64,
    password,
    alias,
    sha256Fingerprint,
    fileSha256
  });
}

/**
 * Export Base64 and GitHub Secrets instructions
 */
function handleExport(options) {
  const targetPath = path.resolve(options.file || options.in || DEFAULTS.keystorePath);
  if (!fs.existsSync(targetPath)) {
    console.error(`\x1b[31m[ERROR]\x1b[0m 找不到 Keystore 檔案: ${targetPath}`);
    process.exit(1);
  }

  const keystoreBuffer = fs.readFileSync(targetPath);
  const base64 = keystoreBuffer.toString('base64');
  const fileSha256 = crypto.createHash('sha256').update(keystoreBuffer).digest('hex');

  // Check if keystore.properties exists to extract password
  let password = options.password || 'android123';
  let alias = options.alias || DEFAULTS.alias;

  const propPath = options.properties || DEFAULTS.propertiesPath;
  if (fs.existsSync(propPath)) {
    const lines = fs.readFileSync(propPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('storePassword=')) password = trimmed.split('=')[1];
      if (trimmed.startsWith('keyAlias=')) alias = trimmed.split('=')[1];
    }
  }

  // Inspect cert fingerprint if possible
  let sha256Fingerprint = '';
  const keytool = findKeytool();
  const openssl = findOpenSSL();

  if (keytool) {
    try {
      const res = spawnSync(keytool, [
        '-list', '-v',
        '-keystore', targetPath,
        '-alias', alias,
        '-storepass', password
      ], { encoding: 'utf8' });
      const match = res.stdout.match(/SHA256:\s*([A-F0-9:]+)/i);
      if (match) sha256Fingerprint = match[1].trim();
    } catch {}
  } else if (openssl) {
    try {
      const env = { ...process.env, MSYS_NO_PATHCONV: '1' };
      const res = spawnSync(openssl, [
        'pkcs12', '-in', targetPath,
        '-nodes', '-passin', `pass:${password}`
      ], { encoding: 'utf8', env });
      if (res.stdout) {
        const x509Res = spawnSync(openssl, ['x509', '-noout', '-fingerprint', '-sha256'], {
          input: res.stdout,
          encoding: 'utf8',
          env
        });
        const match = x509Res.stdout.match(/Fingerprint=([A-F0-9:]+)/i);
        if (match) sha256Fingerprint = match[1].trim();
      }
    } catch {}
  }

  printSecretsSummary({
    base64,
    password,
    alias,
    sha256Fingerprint,
    fileSha256
  });

  if (options.saveBase64) {
    const b64Path = path.resolve(options.saveBase64 === true ? 'release.keystore.base64.txt' : options.saveBase64);
    fs.writeFileSync(b64Path, base64, 'utf8');
    console.log(`\x1b[32m[OK]\x1b[0m Base64 已儲存至: ${b64Path}`);
  }
}

/**
 * Display Keystore Information
 */
function handleInfo(options) {
  const targetPath = path.resolve(options.file || options.in || DEFAULTS.keystorePath);
  if (!fs.existsSync(targetPath)) {
    console.error(`\x1b[31m[ERROR]\x1b[0m 找不到 Keystore 檔案: ${targetPath}`);
    process.exit(1);
  }

  const keystoreBuffer = fs.readFileSync(targetPath);
  const fileSha256 = crypto.createHash('sha256').update(keystoreBuffer).digest('hex');

  let password = options.password;
  const propPath = options.properties || DEFAULTS.propertiesPath;
  if (!password && fs.existsSync(propPath)) {
    const lines = fs.readFileSync(propPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('storePassword=')) password = trimmed.split('=')[1];
    }
  }

  console.log(`\n========================================`);
  console.log(`  Android Keystore 檔案資訊`);
  console.log(`========================================`);
  console.log(`路徑: ${targetPath}`);
  console.log(`大小: ${keystoreBuffer.length} bytes`);
  console.log(`檔案 SHA-256: ${fileSha256}`);

  const keytool = findKeytool();
  const openssl = findOpenSSL();

  if (password && keytool) {
    try {
      const res = spawnSync(keytool, [
        '-list', '-v',
        '-keystore', targetPath,
        '-storepass', password
      ], { encoding: 'utf8' });
      console.log(`\n--- keytool 憑證清單 ---`);
      console.log(res.stdout);
    } catch (e) {
      console.warn(`無法使用 keytool 讀取: ${e.message}`);
    }
  } else if (password && openssl) {
    try {
      const env = { ...process.env, MSYS_NO_PATHCONV: '1' };
      const p12 = spawnSync(openssl, [
        'pkcs12', '-in', targetPath,
        '-nodes', '-passin', `pass:${password}`
      ], { encoding: 'utf8', env });
      if (p12.stdout) {
        const cert = spawnSync(openssl, ['x509', '-noout', '-text', '-fingerprint', '-sha256'], {
          input: p12.stdout,
          encoding: 'utf8',
          env
        });
        console.log(`\n--- OpenSSL 憑證資訊 ---`);
        console.log(cert.stdout);
      }
    } catch (e) {
      console.warn(`無法使用 openssl 讀取: ${e.message}`);
    }
  } else if (!password) {
    console.log(`\x1b[33m[TIP]\x1b[0m 提供 --password 或在 android/keystore.properties 中配置密碼即可檢視憑證細節。`);
  }
}

/**
 * Print Formatted GitHub Secrets Output
 */
function printSecretsSummary({ base64, password, alias, sha256Fingerprint, fileSha256 }) {
  console.log(`\n======================================================`);
  console.log(`  GitHub Actions CI/CD Secrets 設定指引`);
  console.log(`======================================================`);
  console.log(`請前往 GitHub Repository:`);
  console.log(`  Settings -> Secrets and variables -> Actions -> New repository secret\n`);

  console.log(`\x1b[36m1. Secret 名稱:\x1b[0m ANDROID_KEYSTORE_BASE64`);
  console.log(`\x1b[36m   Secret 內容:\x1b[0m (請完整複製以下單行字串，共 ${base64.length} 個字元)`);
  console.log(`------------------------------------------------------`);
  console.log(base64);
  console.log(`------------------------------------------------------\n`);

  console.log(`\x1b[36m2. Secret 名稱:\x1b[0m KEYSTORE_PASSWORD`);
  console.log(`\x1b[36m   Secret 內容:\x1b[0m ${password}\n`);

  console.log(`\x1b[36m3. Secret 名稱:\x1b[0m KEY_ALIAS`);
  console.log(`\x1b[36m   Secret 內容:\x1b[0m ${alias}\n`);

  console.log(`\x1b[36m4. Secret 名稱:\x1b[0m KEY_PASSWORD`);
  console.log(`\x1b[36m   Secret 內容:\x1b[0m ${password}\n`);

  console.log(`------------------------------------------------------`);
  if (sha256Fingerprint) {
    console.log(`憑證簽署 SHA-256 指紋: ${sha256Fingerprint}`);
  }
  console.log(`金鑰檔案 SHA-256: ${fileSha256}`);
  console.log(`\x1b[33m[重要警示]\x1b[0m 請妥善備份 release.keystore 與上述密碼！`);
  console.log(`若此金鑰遺失，將導致現有使用者無法升級覆蓋安裝，必須強制解除安裝導致本機記帳資料遺失！`);
  console.log(`======================================================\n`);
}

/**
 * Print Help
 */
function printHelp() {
  console.log(`
Android Release Keystore 管理工具

使用方式:
  node scripts/manage-keystore.js <command> [options]
  npm run keystore:generate [-- options]
  npm run keystore:export [-- options]
  npm run keystore:info [-- options]

指令 (Commands):
  generate            生成全新正式 Android 簽名 Keystore (RSA 2048/4096, 10000天有效)
  export              讀取現有 Keystore 並輸出 GitHub Secrets Base64 與設定值
  info                檢視 Keystore 檔案規格、SHA-256 與憑證指紋
  help                顯示此說明訊息

選項 (Options for generate):
  --out <path>        指定金鑰輸出路徑 (預設: ./release.keystore)
  --alias <name>      指定金鑰別名 (預設: easyaccounting)
  --keysize <bits>    RSA 金鑰長度 (2048 或 4096，預設: 2048)
  --validity <days>   憑證有效天數 (預設: 10000 天，約 27.4 年)
  --password <pwd>    自訂金鑰庫密碼 (若未指定將自動生成 24 位高強度安全密碼)
  --force             若檔案已存在則強制覆蓋 (請謹慎使用)

選項 (Options for export / info):
  --file <path>       指定 Keystore 檔案路徑 (預設: ./release.keystore)
  --password <pwd>    指定金鑰庫密碼
  --saveBase64 [path] 將 Base64 單獨儲存為文字檔 (預設: release.keystore.base64.txt)
`);
}

// Main dispatch
const { command, options } = parseArgs();

switch (command) {
  case 'generate':
  case 'gen':
  case 'create':
    handleGenerate(options);
    break;
  case 'export':
  case 'base64':
    handleExport(options);
    break;
  case 'info':
  case 'show':
  case 'inspect':
    handleInfo(options);
    break;
  case 'help':
  default:
    printHelp();
    break;
}
