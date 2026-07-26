# 局域网互联 - Android 移动端开发计划

## 📋 项目概述

将现有的 Electron PC 端应用完整迁移到 Android 平台，使用 React Native 技术栈实现跨设备文件管理、实时聊天、剪贴板同步、系统监控等功能，保持与 PC 端服务端 API 的完全兼容。

---

## 🎯 核心需求

### 用户需求确认
- ✅ **技术栈**: React Native 跨平台开发
- ✅ **功能范围**: 完整功能版（所有 PC 端功能）
- ✅ **连接方式**: 扫码快速连接 + 手动输入 + 自动发现
- ✅ **UI 方案**: Material Design 原生界面重写

### 功能清单

| 功能模块 | PC 端功能 | 移动端实现 | 优先级 |
|---------|----------|-----------|--------|
| **连接管理** | 二维码展示、PIN 码认证 | 扫码连接、手动输入、自动发现 | P0 |
| **文件管理** | 浏览、上传、下载、分享 | 原生文件选择器、断点续传 | P0 |
| **聊天室** | 文本、图片、语音、SSE 推送 | 完全复用、消息持久化 | P0 |
| **设备管理** | 在线设备列表、网速监控 | 实时更新、强制断开 | P1 |
| **系统监控** | CPU/内存/进程管理 | Android ActivityManager 适配 | P2 |
| **Web 终端** | 命令执行 | 简化版（仅基础命令） | P3 |
| **剪贴板** | 跨设备同步 | ClipboardManager 实现 | P1 |
| **性能监控** | 网络流量统计 | TrafficStats API | P2 |

---

## 🏗️ 架构设计

### 技术架构图

```
┌─────────────────────────────────────────────────────────┐
│                     Android Application                  │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │              UI Layer (React Native)                │ │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐           │ │
│  │  │Dashboard │ │  Files   │ │  Chat    │  Screens  │ │
│  │  └──────────┘ └──────────┘ └──────────┘           │ │
│  └────────────────────────────────────────────────────┘ │
│                           ▲                              │
│  ┌────────────────────────┴────────────────────────────┐ │
│  │          State Management (Redux Toolkit)            │ │
│  │  connection | files | chat | devices | settings      │ │
│  └─────────────────────────────────────────────────────┘ │
│                           ▲                              │
│  ┌────────────────────────┴────────────────────────────┐ │
│  │            Business Logic (Services)                 │ │
│  │  ConnectionService | FileService | ChatService       │ │
│  └─────────────────────────────────────────────────────┘ │
│                           ▲                              │
│  ┌────────────────────────┴────────────────────────────┐ │
│  │              API Client (Axios)                      │ │
│  │  Interceptors | Auth | Error Handling                │ │
│  └─────────────────────────────────────────────────────┘ │
│                           ▲                              │
│  ┌────────────────────────┴────────────────────────────┐ │
│  │          Native Modules (Java/Kotlin)                │ │
│  │  Network | FileSystem | DeviceInfo | Clipboard       │ │
│  └─────────────────────────────────────────────────────┘ │
│                           ▲                              │
└───────────────────────────┼──────────────────────────────┘
                            │
                    ┌───────▼────────┐
                    │  HTTP Server   │
                    │  (PC 端服务)     │
                    └────────────────┘
```

### 项目目录结构

