# 局域网互联 Mobile - 快速开始指南

## 🎯 目标

在 30 分钟内完成 React Native Android 应用的初始化和第一个页面运行。

## 📋 前置要求

### 必需软件
1. **Node.js** (v16+) - [下载地址](https://nodejs.org/)
2. **Android Studio** - [下载地址](https://developer.android.com/studio)
3. **Git** (可选) - [下载地址](https://git-scm.com/)

### 环境检查
```bash
# 检查 Node.js
node --version  # 应显示 v16.x 或更高

# 检查 npm
npm --version   # 应显示 8.x 或更高
```

## 🚀 步骤 1: 初始化项目

### 方法 A: 使用自动脚本（推荐）

```bash
# 进入 mobile 目录
cd mobile

# 运行初始化脚本
init-project.bat
```

脚本会自动：
- ✅ 创建 React Native 项目
- ✅ 安装所有依赖包
- ✅ 配置 TypeScript

**预计耗时**: 5-10 分钟（取决于网络速度）

### 方法 B: 手动创建

```bash
# 1. 创建 React Native 项目
npx @react-native-community/cli@latest init LanDiskMobile --version 0.74.0 --pm npm

# 2. 进入项目目录
cd LanDiskMobile

# 3. 安装额外依赖
npm install @react-navigation/native @react-navigation/stack
npm install @reduxjs/toolkit react-redux axios
npm install react-native-paper react-native-vector-icons
npm install react-native-fs react-native-document-picker
npm install react-native-vision-camera react-native-qrcode-svg
npm install event-source-polyfill

# 4. 复制源代码
将提供的 src/ 目录复制到项目根目录
```

## 🛠️ 步骤 2: 配置 Android Studio

### 2.1 打开项目
```bash
# 在 Android Studio 中打开项目
cd LanDiskMobile/android
studio .
```

或在 Android Studio 中选择 `File -> Open`，然后选择 `android` 目录。

### 2.2 等待 Gradle 同步
首次打开需要下载 Gradle 和依赖，可能需要 5-10 分钟。

### 2.3 配置模拟器（如果没有真机）

1. 点击 `Tools -> Device Manager`
2. 点击 `Create Device`
3. 选择 `Pixel 6` 或任意手机型号
4. 选择系统镜像（推荐 API 33 或更高）
5. 点击 `Finish`

## ▶️ 步骤 3: 运行应用

### 方法 A: 使用命令行

```bash
# 确保 Metro Bundler 已启动
npm start

# 新打开一个终端窗口
npm run android
```

### 方法 B: 使用 Android Studio

1. 点击绿色运行按钮（▶️）
2. 选择模拟器或连接的真机
3. 等待编译和安装

### 预期结果

应用启动后应该显示：
- 📱 "局域网互联" 标题
- 🔗 服务器地址输入框
- 🔑 PIN 码输入框
- 📷 "扫描二维码" 按钮

## 🔍 步骤 4: 测试基本功能

### 4.1 手动输入连接

1. 在服务器地址输入：`http://你的电脑 IP:3000`
2. 如果 PC 端设置了 PIN 码，输入 PIN 码
3. 点击"连接"按钮

### 4.2 查看日志

```bash
# 查看 React Native 日志
npx react-native log-android

# 或使用 Chrome DevTools
# 在应用中摇动手机/模拟器，选择 "Debug"
# 打开 http://localhost:8081/debugger-ui
```

## ⚠️ 常见问题解决

### 问题 1: "SDK location not found"

**解决方案**: 在 `android/local.properties` 中添加：
```properties
sdk.dir=C\:\\Users\\你的用户名\\AppData\\Local\\Android\\Sdk
```

### 问题 2: "Unable to load script"

**解决方案**: 
```bash
# 重启 Metro Bundler
npm start -- --reset-cache

# 清理并重新构建
cd android
gradlew clean
cd ..
npm run android
```

### 问题 3: "No bundle URL present"

**解决方案**: 等待 Metro Bundler 完全启动后再运行应用

### 问题 4: 连接被拒绝

**解决方案**:
1. 确保 PC 端服务已启动
2. 确保手机和电脑在同一 WiFi 网络
3. 检查 Windows 防火墙是否允许 3000 端口

## 📝 下一步

完成基础运行后，继续开发：

1. **Phase 1** (Week 1-2): 基础框架 ✅
   - ✅ 项目初始化
   - ✅ Redux 状态管理
   - ✅ API 封装
   - ✅ 连接页面

2. **Phase 2** (Week 3-5): 核心功能
   - 文件列表展示
   - 文件上传/下载
   - 聊天室功能
   - 设备管理

3. **Phase 3** (Week 6-7): 高级功能
   - 进程管理
   - Web 终端
   - 系统监控

## 📚 学习资源

- [React Native 官方文档](https://reactnative.dev/docs/getting-started)
- [React Navigation](https://reactnavigation.org/docs/getting-started)
- [Redux Toolkit](https://redux-toolkit.js.org/introduction/getting-started)
- [React Native Paper](https://callstack.github.io/react-native-paper/)

## 💡 提示

1. **热重载**: 按 `Ctrl+M` (Android) 或摇动设备，启用"Fast Refresh"
2. **开发者菜单**: 摇动设备可打开开发者菜单
3. **调试**: 使用 Chrome DevTools 进行断点调试
4. **性能**: 在真实设备上测试性能更准确

## 🎉 恭喜！

你现在已经成功运行了局域网互联 Android 应用！

接下来可以：
- ✨ 完善 UI 界面
- 🔌 集成原生模块
- 📡 实现完整的 API 调用
- 🧪 编写测试用例

---

**遇到问题？** 查看 [README.md](README.md) 获取更多详细信息。

**最后更新**: 2026-03-31
