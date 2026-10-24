package ru.zamok.app;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.util.Log;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.util.List;

/**
 * Update helper for the JS layer: installs a downloaded APK through the system
 * package installer and opens links in the external browser.
 */
@CapacitorPlugin(name = "Update")
public class UpdatePlugin extends Plugin {

    private static final String TAG = "ZamokUpdate";

    @PluginMethod
    public void setSecureScreen(PluginCall call) {
        Boolean enabled = call.getBoolean("enabled", Boolean.TRUE);
        final boolean secure = enabled == null || enabled;
        android.app.Activity activity = getActivity();
        if (activity == null) {
            call.reject("Экран уже закрыт");
            return;
        }
        activity.runOnUiThread(() -> {
            android.view.Window window = activity.getWindow();
            if (secure) {
                window.addFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE);
            } else {
                window.clearFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE);
            }
            JSObject result = new JSObject();
            result.put(
                    "enabled",
                    (window.getAttributes().flags & android.view.WindowManager.LayoutParams.FLAG_SECURE) != 0
            );
            call.resolve(result);
        });
    }

    @PluginMethod
    public void getDeviceId(PluginCall call) {
        JSObject result = new JSObject();
        try {
            String id = android.provider.Settings.Secure.getString(
                    getContext().getContentResolver(),
                    android.provider.Settings.Secure.ANDROID_ID
            );
            result.put("deviceId", id == null ? "" : id);
        } catch (Exception error) {
            Log.e(TAG, "getDeviceId failed", error);
            result.put("deviceId", "");
        }
        call.resolve(result);
    }

    @PluginMethod
    public void install(PluginCall call) {
        String path = call.getString("path");
        if (path == null || path.isEmpty()) {
            call.reject("Не указан путь к файлу");
            return;
        }

        File file = new File(path);
        if (!file.exists()) {
            call.reject("Файл обновления не найден: " + path);
            return;
        }

        try {
            Uri uri = FileProvider.getUriForFile(
                    getContext(),
                    getContext().getPackageName() + ".fileprovider",
                    file
            );

            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            // No FLAG_ACTIVITY_NEW_TASK here: the installer must come to the
            // foreground on top of the app, otherwise it opens in a background
            // task and looks like nothing happened.
            intent.setClipData(android.content.ClipData.newRawUri("apk", uri));

            List<android.content.pm.ResolveInfo> handlers =
                    getContext().getPackageManager().queryIntentActivities(intent, 0);
            if (handlers == null || handlers.isEmpty()) {
                call.reject("Нет приложения для установки APK");
                return;
            }

            getActivity().startActivity(intent);
            Log.i(TAG, "Installer launched for " + path);
            call.resolve(new JSObject());
        } catch (ActivityNotFoundException error) {
            Log.e(TAG, "No installer found", error);
            call.reject("Системный установщик не найден");
        } catch (Exception error) {
            Log.e(TAG, "Install failed", error);
            call.reject("Не удалось запустить установщик: " + error.getMessage());
        }
    }

    @PluginMethod
    public void openUrl(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("Не указан адрес");
            return;
        }

        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getActivity().startActivity(intent);
            call.resolve(new JSObject());
        } catch (Exception error) {
            Log.e(TAG, "openUrl failed", error);
            call.reject("Не удалось открыть ссылку: " + error.getMessage());
        }
    }
}
