# 🚀 APK 打包完整指南

## 📋 三种打包方法

### 方法 1: 使用打包向导（最简单）⭐

```bash
# 双击运行
mobile\打包向导.bat
```

**优点**:
- ✅ 中文界面
- ✅ 交互式选择
- ✅ 自动检查环境
- ✅ 友好的错误提示

---

### 方法 2: 一键打包（快速）

```bash
# 双击运行
mobile\一键打包 APK.bat
```

**适合**: 已经配置好环境的用户

---

### 方法 3: 手动打包（灵活）

```bash
cd mobile\LanDiskMobile\android
gradlew assembleDebug
```

**适合**: 开发者和高级用户

---

## ⚠️ 常见问题解决方案

### 问题 1: Gradle 下载超时/失败

**症状**:
```
Exception in thread "main" java.lang.RuntimeException: Timeout ...
```

**解决方案 A - 使用国内镜像**（已配置）:

编辑 `android/build.gradle`:
```gradle
repositories {
    maven { url 'https://maven.aliyun.com/repository/google' }
    maven { url 'https://maven.aliyun.com/repository/public' }
    google()
    mavenCentral()
}
```

**解决方案 B - 手动下载 Gradle**:

1. 访问：https://services.gradle.org/distributions/gradle-8.6-all.zip
2. 下载到：`C:\Users\你的用户名\.gradle\wrapper\dists\`
3. 重新运行打包脚本

---

### 问题 2: SDK 路径未找到

**症状**:
```
SDK location not found. Define a valid SDK location with an ANDROID_HOME environment variable or by setting the sdk.dir path in your project's local.properties file.
```

**解决方案**:

创建或编辑 `android/local.properties`:
```properties
sdk.dir=C\:\\Users\\你的用户名\\AppData\\Local\\Android\\Sdk
```

**如何找到 SDK 路径**:
1. 打开 Android Studio
2. File → Settings → Appearance & Behavior → System Settings → Android SDK
3. 复制 "Android SDK Location" 的路径
4. 替换上面的路径（注意使用双反斜杠 \\）

---

### 问题 3: Java 环境问题

**症状**:
```
Error: Could not find or load main class org.gradle.launcher.GradleMain
```

**解决方案**:

1. **确认 Java 版本**: React Native 0.74 需要 Java 17
   ```bash
   java -version
   ```

2. **安装正确的 JDK**:
   - 下载地址：https://www.oracle.com/java/technologies/downloads/#java17
   - 或使用 OpenJDK

3. **设置 JAVA_HOME**:
   - 右键"此电脑" → 属性 → 高级系统设置 → 环境变量
   - 新建系统变量：
     ```
     变量名：JAVA_HOME
     变量值：C:\Program Files\Java\jdk-17
     ```

---

### 问题 4: 内存不足

**症状**:
```
java.lang.OutOfMemoryError: Java heap space
```

**解决方案**:

编辑 `android/gradle.properties`:
```properties
org.gradle.jvmargs=-Xmx4096m -XX:MaxPermSize=2048m
org.gradle.daemon=true
org.gradle.parallel=true
```

---

## 📦 完整的打包流程

### Step 1: 环境准备

```bash
# 检查 Node.js
node --version  # 应该显示 v16+

# 检查 npm
npm --version   # 应该显示 8+

# 检查 Java
java -version   # 应该显示 17+

# 检查 Android SDK (如果安装了 Android Studio)
# 应该在 C:\Users\你的用户名\AppData\Local\Android\Sdk
```

### Step 2: 安装依赖

```bash
cd mobile\LanDiskMobile
npm install --legacy-peer-deps
```

### Step 3: 清理旧文件

```bash
npx react-native clean
cd android
gradlew clean
```

### Step 4: 编译 APK

```bash
gradlew assembleDebug
```

### Step 5: 验证输出

```bash
# 检查文件是否存在
dir app\build\outputs\apk\debug\app-debug.apk

# 查看文件大小（应该约 30-50MB）
```

---

## 🎯 预期的编译输出

### 成功的编译日志

```
> Task :app:compileDebugJavaWithJavac
> Task :app:bundleDebugJsAndAssets
> Task :app:compressDebugAssets
> Task :app:processDebugResources
> Task :app:packageDebug
> Task :app:assembleDebug

BUILD SUCCESSFUL in 2m 15s
234 actionable tasks: 234 executed
```

### APK 文件信息

```
文件名：app-debug.apk
位置：android/app/build/outputs/apk/debug/
大小：约 30-50 MB
签名：Debug（未签名，仅用于测试）
```

---

## 📱 安装测试

### 传输到手机

**方法 A: USB 数据线**
1. 连接手机到电脑
2. 复制 APK 到手机存储
3. 在手机文件管理器中找到并安装

**方法 B: 微信/QQ**
1. 将 APK 发送到微信/QQ
2. 在手机上接收文件
3. 点击下载安装

**方法 C: 局域网共享**
1. 在电脑开启文件夹共享
2. 手机访问 `\\电脑 IP\共享文件夹`
3. 下载 APK 并安装

### 首次安装提示

如果手机提示"未知来源应用":
1. 点击"设置"
2. 允许"来自此来源的应用"
3. 返回继续安装

---

## 🔍 调试技巧

### 查看编译日志

```bash
cd android
gradlew assembleDebug --info
# 或更详细的日志
gradlew assembleDebug --debug
```

### 查看已安装的 APK

```bash
adb shell pm list packages | grep landisk
```

### 卸载测试版本

```bash
adb uninstall com.landisk
```

---

## 📊 编译时间参考

| 阶段 | 首次 | 后续 |
|------|------|------|
| 下载 Gradle | 2-5 分钟 | - |
| 下载依赖 | 3-5 分钟 | 30 秒 |
| 编译代码 | 2-3 分钟 | 30 秒 |
| 打包资源 | 1-2 分钟 | 20 秒 |
| **总计** | **8-15 分钟** | **2-3 分钟** |

---

## ✅ 成功清单

打包前检查:
- [ ] Node.js 已安装 (v16+)
- [ ] Java JDK 已安装 (v17+)
- [ ] Android SDK 已配置
- [ ] 网络连接正常
- [ ] 磁盘空间充足 (至少 5GB)

打包后验证:
- [ ] APK 文件生成
- [ ] 文件大小正常 (30-50MB)
- [ ] 可以传输到手机
- [ ] 可以正常安装
- [ ] 应用可以启动

---

## 🆘 需要帮助？

如果以上方法都失败了:

1. **查看详细日志**:
   ```bash
   gradlew assembleDebug --stacktrace
   ```

2. **搜索错误信息**:
   - Google/Bing 搜索错误关键字
   - 查看 React Native 官方文档
   - 查看 GitHub Issues

3. **重新创建项目**:
   ```bash
   npx @react-native-community/cli@latest init LanDiskMobile --version 0.74.0
   ```

---

**最后更新**: 2026-03-31  
**适用版本**: v1.1.0-beta
