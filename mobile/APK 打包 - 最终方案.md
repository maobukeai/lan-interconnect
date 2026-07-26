# 📦 Android APK 打包 - 最终解决方案

## ⚠️ 重要提示

由于项目路径 `c:\Users\20269\Desktop\局域网互联` 包含**中文字符**，React Native 无法直接编译 APK。

这是 React Native/Gradle 的已知限制，不是代码问题。

---

## ✅ 三种解决方案（任选其一）

### 方案一：使用智能复制版脚本（最简单）⭐

**操作步骤：**

1. **双击运行**：
   ```
   mobile\APK 打包 - 智能复制版.bat
   ```

2. **等待完成**（首次需要 5-10 分钟）

3. **APK 位置**：
   ```
   c:\Users\20269\Desktop\局域网互联\release\android\app-debug.apk
   ```

**原理**：自动复制项目到桌面临时英文目录 `Desktop\LanDisk_Build` 进行编译

**优点**：无需管理员权限，全自动

---

### 方案二：创建软链接（推荐长期使用）

**步骤 1**：以管理员身份打开 PowerShell
- 按 `Win + X`
- 选择 "Windows PowerShell (管理员)"

**步骤 2**：执行命令
```powershell
mklink /D C:\LanDisk_Temp "c:\Users\20269\Desktop\局域网互联"
```

**步骤 3**：开始编译
```cmd
cd C:\LanDisk_Temp\mobile\LanDiskMobile
npm run build:apk
```

**优点**：后续编译无需重复配置

---

### 方案三：移动项目文件夹（最彻底）

**操作**：
1. 将整个文件夹移动到英文路径，例如：
   ```
   C:\Projects\LanDisk\
   D:\Dev\LanDisk\
   ```

2. 然后编译：
   ```cmd
   cd C:\Projects\LanDisk\mobile\LanDiskMobile
   npm run build:apk
   ```

---

## 🎯 立即开始（最快的方法）

### 方式 A：运行脚本（推荐）

直接双击运行以下任一脚本：

1. **智能复制版**（无需管理员）：
   ```
   mobile\APK 打包 - 智能复制版.bat
   ```

2. **管理员版**（需要提权）：
   ```
   mobile\APK 打包 - 管理员版.bat
   ```

### 方式 B：手动编译（如果脚本失败）

1. 在桌面创建新文件夹：`C:\Users\20269\Desktop\LanDisk_Build`

2. 复制整个 `mobile` 文件夹到新目录

3. 打开 CMD，执行：
   ```cmd
   cd C:\Users\20269\Desktop\LanDisk_Build\mobile\LanDiskMobile
   npm install
   npm run build:apk
   ```

4. 等待编译完成（5-10 分钟）

---

## 📋 环境要求检查清单

编译前请确认已安装：

- [ ] **Node.js** v18+ 
  - 检查：`node --version`
  
- [ ] **Java JDK** v17+
  - 检查：`java -version`
  
- [ ] **Android SDK** 或 **Android Studio**
  - 需要：Android SDK Platform 34
  - 需要：Build-Tools 34.0.0
  
- [ ] **环境变量**
  - `ANDROID_HOME` = Android SDK 路径
  - `JAVA_HOME` = JDK 安装路径

---

## ⏱️ 编译时间参考

| 阶段 | 时间 |
|------|------|
| 首次编译 | 5-15 分钟 |
| 后续编译 | 1-3 分钟 |
| 清理后重新编译 | 3-5 分钟 |

**影响因素**：
- 网络速度（Gradle 下载）
- CPU 性能
- 内存大小

---

## 📦 编译成功后

### APK 文件位置

**方案一会输出到**：
```
c:\Users\20269\Desktop\局域网互联\release\android\app-debug.apk
```

**方案二/三会输出到**：
```
C:\LanDisk_Temp\mobile\LanDiskMobile\android\app\build\outputs\apk\debug\app-debug.apk
```

### 安装方法

#### 方法 1：USB 传输
1. 数据线连接手机
2. 复制 APK 到手机
3. 手机上点击安装

#### 方法 2：ADB 安装
```bash
adb devices  # 确认设备连接
adb install c:\Users\20269\Desktop\局域网互联\release\android\app-debug.apk
```

#### 方法 3：局域网分享
1. 启动 PC 端应用
2. 在手机浏览器访问电脑 IP
3. 下载并安装 APK

---

## 🔧 故障排除

### 错误 1：拒绝访问 / 需要管理员权限

**解决**：
- 右键脚本 → "以管理员身份运行"
- 或使用方案一（智能复制版，无需管理员）

### 错误 2：找不到 Java

**解决**：
```bash
# 检查 Java
java -version

# 如果未安装，下载 JDK 17+
# https://adoptium.net/zh-CN/
```

### 错误 3：Gradle 下载超时

**解决**：
- 检查网络连接
- 使用代理
- 稍后重试（网络波动）

### 错误 4：找不到 Android SDK

**解决**：
1. 安装 Android Studio
2. Tools → SDK Manager
3. 安装 Android SDK Platform 34
4. 安装 Build-Tools 34.0.0

### 错误 5：npm run build:apk 失败

**解决**：
```bash
# 清理缓存
cd mobile\LanDiskMobile
npx react-native clean
cd android
gradlew clean
cd ..

# 重新安装依赖
npm install --legacy-peer-deps

# 重新编译
npm run build:apk
```

---

## 💡 提示

1. **首次编译最慢**：需要下载 Gradle 和各种依赖
2. **后续很快**：通常 1-3 分钟即可完成
3. **保持网络畅通**：Gradle 需要从服务器下载组件
4. **不要中断编译**：可能导致缓存损坏

---

## 📞 需要帮助？

如果以上方案都无法解决问题，请提供：

1. **完整的错误日志**（截图或复制文本）
2. **当前使用的方案**（方案一/二/三）
3. **环境信息**：
   ```bash
   node --version
   java -version
   ```

---

## 📚 相关文档

- `APK 编译失败解决方案.md` - 详细技术分析
- `APK 打包快速指南.md` - 简化版步骤
- `打包安装指南.md` - 完整安装说明

---

**最后更新**: 2026-04-01  
**适用版本**: React Native 0.74.0, Gradle 8.6  
**目标平台**: Android API 34
