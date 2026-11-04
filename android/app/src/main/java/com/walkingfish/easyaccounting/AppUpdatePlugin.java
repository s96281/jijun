package com.walkingfish.easyaccounting;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.Log;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * 輕鬆記帳 Android 應用程式自動下載與更新插件
 *
 * 支援功能：
 * 1. 取得目前應用程式版本號、內部建置碼與裝置支援架構 (ABI)
 * 2. 檢查與導向「允許安裝未知應用程式」權限設定頁
 * 3. 背景執行緒串流下載 APK，支援 GitHub Release 多層重導向與即時進度廣播
 * 4. 透過 FileProvider 呼叫系統 PackageInstaller 進行覆蓋安裝 (In-place Upgrade)
 * 5. 支援由系統預設外部瀏覽器打開下載連結作為安全兜底
 */
@CapacitorPlugin(name = "AppUpdate")
public class AppUpdatePlugin extends Plugin {
    private static final String TAG = "AppUpdatePlugin";
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private volatile boolean isCancelled = false;

    @PluginMethod
    public void getAppInfo(PluginCall call) {
        try {
            Context context = getContext();
            PackageManager pm = context.getPackageManager();
            PackageInfo pInfo = pm.getPackageInfo(context.getPackageName(), 0);

            JSObject ret = new JSObject();
            ret.put("versionName", pInfo.versionName);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                ret.put("versionCode", pInfo.getLongVersionCode());
            } else {
                ret.put("versionCode", pInfo.versionCode);
            }
            ret.put("packageName", context.getPackageName());

            JSArray abisArray = new JSArray();
            for (String abi : Build.SUPPORTED_ABIS) {
                abisArray.put(abi);
            }
            ret.put("supportedAbis", abisArray);

            boolean canInstall = true;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                canInstall = pm.canRequestPackageInstalls();
            }
            ret.put("canRequestPackageInstalls", canInstall);

            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "取得應用程式資訊失敗", e);
            call.reject("無法取得應用程式資訊: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void canRequestPackageInstalls(PluginCall call) {
        JSObject ret = new JSObject();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ret.put("value", getContext().getPackageManager().canRequestPackageInstalls());
        } else {
            ret.put("value", true);
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void openInstallPermissionSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
                intent.setData(Uri.parse("package:" + getContext().getPackageName()));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
                call.resolve();
            } catch (Exception e) {
                Log.e(TAG, "開啟安裝權限設定頁失敗", e);
                call.reject("無法開啟設定頁面: " + e.getMessage(), e);
            }
        } else {
            call.resolve();
        }
    }

    @PluginMethod
    public void openInBrowser(PluginCall call) {
        String urlString = call.getString("url");
        if (urlString == null || urlString.trim().isEmpty()) {
            call.reject("缺少下載網址 (url)");
            return;
        }

        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(urlString));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            Log.e(TAG, "啟動系統外部瀏覽器失敗: " + e.getMessage(), e);
            call.reject("啟動系統外部瀏覽器失敗: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void cancelDownload(PluginCall call) {
        isCancelled = true;
        call.resolve();
    }

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String urlString = call.getString("url");
        if (urlString == null || urlString.trim().isEmpty()) {
            call.reject("缺少下載網址 (url)");
            return;
        }

        String version = call.getString("version");
        isCancelled = false;

        executor.execute(() -> {
            HttpURLConnection connection = null;
            InputStream in = null;
            FileOutputStream out = null;
            File apkFile = null;

            try {
                Context context = getContext();
                File cacheDir = context.getExternalCacheDir() != null ? context.getExternalCacheDir() : context.getCacheDir();
                File updateDir = new File(cacheDir, "updates");
                if (!updateDir.exists()) {
                    updateDir.mkdirs();
                }

                String safeVer = (version != null && !version.trim().isEmpty())
                        ? version.replaceAll("[^a-zA-Z0-9.-]", "_")
                        : String.valueOf(System.currentTimeMillis());
                String fileName = "easy-accounting-update-" + safeVer + ".apk";
                apkFile = new File(updateDir, fileName);
                if (apkFile.exists()) {
                    apkFile.delete();
                }

                // 處理 HTTP 重定向 (GitHub Releases 轉址至 AWS S3 / CDN)
                String currentUrl = urlString;
                int redirectCount = 0;
                while (redirectCount < 7) {
                    URL url = new URL(currentUrl);
                    connection = (HttpURLConnection) url.openConnection();
                    connection.setInstanceFollowRedirects(true);
                    connection.setConnectTimeout(20000);
                    connection.setReadTimeout(30000);
                    connection.setRequestProperty("User-Agent", "EasyAccounting-Android-Updater");
                    connection.connect();

                    int code = connection.getResponseCode();
                    if (code == HttpURLConnection.HTTP_MOVED_PERM
                            || code == HttpURLConnection.HTTP_MOVED_TEMP
                            || code == HttpURLConnection.HTTP_SEE_OTHER
                            || code == 307
                            || code == 308) {
                        String location = connection.getHeaderField("Location");
                        connection.disconnect();
                        if (location == null || location.isEmpty()) {
                            throw new IOException("伺服器重定向但未提供 Location 標頭");
                        }
                        URL base = new URL(currentUrl);
                        URL next = new URL(base, location);
                        currentUrl = next.toExternalForm();
                        redirectCount++;
                    } else if (code == HttpURLConnection.HTTP_OK) {
                        break;
                    } else {
                        connection.disconnect();
                        throw new IOException("HTTP 請求失敗 (" + code + " " + connection.getResponseMessage() + ")");
                    }
                }

                long totalBytes = connection.getContentLengthLong();
                long downloadedBytes = 0;
                in = new BufferedInputStream(connection.getInputStream(), 16384);
                out = new FileOutputStream(apkFile);
                byte[] buffer = new byte[16384];
                int bytesRead;
                long lastNotifyTime = 0;

                while ((bytesRead = in.read(buffer)) != -1) {
                    if (isCancelled) {
                        try {
                            in.close();
                            out.close();
                        } catch (Exception ignored) {}
                        if (apkFile.exists()) {
                            apkFile.delete();
                        }
                        call.reject("下載已由使用者取消");
                        return;
                    }
                    out.write(buffer, 0, bytesRead);
                    downloadedBytes += bytesRead;

                    long now = System.currentTimeMillis();
                    if (now - lastNotifyTime > 120 || (totalBytes > 0 && downloadedBytes == totalBytes)) {
                        lastNotifyTime = now;
                        JSObject progressObj = new JSObject();
                        int percent = totalBytes > 0 ? (int) ((downloadedBytes * 100) / totalBytes) : -1;
                        progressObj.put("progress", percent);
                        progressObj.put("downloadedBytes", downloadedBytes);
                        progressObj.put("totalBytes", totalBytes);
                        notifyListeners("downloadProgress", progressObj);
                    }
                }

                out.flush();
                out.close();
                out = null;
                in.close();
                in = null;
                connection.disconnect();
                connection = null;

                if (apkFile.length() == 0) {
                    throw new IOException("下載的 APK 檔案大小為 0 位元組");
                }

                final File finalApkFile = apkFile;
                boolean installTriggered = false;
                try {
                    // 嘗試啟動系統 PackageInstaller 進行覆蓋安裝
                    triggerInstall(finalApkFile);
                    installTriggered = true;
                } catch (Exception installError) {
                    Log.w(TAG, "自動觸發覆蓋安裝失敗 (可能需使用者授予安裝權限): " + installError.getMessage());
                }

                JSObject result = new JSObject();
                result.put("success", true);
                result.put("filePath", finalApkFile.getAbsolutePath());
                result.put("installTriggered", installTriggered);
                call.resolve(result);
            } catch (Exception e) {
                Log.e(TAG, "更新下載或安裝失敗: " + e.getMessage(), e);
                try {
                    if (out != null) out.close();
                    if (in != null) in.close();
                    if (connection != null) connection.disconnect();
                    if (apkFile != null && apkFile.exists() && isCancelled) {
                        apkFile.delete();
                    }
                } catch (Exception ignored) {}
                call.reject("更新下載或安裝失敗: " + e.getMessage(), e);
            }
        });
    }

    @PluginMethod
    public void installApkFile(PluginCall call) {
        String filePath = call.getString("filePath");
        if (filePath == null || filePath.trim().isEmpty()) {
            call.reject("缺少 filePath");
            return;
        }

        File apkFile = new File(filePath);
        if (!apkFile.exists()) {
            call.reject("指定的 APK 檔案不存在: " + filePath);
            return;
        }

        try {
            triggerInstall(apkFile);
            JSObject res = new JSObject();
            res.put("success", true);
            call.resolve(res);
        } catch (Exception e) {
            Log.e(TAG, "啟動安裝程序失敗: " + e.getMessage(), e);
            call.reject("啟動安裝程序失敗: " + e.getMessage(), e);
        }
    }

    /**
     * 呼叫系統 PackageInstaller 啟動 APK 覆蓋安裝
     */
    private void triggerInstall(File apkFile) {
        mainHandler.post(() -> {
            try {
                Context context = getContext();
                String authority = context.getPackageName() + ".fileprovider";
                Uri apkUri = FileProvider.getUriForFile(context, authority, apkFile);

                Intent intent = new Intent(Intent.ACTION_VIEW);
                intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(intent);
            } catch (Exception e) {
                Log.e(TAG, "以主執行緒啟動安裝 Intent 失敗: " + e.getMessage(), e);
            }
        });
    }
}