```
LanDiskMobile/
├── android/                          # Android 原生工程
│   ├── app/src/main/java/com/landisk/
│   │   ├── modules/                  # 原生模块
│   │   │   ├── NetworkModule.java    # 网络扫描
│   │   │   ├── FileModule.java       # 文件操作
│   │   │   ├── DeviceModule.java     # 设备信息
│   │   │   └── ClipboardModule.java  # 剪贴板
│   │   └── MainApplication.java
│   └── build.gradle
│
├── src/
│   ├── api/                          # API 层
│   │   ├── index.ts
│   │   ├── base.ts                   # Axios 封装
│   │   ├── endpoints.ts              # 30+ 接口定义
│   │   └── interceptors.ts           # 拦截器
│   │
│   ├── components/                   # UI 组件
│   │   ├── common/                   # 通用组件
│   │   ├── file/                     # 文件组件
│   │   ├── chat/                     # 聊天组件
│   │   └── device/                   # 设备组件
│   │
│   ├── config/                       # 配置
│   │   ├── theme.ts                  # Material 主题
│   │   └── constants.ts
│   │
│   ├── hooks/                        # 自定义 Hooks
│   │   ├── useConnection.ts
│   │   ├── useChatStream.ts
│   │   └── useFileBrowser.ts
│   │
│   ├── navigation/                   # 导航
│   │   ├── AppNavigator.tsx
│   │   └── TabNavigator.tsx
│   │
│   ├── screens/                      # 页面
│   │   ├── Dashboard/
│   │   ├── Files/
│   │   ├── Chat/
│   │   ├── Devices/
│   │   ├── Monitor/
│   │   ├── Settings/
│   │   └── Connection/
│   │
│   ├── services/                     # 业务服务
│   │   ├── ConnectionService.ts
│   │   ├── FileService.ts
│   │   ├── ChatService.ts
│   │   └── DeviceService.ts
│   │
│   ├── store/                        # Redux Store
│   │   ├── index.ts
│   │   ├── slices/
│   │   │   ├── connectionSlice.ts
│   │   │   ├── fileSlice.ts
│   │   │   ├── chatSlice.ts
│   │   │   └── deviceSlice.ts
│   │   └── middleware/
│   │
│   ├── types/                        # TypeScript 类型
│   │   ├── api.ts
│   │   └── models.ts
│   │
│   ├── utils/                        # 工具函数
│   │   ├── format.ts
│   │   ├── storage.ts
│   │   └── nativeBridge.ts
│   │
│   └── assets/                       # 资源
│       ├── images/
│       └── fonts/
│
├── App.tsx
├── package.json
└── tsconfig.json
```

---

## 📦 依赖库清单

### 核心依赖

```json
{
  "dependencies": {
    "react-native": "^0.74.0",
    "react": "^18.2.0",
    
    "@react-navigation/native": "^6.1.0",
    "@react-navigation/bottom-tabs": "^6.5.0",
    "@react-navigation/drawer": "^6.6.0",
    "react-native-screens": "^3.30.0",
    "react-native-safe-area-context": "^4.9.0",
    
    "@reduxjs/toolkit": "^2.0.0",
    "react-redux": "^9.1.0",
    
    "axios": "^1.6.0",
    
    "react-native-paper": "^5.12.0",
    "react-native-vector-icons": "^10.0.0",
    
    "react-native-fs": "^2.20.0",
    "react-native-document-picker": "^9.1.0",
    "react-native-permissions": "^4.1.0",
    "react-native-device-info": "^11.1.0",
    
    "react-native-vision-camera": "^3.6.0",
    "react-native-qrcode-svg": "^6.2.0",
    "react-native-svg": "^14.1.0",
    
    "event-source-polyfill": "^1.0.31",
    
    "react-hook-form": "^7.49.0",
    "zod": "^3.22.0",
    
    "date-fns": "^3.3.0",
    "lodash": "^4.17.21",
    "react-native-fast-image": "^8.6.0"
  },
  
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/lodash": "^4.14.0",
    "typescript": "^5.3.0",
    "jest": "^29.7.0",
    "@testing-library/react-native": "^12.4.0"
  }
}
```

---

## 🔧 原生模块实现

### 1. NetworkModule.java - 网络发现

```java
package com.landisk.modules;

import com.facebook.react.bridge.*;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Enumeration;

public class NetworkModule extends ReactContextBaseJavaModule {
    
    public NetworkModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }
    
    @Override
    public String getName() {
        return "NetworkModule";
    }
    
    @ReactMethod
    public void getLocalIpAddress(Promise promise) {
        try {
            Enumeration<NetworkInterface> interfaces = 
                NetworkInterface.getNetworkInterfaces();
            
            while (interfaces.hasMoreElements()) {
                NetworkInterface networkInterface = interfaces.nextElement();
                Enumeration<InetAddress> addresses = networkInterface.getInetAddresses();
                
                while (addresses.hasMoreElements()) {
                    InetAddress address = addresses.nextElement();
                    if (!address.isLoopbackAddress() && 
                        address.getHostAddress().startsWith("192.168.")) {
                        promise.resolve(address.getHostAddress());
                        return;
                    }
                }
            }
            promise.reject("ERROR", "No local IP found");
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }
    
    @ReactMethod
    public void scanNetwork(final int port, final Promise promise) {
        // 异步扫描局域网设备
        new Thread(() -> {
            ArrayList<String> devices = new ArrayList<>();
            // 实现 ping 或 socket 探测逻辑
            promise.resolve(Arguments.makeArray(devices));
        }).start();
    }
}
```

