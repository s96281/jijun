package com.walkingfish.easyaccounting;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Exports a backup through Android's Storage Access Framework.
 *
 * ACTION_CREATE_DOCUMENT shows the system save dialog and grants this app
 * write access only to the document the user chooses. This works with scoped
 * storage and deliberately avoids requesting broad device-storage access.
 */
@CapacitorPlugin(name = "BackupExport")
public class BackupExportPlugin extends Plugin {
    private final Map<String, File> preparedExports = new ConcurrentHashMap<>();

    @PluginMethod
    public void beginJsonExport(PluginCall call) {
        String fileName = call.getString("fileName");
        if (fileName == null || fileName.trim().isEmpty()) {
            call.reject("缺少備份檔案名稱");
            return;
        }

        try {
            String exportId = UUID.randomUUID().toString();
            File tempFile = File.createTempFile("easy-accounting-export-", ".json", getContext().getCacheDir());
            preparedExports.put(exportId, tempFile);

            JSObject response = new JSObject();
            response.put("exportId", exportId);
            call.resolve(response);
        } catch (Exception error) {
            call.reject("無法建立備份暫存檔", error);
        }
    }

    @PluginMethod
    public void appendJsonExportChunk(PluginCall call) {
        String exportId = call.getString("exportId");
        String data = call.getString("data");
        File tempFile = exportId == null ? null : preparedExports.get(exportId);
        if (tempFile == null || data == null) {
            call.reject("找不到備份暫存資料");
            return;
        }

        try (FileOutputStream output = new FileOutputStream(tempFile, true)) {
            output.write(Base64.decode(data, Base64.DEFAULT));
            call.resolve();
        } catch (Exception error) {
            removePreparedExport(exportId);
            call.reject("寫入備份暫存資料失敗", error);
        }
    }

    @PluginMethod
    public void savePreparedJsonExport(PluginCall call) {
        String exportId = call.getString("exportId");
        File tempFile = exportId == null ? null : preparedExports.get(exportId);
        if (tempFile == null || !tempFile.exists()) {
            call.reject("找不到可儲存的備份資料");
            return;
        }

        String fileName = call.getString("fileName", "記帳資料.json");
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/json");
        intent.putExtra(Intent.EXTRA_TITLE, fileName);
        startActivityForResult(call, intent, "handleSaveDocumentResult");
    }

    @ActivityCallback
    private void handleSaveDocumentResult(PluginCall call, ActivityResult result) {
        if (call == null) {
            return;
        }
        String exportId = call.getString("exportId");
        File tempFile = exportId == null ? null : preparedExports.get(exportId);
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            removePreparedExport(exportId);
            call.reject("使用者取消選擇儲存位置", "USER_CANCELED");
            return;
        }

        Uri uri = result.getData().getData();
        if (uri == null || tempFile == null) {
            removePreparedExport(exportId);
            call.reject("無法取得儲存位置或備份資料");
            return;
        }

        new Thread(() -> copyPreparedExport(call, exportId, tempFile, uri)).start();
    }

    @PluginMethod
    public void cancelPreparedJsonExport(PluginCall call) {
        removePreparedExport(call.getString("exportId"));
        call.resolve();
    }

    private void copyPreparedExport(PluginCall call, String exportId, File tempFile, Uri uri) {
        try (InputStream input = new FileInputStream(tempFile);
             OutputStream output = getContext().getContentResolver().openOutputStream(uri, "w")) {
            if (output == null) {
                throw new IllegalStateException("無法開啟選擇的儲存位置");
            }
            byte[] buffer = new byte[32 * 1024];
            int bytesRead;
            while ((bytesRead = input.read(buffer)) != -1) {
                output.write(buffer, 0, bytesRead);
            }
            output.flush();

            JSObject response = new JSObject();
            response.put("uri", uri.toString());
            call.resolve(response);
        } catch (Exception error) {
            call.reject("寫入備份檔案失敗: " + error.getMessage(), error);
        } finally {
            removePreparedExport(exportId);
        }
    }

    private void removePreparedExport(String exportId) {
        if (exportId == null) {
            return;
        }
        File tempFile = preparedExports.remove(exportId);
        if (tempFile != null && tempFile.exists() && !tempFile.delete()) {
            tempFile.deleteOnExit();
        }
    }
}
