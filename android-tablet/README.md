# 龟龟伴读 Android 平板版

原生 Android WebView 外壳，固定连接生产站点 `https://guiguibandu.online/`。账号、阅读进度和奖励仍保存在火山云数据库中。

## 发布规则

1. 在 `app/build.gradle` 同时递增 `versionCode` 和 `versionName`。
2. 使用保存在 `signing/signing.keystore` 的同一把密钥签名；更换密钥后旧应用将无法覆盖升级。
3. 执行 `./gradlew assembleRelease`。
4. 计算 APK 的 SHA-256，更新 `public/android/latest.json`。
5. 将 APK 和 `latest.json` 上传到火山云 `/android/` 路径。

应用菜单中的“检查更新”会读取 `latest.json`。发现更高的 `versionCode` 后，会下载 APK、核对 SHA-256，并交给安卓系统确认安装。首次更新时，用户需要允许“安装未知应用”。

## 本地构建

```bash
export JAVA_HOME="$(/usr/libexec/java_home -v 17)"
export ANDROID_HOME="$HOME/Library/Android/sdk"
./gradlew assembleRelease
```

签名配置文件 `signing.properties` 和密钥目录已加入 `.gitignore`，需要另行安全备份。