### 2. FileModule.java - 文件操作

```java
package com.landisk.modules;

import android.content.Intent;
import android.net.Uri;
import com.facebook.react.bridge.*;
import java.io.File;

public class FileModule extends ReactContextBaseJavaModule {
    
    @ReactMethod
    public void getExternalStoragePath(Promise promise) {
        File externalDir = getReactApplicationContext()
            .getExternalFilesDir(null);
        promise.resolve(externalDir.getAbsolutePath());
    }
    
    @ReactMethod
    public void openFile(String filePath, Promise promise) {
        try {
            File file = new File(filePath);
            Uri uri = android.support.v4.content.FileProvider.getUriForFile(
                getReactApplicationContext(),
                getReactApplicationContext().getPackageName() + ".provider",
                file
            );
            
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, getMimeType(filePath));
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            
            getCurrentActivity().startActivity(intent);
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }
    
    private String getMimeType(String path) {
        // 根据扩展名返回 MIME 类型
        if (path.endsWith(".pdf")) return "application/pdf";
        if (path.endsWith(".jpg") || path.endsWith(".png")) return "image/*";
        if (path.endsWith(".mp4")) return "video/*";
        return "*/*";
    }
}
```

### 3. ClipboardModule.java - 剪贴板监听

```java
package com.landisk.modules;

import android.content.ClipboardManager;
import android.content.ClipData;
import com.facebook.react.bridge.*;

public class ClipboardModule extends ReactContextBaseJavaModule 
    implements ClipboardManager.OnPrimaryClipChangedListener {
    
    private ClipboardManager clipboard;
    private boolean isListening = false;
    
    @ReactMethod
    public void addClipboardListener() {
        if (!isListening) {
            clipboard = (ClipboardManager) getReactApplicationContext()
                .getSystemService(getReactApplicationContext().CLIPBOARD_SERVICE);
            clipboard.addPrimaryClipChangedListener(this);
            isListening = true;
        }
    }
    
    @ReactMethod
    public void removeClipboardListener() {
        if (isListening && clipboard != null) {
            clipboard.removePrimaryClipChangedListener(this);
            isListening = false;
        }
    }
    
    @Override
    public void onPrimaryClipChanged() {
        // 发送事件到 React Native
        WritableMap params = Arguments.createMap();
        ClipData.Item item = clipboard.getPrimaryClip().getItemAt(0);
        params.putString("text", item.getText().toString());
        
        getReactApplicationContext()
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
            .emit("onClipboardChange", params);
    }
}
```

---

## 📡 API 接口实现

### API 基础封装

```typescript
// src/api/base.ts
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import store from '../store';

class ApiClient {
  private client: AxiosInstance;
  
  constructor() {
    this.client = axios.create({
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    this.setupInterceptors();
  }
  
  private setupInterceptors() {
    // 请求拦截器 - 自动注入 PIN 码
    this.client.interceptors.request.use(config => {
      const state = store.getState();
      const { pin, serverUrl } = state.connection;
      
      if (serverUrl) {
        // 替换 baseURL 为当前连接的服务器
        config.baseURL = serverUrl;
      }
      
      if (pin) {
        config.headers['x-pin'] = pin;
      }
      
      return config;
    });
    
    // 响应拦截器 - 统一错误处理
    this.client.interceptors.response.use(
      response => response,
      error => {
        if (error.response?.status === 401) {
          // PIN 码错误或未授权
          store.dispatch(connectionSlice.actions.disconnect());
        }
        return Promise.reject(error);
      }
    );
  }
  
  async get<T>(url: string, config?: AxiosRequestConfig) {
    const response = await this.client.get<T>(url, config);
    return response.data;
  }
  
  async post<T>(url: string, data?: any, config?: AxiosRequestConfig) {
    const response = await this.client.post<T>(url, data, config);
    return response.data;
  }
  
  async delete<T>(url: string, config?: AxiosRequestConfig) {
    const response = await this.client.delete<T>(url, config);
    return response.data;
  }
}

export default new ApiClient();
```

### 关键接口定义

