# 局域网互联 Mobile - React Native Android 应用

跨平台文件共享与通信工具的移动端应用，实现与 PC 端（Electron）的无缝连接和数据互通。

## 📱 功能特性

### 已实现
- ✅ **连接管理**: 手动输入、扫码快速连接
- ✅ **API 封装**: 完整的 30+ 接口定义
- ✅ **状态管理**: Redux Toolkit + 5 个状态切片
- ✅ **实时通信**: SSE 消息流接收
- ✅ **扫码功能**: 二维码扫描框架（待集成真实相机）

### 开发中
- 🚧 文件浏览与传输
- 🚧 聊天室完整功能
- 🚧 设备列表与监控
- 🚧 原生模块桥接

## 🏗️ 项目结构

```
mobile/
├── src/
│   ├── api/                    # API 层
│   │   ├── base.ts            # Axios 封装（PIN 码自动注入）
│   │   ├── endpoints.ts       # 30+ 接口定义
│   │   └── index.ts
│   │
│   ├── store/                  # Redux 状态管理
│   │   ├── slices/
│   │   │   ├── connectionSlice.ts  # 连接状态
│   │   │   ├── fileSlice.ts        # 文件状态
│   │   │   ├── chatSlice.ts        # 聊天状态
│   │   │   ├── deviceSlice.ts      # 设备状态
│   │   │   └── settingsSlice.ts    # 设置状态
│   │   └── index.ts
│   │
│   ├── services/             # 业务服务层
│   │   └── ConnectionService.ts  # 连接管理服务
│   │
│   ├── screens/              # 页面组件
│   │   ├── Connection/
│   │   │   ├── ConnectionScreen.tsx  # 连接引导页
│   │   │   └── QRScannerScreen.tsx   # 扫码页
│   │   ├── Dashboard/
│   │   ├── Files/
│   │   ├── Chat/
│   │   └── Devices/
│   │
│   ├── navigation/           # 导航配置
│   │   └── AppNavigator.tsx
│   │
│   ├── config/               # 配置文件
│   │   └── theme.ts         # Material Design 主题
│   │
│   └── App.tsx              # 应用入口
│
├── package.json
├── tsconfig.json
└── init-project.bat         # 项目初始化脚本
```

## 🚀 快速开始

### 方法 1: 使用初始化脚本（推荐）

```bash
cd mobile
init-project.bat
```

脚本会自动：
1. 检查 Node.js 环境
2. 创建 React Native 项目
3. 安装所有依赖包

### 方法 2: 手动初始化

```bash
# 1. 创建 React Native 项目
npx @react-native-community/cli@latest init LanDiskMobile --version 0.74.0 --pm npm

cd LanDiskMobile

# 2. 安装依赖
npm install @react-navigation/native @react-navigation/bottom-tabs
npm install @reduxjs/toolkit react-redux axios
npm install react-native-paper react-native-vector-icons
npm install react-native-fs react-native-document-picker
npm install react-native-vision-camera react-native-qrcode-svg
npm install event-source-polyfill

# 3. 复制源代码
将 src/ 目录复制到项目根目录
```

## 📦 运行应用

```bash
# 启动 Metro Bundler
npm start

# Android 调试（需要连接设备或启动模拟器）
npm run android

# 构建 APK
npm run build:apk

# 构建 Release 版本
npm run build:release
```

## 🔌 原生模块

### NetworkModule - 网络发现
```java
// 获取本地 IP 地址
NetworkModule.getLocalIpAddress()

// 扫描局域网设备
NetworkModule.scanNetwork(port)
```

### FileModule - 文件操作
```java
// 获取外部存储路径
FileModule.getExternalStoragePath()

// 打开文件
FileModule.openFile(filePath)
```

### ClipboardModule - 剪贴板监听
```java
// 添加监听器
ClipboardModule.addClipboardListener()

// 移除监听器
ClipboardModule.removeClipboardListener()
```

## 📡 API 使用示例

### 连接服务器
```typescript
import { connectionService } from './services/ConnectionService';

// 连接到电脑
const result = await connectionService.connect('http://192.168.1.100:3000', '123456');

if (result.success) {
  console.log('连接成功！');
} else {
  console.error('连接失败:', result.error);
}
```

### 发送聊天消息
```typescript
import { chatAPI } from './api/endpoints';

// 发送文本消息
await chatAPI.sendMessage({
  text: '你好！',
  sender: 'mobile_001',
  type: 'text',
});

// 发送图片（Base64）
await chatAPI.sendMessage({
  text: 'data:image/png;base64,...',
  sender: 'mobile_001',
  type: 'image',
});
```

### 获取文件列表
```typescript
import { fileAPI } from './api/endpoints';

// 获取 C 盘文件列表
const files = await fileAPI.getFiles('C:\\');
console.log(files);

// 下载文件
const blob = await fileAPI.downloadFile('C:\\file.txt');
```

## 🎨 UI 设计

遵循 Material Design 3 设计规范：
- **主色调**: Indigo (#6366f1)
- **圆角**: 12dp
- **字体**: Roboto / Noto Sans SC
- **图标**: Material Icons

## ⚠️ 注意事项

1. **Android 权限**: 需要在 `AndroidManifest.xml` 中添加：
   ```xml
   <uses-permission android:name="android.permission.INTERNET" />
   <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
   <uses-permission android:name="android.permission.CAMERA" />
   <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
   <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />
   ```

2. **HTTPS**: 如果服务端使用 HTTP，需要在 `network_security_config.xml` 中允许明文传输

3. **扫码功能**: 当前为模拟实现，需集成 `react-native-vision-camera` 实现真实扫码

## 📅 开发计划

- [ ] 集成真实相机进行扫码
- [ ] 实现文件列表和传输功能
- [ ] 完善聊天室（语音录制、音频播放）
- [ ] 实现设备列表和网速监控
- [ ] 添加进程管理和 Web 终端
- [ ] 深色模式支持
- [ ] 性能优化和测试

## 🤝 与 PC 端互通

### 连接流程
1. PC 端启动服务，生成二维码（包含 IP 和 PIN 码）
2. 手机端扫描二维码或手动输入 IP
3. 自动建立 SSE 长连接
4. 实时接收聊天消息和设备状态

### 数据格式兼容
所有 API 请求和响应格式与 PC 端完全一致，确保三端（PC/Web/Android）互通。

## 📄 许可证

MIT License

## 👥 作者

基于 Electron PC 端架构开发的 React Native Android 版本

---

**最后更新**: 2026-03-31
