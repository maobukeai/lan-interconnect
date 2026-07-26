# ⚠️ APK 打包失败 - 缺少 Android SDK

## ❌ 错误原因

编译失败，因为系统未安装 **Android SDK**。

错误信息：
```
SDK location not found. Define a valid SDK location with an ANDROID_HOME environment variable
```

---

## ✅ 解决方案（三选一）

### 方案一：安装 Android Studio（推荐，完整功能）⭐

**步骤：**

1. **下载 Android Studio**
   - 官网：https://developer.android.com/studio
   - 或国内镜像：https://developer.android.google.cn/studio

2. **安装并配置**
   - 运行安装程序
   - 选择默认安装路径
   - 安装完成后启动 Android Studio

3. **安装 SDK**
   - 打开 Android Studio
   - Tools → SDK Manager
   - 勾选 "Android SDK Platform 34"
   - 勾选 "Build-Tools 34.0.0"
   - 点击 Apply 开始下载安装

4. **重新编译**
   ```bash
   cd C:\Users\20269\Desktop\LanDisk_Build\LanDiskMobile
   npm run build:apk
   ```

**优点**：官方完整工具链，适合长期开发  
**缺点**：需要下载约 2-3GB 文件

---

### 方案二：仅安装 Command Line Tools（轻量级）

**步骤：**

1. **下载 SDK 命令行工具**
   - https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip
   
2. **解压到合适位置**
   ```
   C:\Android\cmdline-tools\
   ```

3. **安装 SDK Platform**
   ```cmd
   cd C:\Android\cmdline-tools\bin
   sdkmanager --install "platforms;android-34" "build-tools;34.0.0"
   ```

4. **设置环境变量**
   - 新建系统变量 `ANDROID_HOME` = `C:\Android`
   - 将 `%ANDROID_HOME%\cmdline-tools\bin` 添加到 PATH

5. **创建 local.properties**
   
   在项目中创建文件 `mobile\LanDiskMobile\android\local.properties`：
   ```
   sdk.dir=C\:\\Android
   ```

6. **重新编译**
   ```bash
   cd C:\Users\20269\Desktop\LanDisk_Build\LanDiskMobile
   npm run build:apk
   ```

**优点**：只需几百 MB，无需 IDE  
**缺点**：配置稍复杂

---

### 方案三：使用 Expo Go（快速测试，无需编译）🚀

如果只是想快速测试应用，可以使用 Expo Go：

**步骤：**

1. **安装 Expo Go 应用到手机**
   - Android: https://play.google.com/store/apps/details?id=host.exp.exponent
   - iOS: https://apps.apple.com/app/expo-go/id982107779

2. **修改项目为 Expo 项目**（需要重构，不推荐当前使用）

**优点**：无需编译 APK，即时预览  
**缺点**：功能受限，需要保持网络连接，需要改造现有项目

---

## 🎯 我的建议

### 如果您想长期使用 React Native 开发：
→ **安装 Android Studio**（方案一）

### 如果只是偶尔打包一次：
→ **安装 Command Line Tools**（方案二）

### 如果只是快速测试功能：
→ **考虑使用其他已配置好的电脑** 或 **借用安装了 Android 环境的电脑**

---

## 📋 环境要求清单

| 组件 | 版本 | 必须性 |
|------|------|--------|
| Node.js | v18+ | ✅ 必需 |
| Java JDK | v17+ | ✅ 必需 |
| Android SDK | API 34 | ✅ 必需 |
| Build-Tools | 34.0.0 | ✅ 必需 |
| Android Studio | 任意版本 | ⭕ 可选（但推荐） |

---

## 🔧 快速检查脚本

创建一个批处理文件检查环境：

```batch
@echo off
echo 检查 Android 开发环境...
echo.

:: 检查 Node.js
node --version >nul 2>&1 && echo [✓] Node.js 已安装 || echo [✗] Node.js 未安装

:: 检查 Java
java -version >nul 2>&1 && echo [✓] Java 已安装 || echo [✗] Java 未安装

:: 检查 Android SDK
if defined ANDROID_HOME (
    echo [✓] ANDROID_HOME 已设置：%ANDROID_HOME%
) else (
    echo [✗] ANDROID_HOME 未设置
)

:: 检查 SDK 是否存在
if exist "%ANDROID_HOME%\platforms\android-34" (
    echo [✓] Android SDK Platform 34 已安装
) else (
    echo [✗] Android SDK Platform 34 未安装
)

pause
```

---

## 💡 安装后的步骤

安装完 Android SDK 后：

1. **设置环境变量**（如果未自动设置）
   - `ANDROID_HOME` = SDK 路径（例如 `C:\Users\你的用户名\AppData\Local\Android\Sdk`）

2. **验证安装**
   ```bash
   echo %ANDROID_HOME%
   dir %ANDROID_HOME%\platforms
   ```

3. **重新编译 APK**
   ```bash
   cd C:\Users\20269\Desktop\LanDisk_Build\LanDiskMobile
   npm run build:apk
   ```

---

## 📞 需要帮助？

如果您已经安装了 Android Studio 或 SDK 但仍然失败，请提供：

1. Android Studio 安装路径
2. `echo %ANDROID_HOME%` 的输出
3. 完整的错误日志

---

**最后更新**: 2026-04-01