```typescript
// src/api/endpoints.ts
import api from './base';

export interface Device {
  ip: string;
  userAgent: string;
  lastSeen: number;
}

export interface ChatMessage {
  id: string;
  type: 'text' | 'image' | 'audio';
  text: string;
  sender: string;
  senderIp?: string;
  time: string;
}

export interface FileInfo {
  name: string;
  path: string;
  size: number;
  isDirectory: boolean;
  mtime: string;
}

export const deviceAPI = {
  // 获取在线设备
  getDevices: () => api.get<{ devices: Device[]; stats: any }>('/api/devices'),
  
  // 强制断开所有设备
  kickDevices: () => api.post('/api/tools/kick-devices'),
};

export const chatAPI = {
  // 获取历史消息
  getMessages: () => api.get<ChatMessage[]>('/api/chat'),
  
  // 发送消息
  sendMessage: (data: { 
    text: string; 
    sender: string; 
    type?: 'text' | 'image' | 'audio' 
  }) => api.post('/api/chat', data),
  
  // 清空聊天
  clearChat: () => api.post('/api/chat', { action: 'clear' }),
};

export const fileAPI = {
  // 获取文件列表
  getFiles: (path?: string) => api.get('/api/files', { params: { path } }),
  
  // 下载文件
  downloadFile: (path: string) => api.get('/api/download', { 
    params: { path },
    responseType: 'blob'
  }),
  
  // 批量下载
  batchDownload: (files: string[]) => api.post('/api/download/batch', { files }),
  
  // 删除文件
  deleteFile: (path: string) => api.delete('/api/files', { params: { path } }),
  
  // 新建文件夹
  createFolder: (path: string) => api.post('/api/mkdir', null, { params: { path } }),
  
  // 重命名
  rename: (oldPath: string, newPath: string) => 
    api.post('/api/rename', { oldPath, newPath }),
};

export const systemAPI = {
  // 获取系统信息
  getSysInfo: () => api.get('/api/sysinfo'),
  
  // 获取进程列表
  getProcesses: () => api.get('/api/processes'),
  
  // 结束进程
  killProcess: (pid: number) => api.post('/api/kill-process', { pid }),
  
  // 执行命令
  executeCommand: (command: string, cwd?: string) =>
    api.post('/api/terminal', { command, cwd }),
};
```

---

## 🎨 UI 组件示例

### 文件列表组件

```tsx
// src/components/file/FileList.tsx
import React from 'react';
import { FlatList, StyleSheet } from 'react-native';
import { Card, Text, IconButton, ActivityIndicator } from 'react-native-paper';
import FileItem from './FileItem';
import { FileInfo } from '../../types/models';

interface FileListProps {
  files: FileInfo[];
  currentPath: string;
  onFilePress: (file: FileInfo) => void;
  onNavigateUp: () => void;
  loading?: boolean;
}

const FileList: React.FC<FileListProps> = ({
  files,
  currentPath,
  onFilePress,
  onNavigateUp,
  loading,
}) => {
  if (loading) {
    return <ActivityIndicator size="large" style={styles.loader} />;
  }
  
  return (
    <>
      {/* 路径导航栏 */}
      <Card style={styles.pathBar}>
        <IconButton icon="arrow-up" onPress={onNavigateUp} />
        <Text numberOfLines={1}>{currentPath}</Text>
      </Card>
      
      {/* 文件列表 */}
      <FlatList
        data={files}
        keyExtractor={(item) => item.path}
        renderItem={({ item }) => (
          <FileItem file={item} onPress={() => onFilePress(item)} />
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>此目录为空</Text>
        }
      />
    </>
  );
};

const styles = StyleSheet.create({
  loader: { flex: 1, justifyContent: 'center' },
  pathBar: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 8,
    padding: 8,
  },
  empty: {
    textAlign: 'center',
    marginTop: 40,
    color: '#999',
  },
});

export default FileList;
```

### 聊天消息气泡

