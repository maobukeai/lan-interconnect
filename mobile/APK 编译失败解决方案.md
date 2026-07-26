# 🔧 APK 编译失败解决方案

## ❌ 问题原因

编译失败的根本原因是：**项目路径包含中文字符** (`局域网互联`)

React Native 和 Gradle 在处理中文路径时会出现编码问题，导致 node 命令执行失败。

错误信息：
```
:ReactNative:Running '[node, C:\Users\20269\Desktop\？域网互联\mobile\LanDiskMobile\node_modules\@react-native-community\cli\build\bin.js, config]' command failed.
```

---

## ✅ 解决方案（三选一）

### 方案一：移动项目到英文路径（推荐）

将项目移动到纯英文路径下，例如：

```
C:\Projects\LanDisk\
D:\Dev\LanDisk\
```

**操作步骤：**

1. 关闭所有正在运行的相关程序
2. 将整个 `局域网互联` 文件夹移动到英文路径
3. 重新打开终端，进入新路径：
   ```bash
   cd C:\Projects\LanDisk\mobile\LanDiskMobile
   npm run build:apk
   ```

---

### 方案二：创建英文软链接（快速）

**以管理员身份运行 CMD**，执行：

```cmd
mklink /D C:\LanDisk "c:\Users\20269\Desktop\局域网互联"
```

然后编译：

```cmd
cd C:\LanDisk\mobile\LanDiskMobile
npm run build:apk
```

**或者双击运行：**
- `mobile\一键创建英文路径并编译.bat`

---

### 方案三：使用 Expo Go 快速测试（临时方案）

如果只需要快速测试应用，可以使用 Expo Go：

**步骤：**

1. 安装 Expo Go 应用到手机：
   - Android: https://play.google.com/store/apps/details?id=host.exp.exponent
   - iOS: https://apps.apple.com/app/expo-go/id982107779

2. 启动开发服务器：
   ```bash
   cd mobile\LanDiskMobile
   npm start
   ```

3. 扫描屏幕上的二维码即可在手机上运行应用

**优点：** 无需编译 APK，即时预览
**缺点：** 功能受限，需要保持网络连接

---

## 📦 编译成功后

APK 文件位置：

```
mobile\LanDiskMobile\android\app\build\outputs\apk\debug\app-debug.apk
```

**安装方法：**
- 直接复制到手机安装
- 通过 USB 传输到手机
- 使用 adb 安装：`adb install app-debug.apk`

---

## 🛠️ 环境要求检查清单

确保已安装以下工具：

- [ ] **Node.js** v18+ 
  - 检查：`node --version`
  
- [ ] **Java JDK** v17+
  - 检查：`java -version`
  
- [ ] **Android SDK** 或 **Android Studio**
  - 需要安装 Android SDK Platform 34
  - 需要安装 Build-Tools 34.0.0
  
- [ ] **环境变量**
  - `ANDROID_HOME` 指向 Android SDK 路径
  - `JAVA_HOME` 指向 JDK 安装路径

---

## 🎯 推荐的完整操作流程

1. **移动项目到英文路径**
   ```
   原路径：c:\Users\20269\Desktop\局域网互联
   新路径：C:\Projects\LanDisk
   ```

2. **验证环境**
   ```bash
   cd C:\Projects\LanDisk\mobile\LanDiskMobile
   node --version    # 应显示 v18.x.x
   java -version     # 应显示 17.x.x
   ```

3. **清理并重新安装依赖**
   ```bash
   rm -rf node_modules
   npm install
   cd android
   ./gradlew clean
   cd ..
   ```

4. **编译 APK**
   ```bash
   npm run build:apk
   ```

5. **等待编译完成**
   - 首次编译需要下载依赖（约 5-10 分钟）
   - 后续编译会快很多

---

## 💡 常见问题

### Q: 为什么 PC 版本可以用中文路径，Android 不行？
A: Electron 对中文路径支持良好，但 React Native 使用的 Gradle 构建系统在处理非 ASCII 字符时存在兼容性问题。

### Q: 我已经在英文路径下了，为什么还是失败？
A: 请检查：
- Java JDK 版本是否为 17+
- Android SDK 是否正确安装
- 环境变量是否配置正确
- 防火墙是否阻止了 Gradle 下载

### Q: 编译需要多长时间？
A: 
- 首次编译：5-15 分钟（取决于网络速度）
- 后续编译：1-3 分钟

### Q: 可以跳过某些步骤吗？
A: 不建议跳过任何步骤，这可能导致更严重的问题。

---

## 📞 需要帮助？

如果以上方案都无法解决问题，请提供：

1. 完整的错误日志
2. 当前项目路径
3. Node.js、Java、Gradle 版本号

---

**最后更新：** 2026-03-31
