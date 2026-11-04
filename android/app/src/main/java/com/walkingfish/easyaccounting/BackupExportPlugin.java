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

import java.io.OutputStream;

/**
 * Exports a backup through Android's Storage Access Framework.
 *
 * ACTION_CREATE_DOCUMENT shows the system save dialog and grants this app
 * write access only to the document the user chooses. This works with scoped
 * storage and deliberately avoids requesting broad device-storage access.
 */
@CapacitorPlugin(name = "BackupExport")
public class BackupExportPlugin extends Plugin {
    @PluginMethod
    public void saveJson(PluginCall call) {
        String fileName = call.getString("fileName");
        String data = call.getString("data");
        if (fileName == null || fileName.trim().isEmpty() || data == null) {
            call.reject("缺少備份檔案資料");
            return;
        }

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
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.reject("使用者取消選擇儲存位置", "USER_CANCELED");
            return;
        }

        Uri uri = result.getData().getData();
        String encodedData = call.getString("data");
        if (uri == null || encodedData == null) {
            call.reject("無法取得儲存位置或備份資料");
            return;
        }

        try (OutputStream output = getContext().getContentResolver().openOutputStream(uri, "w")) {
            if (output == null) {
                call.reject("無法開啟選擇的儲存位置");
                return;
            }
            output.write(Base64.decode(encodedData, Base64.DEFAULT));
            output.flush();

            JSObject response = new JSObject();
            response.put("uri", uri.toString());
            call.resolve(response);
        } catch (Exception error) {
            call.reject("寫入備份檔案失敗: " + error.getMessage(), error);
        }
    }
}