```tsx
// src/components/chat/MessageBubble.tsx
import React from 'react';
import { View, StyleSheet, Image } from 'react-native';
import { Text, Avatar } from 'react-native-paper';
import { ChatMessage } from '../../types/models';

interface MessageBubbleProps {
  message: ChatMessage;
  isMe: boolean;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ message, isMe }) => {
  const renderContent = () => {
    switch (message.type) {
      case 'image':
        return <Image source={{ uri: message.text }} style={styles.image} />;
      case 'audio':
        return (
          // TODO: 音频播放器组件
          <Text>🎵 语音消息</Text>
        );
      default:
        return <Text style={styles.text}>{message.text}</Text>;
    }
  };
  
  return (
    <View style={[
      styles.container,
      isMe ? styles.myMessage : styles.otherMessage,
    ]}>
      {!isMe && <Avatar.Text size={30} label={message.senderIp || '?'} />}
      
      <View style={[
        styles.bubble,
        isMe ? styles.myBubble : styles.otherBubble,
      ]}>
        {!isMe && message.senderIp && (
          <Text style={styles.sender}>{message.senderIp}</Text>
        )}
        
        {renderContent()}
        
        <Text style={styles.time}>
          {new Date(message.time).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    marginVertical: 4,
    paddingHorizontal: 12,
  },
  myMessage: {
    justifyContent: 'flex-end',
  },
  otherMessage: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '70%',
    padding: 12,
    borderRadius: 16,
  },
  myBubble: {
    backgroundColor: '#6366f1',
    borderBottomRightRadius: 4,
  },
  otherBubble: {
    backgroundColor: '#e0e0e0',
    borderBottomLeftRadius: 4,
  },
  text: {
    color: '#fff',
    fontSize: 15,
  },
  image: {
    width: 200,
    height: 200,
    borderRadius: 8,
  },
  sender: {
    fontSize: 12,
    opacity: 0.7,
    marginBottom: 4,
  },
  time: {
    fontSize: 10,
    opacity: 0.5,
    alignSelf: 'flex-end',
    marginTop: 4,
  },
});

export default MessageBubble;
```

---

## 📅 开发里程碑

### Phase 1: 基础框架 (Week 1-2)

**目标**: 完成项目初始化，实现基本连接功能

**交付物**:
- ✅ React Native 项目搭建
- ✅ TypeScript + ESLint 配置
- ✅ Redux Toolkit 状态管理
- ✅ 底部 Tab 导航
- ✅ 基础 UI 组件库
- ✅ API 请求封装
- ✅ 连接引导页（手动输入）

**验收标准**: 应用可运行，能手动连接服务端并验证 PIN 码

---

### Phase 2: 核心功能 (Week 3-5)

#### Sprint 2.1 - 文件管理 (Week 3)
- ✅ 文件列表展示
- ✅ 文件上传/下载
- ✅ 进度显示
- ✅ 原生文件选择器
- ✅ 存储空间展示

#### Sprint 2.2 - 聊天室 (Week 4)
- ✅ SSE 实时消息流
- ✅ 聊天界面
- ✅ 图片发送
- ✅ 语音录制
- ✅ 消息本地缓存

#### Sprint 2.3 - 设备管理 (Week 5)
- ✅ 在线设备列表
- ✅ 二维码扫描
- ✅ 网速监控
- ✅ 强制断开

**验收标准**: 可与 PC 端互传文件、实时聊天

---

### Phase 3: 高级功能 (Week 6-7)

- ✅ 进程管理器
- ✅ Web 终端
- ✅ 系统信息监控
- ✅ 网络接口信息
- ✅ 自动发现设备

---

### Phase 4: UI/UX 优化 (Week 8)

- ✅ Material Design 主题
- ✅ 深色模式
- ✅ 动画优化
- ✅ 错误提示
- ✅ 手势支持

---

### Phase 5: 测试发布 (Week 9-10)

- ✅ 单元测试
- ✅ E2E 测试
- ✅ 性能优化
- ✅ APK 打包签名
- ✅ 应用商店素材

---

## ⚠️ 技术风险与应对

| 风险 | 影响程度 | 应对方案 |
|------|---------|---------|
| Android 文件权限限制 | 高 | 提前研究 SAF，预留时间适配 |
| 后台服务保活困难 | 中 | Foreground Service + 通知常驻 |
| SSE 连接不稳定 | 中 | 自动重连 + 心跳检测 |
| 大文件传输超时 | 中 | 分片上传 + 断点续传 |
| Android 版本碎片化 | 低 | 最低 API 21，覆盖 95%+ 设备 |

---

## 📊 成功指标

1. **功能完整性**: 实现 PC 端 90%+ 的核心功能
2. **连接成功率**: > 95%（扫码/手动/自动发现）
3. **文件传输速度**: 达到局域网理论速度的 80%+
4. **用户体验**: 符合 Material Design 规范，流畅度 60fps
5. **兼容性**: 支持 Android 5.0+ (API 21+)

---

## 📝 下一步行动

1. **立即开始**: 初始化 React Native 项目
2. **第一周任务**: 完成基础框架和连接功能
3. **关键决策**: 确定是否使用 Expo（推荐纯 RN CLI，更灵活）
4. **环境准备**: 安装 Android Studio、配置模拟器

---

**文档版本**: v1.0  
**创建时间**: 2026-03-31  
**最后更新**: 2026-03-31
