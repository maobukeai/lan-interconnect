/**
 * API 接口定义
 * 包含所有与 PC 端服务端通信的接口
 */
import api from './base';

// ==================== 类型定义 ====================

export interface Device {
  ip: string;
  userAgent: string;
  lastSeen: number;
}

export interface NetworkStats {
  rxBytes: number;
  txBytes: number;
  rxSpeed: number;
  txSpeed: number;
}

export interface ChatMessage {
  id: string;
  type: 'text' | 'image' | 'audio' | 'clear';
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

export interface DriveInfo {
  path: string;
  name: string;
  free: number;
  total: number;
}

export interface SystemInfo {
  hostname: string;
  platform: string;
  arch: string;
  uptime: number;
  memory: {
    total: number;
    free: number;
    used: number;
    usagePercent: number;
  };
  cpus: string;
  cores: number;
}

export interface ProcessInfo {
  pid: number;
  name: string;
  desc: string;
  mem: number;
}

export interface ShareLink {
  shareId: string;
  expiresAt: number;
}

// ==================== 设备管理 API ====================

export const deviceAPI = {
  /**
   * 获取在线设备列表和网络统计
   */
  getDevices: () => 
    api.get<{ devices: Device[]; stats: NetworkStats }>('/api/devices'),
  
  /**
   * 强制断开所有已连接设备
   */
  kickDevices: () => 
    api.post<{ success: boolean; kicked: number }>('/api/tools/kick-devices'),
};

// ==================== 聊天室 API ====================

export const chatAPI = {
  /**
   * 获取聊天消息历史
   */
  getMessages: () => 
    api.get<ChatMessage[]>('/api/chat'),
  
  /**
   * 发送聊天消息
   */
  sendMessage: (data: { 
    text: string; 
    sender: string; 
    type?: 'text' | 'image' | 'audio';
    action?: 'clear';
  }) => 
    api.post<{ success: boolean; message: ChatMessage }>('/api/chat', data),
  
  /**
   * 清空聊天记录
   */
  clearChat: (sender: string) => 
    chatAPI.sendMessage({ text: 'clear', sender, action: 'clear' }),
};

// ==================== 文件管理 API ====================

export const fileAPI = {
  /**
   * 获取磁盘驱动器列表
   */
  getDrives: () => 
    api.get<DriveInfo[]>('/api/drives'),
  
  /**
   * 获取目录文件列表
   */
  getFiles: (path?: string) => 
    api.get<{ currentPath: string; files: FileInfo[]; rootPath: string | null }>(
      '/api/files', 
      { params: { path } }
    ),
  
  /**
   * 下载单个文件
   */
  downloadFile: (path: string) => 
    api.downloadBlob('/api/download', { params: { path } }),
  
  /**
   * 批量打包下载文件
   */
  batchDownload: (files: string[], folderName?: string) => 
    api.downloadBlob('/api/download/batch', {
      data: { files, folderName },
    }),
  
  /**
   * 上传文件（原始二进制流）
   */
  uploadRaw: async (file: Blob, fileName: string, targetPath: string) => {
    // 使用 FormData 进行文件上传
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await api.post<{ message: string; filename: string }>(
      '/api/upload',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
          'x-upload-dir': encodeURIComponent(targetPath),
          'x-file-name': encodeURIComponent(fileName),
        },
      }
    );
    return response;
  },
  
  /**
   * 删除文件或文件夹
   */
  deleteFile: (path: string) => 
    api.delete<{ message: string }>('/api/files', { params: { path } }),
  
  /**
   * 新建文件夹
   */
  createFolder: (path: string) => 
    api.post<{ success: boolean }>('/api/mkdir', null, { params: { path } }),
  
  /**
   * 重命名文件/文件夹
   */
  rename: (oldPath: string, newPath: string) => 
    api.post<{ success: boolean }>('/api/rename', { oldPath, newPath }),
  
  /**
   * 移动文件（剪切/粘贴）
   */
  move: (source: string, destination: string) => 
    api.post<{ success: boolean }>('/api/move', { source, destination }),
  
  /**
   * 复制文件
   */
  copy: (source: string, destination: string) => 
    api.post<{ success: boolean }>('/api/copy', { source, destination }),
  
  /**
   * 保存文本文件
   */
  saveText: (path: string, content: string) => 
    api.post<{ success: boolean }>('/api/save-text', { path, content }),
};

// ==================== 分享链接 API ====================

export const shareAPI = {
  /**
   * 创建文件分享链接
   */
  createShare: (path: string, expireHours: number = 24) => 
    api.post<ShareLink>('/api/share', { path, expireHours }),
  
  /**
   * 清理过期分享链接
   */
  cleanLinks: () => 
    api.post<{ success: boolean; cleaned: number }>('/api/tools/clean-links'),
};

// ==================== 系统信息 API ====================

export const systemAPI = {
  /**
   * 获取系统信息
   */
  getSysInfo: () => 
    api.get<SystemInfo>('/api/sysinfo'),
  
  /**
   * 获取进程列表（仅 full 模式）
   */
  getProcesses: () => 
    api.get<ProcessInfo[]>('/api/processes'),
  
  /**
   * 终止进程（仅 full 模式）
   */
  killProcess: (pid: number) => 
    api.post<{ success: boolean }>('/api/kill-process', { pid }),
  
  /**
   * 执行终端命令（仅 full 模式）
   */
  executeCommand: (command: string, cwd?: string) => 
    api.post<{ output: string; error: string }>('/api/terminal', { command, cwd }),
};

// ==================== 剪贴板 API ====================

export const clipboardAPI = {
  /**
   * 获取系统剪贴板内容
   */
  getText: () => 
    api.get<{ text: string }>('/api/clipboard'),
  
  /**
   * 设置系统剪贴板内容
   */
  setText: (text: string) => 
    api.post<{ success: boolean }>('/api/clipboard', { text }),
};

// ==================== 基础验证 API ====================

export const verifyAPI = {
  /**
   * 验证服务可用性
   */
  verify: () => 
    api.get<{ success: boolean; mode: 'full' | 'shared' }>('/api/verify'),
};

// ==================== SSE 实时消息流 ====================

/**
 * 创建 SSE 连接到聊天流
 */
export const createChatEventSource = (serverUrl: string, pin: string) => {
  const url = `${serverUrl}/api/chat/stream?pin=${encodeURIComponent(pin)}`;
  
  // 使用 event-source-polyfill 支持 React Native
  const EventSource = require('event-source-polyfill');
  
  return new EventSource(url, {
    headers: {
      'x-pin': pin,
    },
  });
};
