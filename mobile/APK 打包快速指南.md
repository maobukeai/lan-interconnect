# 🚀 Android APK 打包 - 快速指南

## ⚡ 问题说明

由于项目路径包含中文字符（`局域网互联`），React Native 无法直接编译。

**解决方案：** 创建英文软链接进行编译

---

## 📝 操作步骤（3 步完成）

### 步骤 1️⃣：以管理员身份运行 CMD

1. 按 `Win + X`
2. 选择 **"Windows PowerShell (管理员)"** 或 **"命令提示符 (管理员)"**

### 步骤 2️⃣：执行创建命令

在打开的管理员窗口中，复制粘贴以下命令：

```cmd
mklink /D C:\LanDisk_Temp "c:\Users\20269\Desktop\局域网互联"
```

看到 **"为...创建的符号链接"** 表示成功！

### 步骤 3️⃣：开始编译

在**同一个管理员窗口**中继续执行：

```cmd
cd C:\LanDisk_Temp\mobile\LanDiskMobile
npm run build:apk
```

---

## ⏱️ 等待编译完成

- **首次编译**：5-10 分钟
- **后续编译**：1-3 分钟

编译成功后会显示：

```
✓ APK 打包成功！
文件位置：C:\LanDisk_Temp\mobile\LanDiskMobile\android\app\build\outputs\apk\debug\app-debug.apk
```

---

## 📦 APK 文件位置

编译完成后，APK 位于两个位置：

1. **编译输出目录**：
   ```
   C:\LanDisk_Temp\mobile\LanDiskMobile\android\app\build\outputs\apk\debug\app-debug.apk
   ```

2. **项目目录**（已自动复制）：
   ```
   c:\Users\20269\Desktop\局域网互联\release\android\app-debug.apk
   ```

---

## 📱 安装到手机

### 方法 1：USB 传输
1. 用数据线连接手机和电脑
2. 将 `app-debug.apk` 复制到手机
3. 在手机上点击安装

### 方法 2：使用 ADB（推荐开发者）
```bash
adb install c:\Users\20269\Desktop\局域网互联\release\android\app-debug.apk
```

### 方法 3：局域网传输
1. 在手机浏览器输入电脑的 IP 地址
2. 下载 APK 并安装

---

## 🔧 常见问题

### Q1: "拒绝访问" 或 "需要管理员权限"
**解决**：确保以管理员身份运行 CMD/PowerShell

### Q2: "找不到路径"
**解决**：检查步骤 2 的命令是否正确执行，确认 `C:\LanDisk_Temp` 存在

### Q3: 编译失败 - Gradle 下载超时
**解决**：
- 检查网络连接
- 首次编译需要下载约 200MB 的 Gradle
- 可以使用代理或更换网络环境

### Q4: 编译失败 - 未找到 Java
**解决**：
```bash
# 检查 Java 版本
java -version

# 如果未安装，请安装 JDK 17+
# 下载地址：https://adoptium.net/
```

### Q5: 编译失败 - 未找到 Android SDK
**解决**：
1. 安装 Android Studio
2. 安装 Android SDK Platform 34
3. 安装 Build-Tools 34.0.0

---

## 💡 一键打包脚本（可选）

如果您已经创建了软链接，可以直接运行：

```bash
cd C:\LanDisk_Temp\mobile\LanDiskMobile
npm run build:apk
```

或者双击运行项目中的：
```
mobile\一键打包 APK.bat
```

---

## 🎯 最快速的方案

如果觉得上述步骤复杂，可以：

1. **移动整个项目文件夹到英文路径**
   ```
   原路径：c:\Users\20269\Desktop\局域网互联
   新路径：C:\Projects\LanDisk
   ```

2. 然后执行：
   ```bash
   cd C:\Projects\LanDisk\mobile\LanDiskMobile
   npm run build:apk
   ```

---

## ✅ 验证清单

编译前请确认：
- [ ] Node.js v18+ 已安装 (`node --version`)
- [ ] Java JDK 17+ 已安装 (`java -version`)
- [ ] 已创建英文软链接 `C:\LanDisk_Temp`
- [ ] 网络连接正常

---

**最后更新**: 2026-04-01  
**适用版本**: React Native 0.74.0
