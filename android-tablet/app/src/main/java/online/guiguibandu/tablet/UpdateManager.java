package online.guiguibandu.tablet;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

final class UpdateManager {
    private static final String UPDATE_MANIFEST = "https://guiguibandu.online/android/latest.json";
    private final Activity activity;
    private final DownloadManager downloads;
    private final SharedPreferences preferences;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private long activeDownload = -1;
    private Uri pendingInstallUri;
    private String expectedSha256 = "";

    private final BroadcastReceiver receiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (!DownloadManager.ACTION_DOWNLOAD_COMPLETE.equals(intent.getAction())) return;
            long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
            if (id == activeDownload) verifyAndInstall(id);
        }
    };

    UpdateManager(Activity activity) {
        this.activity = activity;
        downloads = (DownloadManager) activity.getSystemService(Context.DOWNLOAD_SERVICE);
        preferences = activity.getSharedPreferences("app_updates", Context.MODE_PRIVATE);
        activeDownload = preferences.getLong("download_id", -1);
        expectedSha256 = preferences.getString("sha256", "");
        IntentFilter filter = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
        if (Build.VERSION.SDK_INT >= 33) activity.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED);
        else activity.registerReceiver(receiver, filter);
        if (activeDownload >= 0) resumeCompletedDownload();
    }

    void checkForUpdates(boolean userInitiated) {
        if (userInitiated) Toast.makeText(activity, "正在火山云查找新版本…", Toast.LENGTH_SHORT).show();
        executor.execute(() -> {
            HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection) new URL(UPDATE_MANIFEST + "?t=" + System.currentTimeMillis()).openConnection();
                connection.setConnectTimeout(12_000);
                connection.setReadTimeout(12_000);
                connection.setRequestProperty("Accept", "application/json");
                if (connection.getResponseCode() != 200) throw new IllegalStateException("HTTP " + connection.getResponseCode());
                JSONObject json = new JSONObject(readAll(connection.getInputStream()));
                int latestCode = json.getInt("versionCode");
                String latestName = json.getString("versionName");
                String apkUrl = json.getString("apkUrl");
                String notes = json.optString("releaseNotes", "修复问题并带来新的龟龟功能。");
                String sha256 = json.optString("sha256", "").toLowerCase(Locale.ROOT);
                if (!apkUrl.startsWith("https://guiguibandu.online/")) throw new SecurityException("非法更新地址");
                activity.runOnUiThread(() -> {
                    if (latestCode <= BuildConfig.VERSION_CODE) {
                        Toast.makeText(activity, "已经是最新版本 " + BuildConfig.VERSION_NAME, Toast.LENGTH_LONG).show();
                    } else {
                        new AlertDialog.Builder(activity)
                            .setTitle("发现新版本 " + latestName)
                            .setMessage(notes + "\n\n下载完成后，安卓会请你确认安装。")
                            .setNegativeButton("稍后再说", null)
                            .setPositiveButton("下载更新", (dialog, which) -> download(apkUrl, latestName, sha256))
                            .show();
                    }
                });
            } catch (Exception error) {
                activity.runOnUiThread(() -> Toast.makeText(activity, "暂时无法检查更新，请稍后再试", Toast.LENGTH_LONG).show());
            } finally {
                if (connection != null) connection.disconnect();
            }
        });
    }

    private void download(String apkUrl, String versionName, String sha256) {
        expectedSha256 = sha256;
        DownloadManager.Request request = new DownloadManager.Request(Uri.parse(apkUrl));
        request.setTitle("龟龟伴读 " + versionName);
        request.setDescription("正在下载新版安装包");
        request.setMimeType("application/vnd.android.package-archive");
        request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
        request.setDestinationInExternalFilesDir(activity, "updates", "guiguibandu-" + versionName + ".apk");
        activeDownload = downloads.enqueue(request);
        preferences.edit().putLong("download_id", activeDownload).putString("sha256", expectedSha256).apply();
        Toast.makeText(activity, "已开始下载，可以继续使用龟龟伴读", Toast.LENGTH_LONG).show();
    }

    private void resumeCompletedDownload() {
        DownloadManager.Query query = new DownloadManager.Query().setFilterById(activeDownload);
        try (Cursor cursor = downloads.query(query)) {
            if (!cursor.moveToFirst()) {
                clearDownloadState();
                return;
            }
            int status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
            if (status == DownloadManager.STATUS_SUCCESSFUL) verifyAndInstall(activeDownload);
            else if (status == DownloadManager.STATUS_FAILED) clearDownloadState();
        }
    }

    private void verifyAndInstall(long downloadId) {
        DownloadManager.Query query = new DownloadManager.Query().setFilterById(downloadId);
        try (Cursor cursor = downloads.query(query)) {
            if (!cursor.moveToFirst()) return;
            int status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
            if (status != DownloadManager.STATUS_SUCCESSFUL) {
                clearDownloadState();
                Toast.makeText(activity, "更新包下载失败，请重新尝试", Toast.LENGTH_LONG).show();
                return;
            }
        }
        Uri uri = downloads.getUriForDownloadedFile(downloadId);
        if (uri == null) return;
        executor.execute(() -> {
            try {
                if (!expectedSha256.isEmpty() && !expectedSha256.equals(fileSha256(uri))) {
                    throw new SecurityException("更新包校验失败");
                }
                activity.runOnUiThread(() -> install(uri));
            } catch (Exception error) {
                clearDownloadState();
                activity.runOnUiThread(() -> Toast.makeText(activity, "更新包安全校验失败，已停止安装", Toast.LENGTH_LONG).show());
            }
        });
    }

    private void install(Uri uri) {
        pendingInstallUri = uri;
        if (Build.VERSION.SDK_INT >= 26 && !activity.getPackageManager().canRequestPackageInstalls()) {
            new AlertDialog.Builder(activity)
                .setTitle("允许安装龟龟更新")
                .setMessage("第一次更新时，需要在安卓设置中允许龟龟伴读安装新版。开启后返回这里，会继续安装。")
                .setNegativeButton("取消", null)
                .setPositiveButton("去设置", (dialog, which) -> activity.startActivity(
                    new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + activity.getPackageName()))))
                .show();
            return;
        }
        Intent install = new Intent(Intent.ACTION_VIEW)
            .setDataAndType(uri, "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        activity.startActivity(install);
        pendingInstallUri = null;
        clearDownloadState();
    }

    void resumePendingInstall() {
        if (pendingInstallUri != null && (Build.VERSION.SDK_INT < 26 || activity.getPackageManager().canRequestPackageInstalls())) {
            install(pendingInstallUri);
        }
    }

    private String fileSha256(Uri uri) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream input = new BufferedInputStream(activity.getContentResolver().openInputStream(uri))) {
            byte[] buffer = new byte[16_384];
            int count;
            while ((count = input.read(buffer)) >= 0) digest.update(buffer, 0, count);
        }
        StringBuilder result = new StringBuilder();
        for (byte value : digest.digest()) result.append(String.format(Locale.ROOT, "%02x", value));
        return result.toString();
    }

    private static String readAll(InputStream input) throws Exception {
        try (InputStream stream = input; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int count;
            while ((count = stream.read(buffer)) >= 0) output.write(buffer, 0, count);
            return output.toString(StandardCharsets.UTF_8.name());
        }
    }

    void close() {
        try { activity.unregisterReceiver(receiver); } catch (IllegalArgumentException ignored) { }
        executor.shutdownNow();
    }

    private void clearDownloadState() {
        activeDownload = -1;
        expectedSha256 = "";
        preferences.edit().remove("download_id").remove("sha256").apply();
    }
}
