/**
 * 文件状态 Slice
 * 管理文件浏览、上传、下载相关状态
 */
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { FileInfo, DriveInfo } from '../../api/endpoints';

interface UploadTask {
  id: string;
  fileName: string;
  progress: number;
  status: 'pending' | 'uploading' | 'completed' | 'error';
  error?: string;
}

interface DownloadTask {
  id: string;
  fileName: string;
  progress: number;
  status: 'pending' | 'downloading' | 'completed' | 'error';
  error?: string;
}

interface FileState {
  currentPath: string;
  rootPath: string | null; // 根目录（C:\或共享目录）
  fileList: FileInfo[];
  drives: DriveInfo[];
  uploadQueue: UploadTask[];
  downloadQueue: DownloadTask[];
  loading: boolean;
  error?: string;
}

const initialState: FileState = {
  currentPath: '',
  rootPath: null,
  fileList: [],
  drives: [],
  uploadQueue: [],
  downloadQueue: [],
  loading: false,
};

const fileSlice = createSlice({
  name: 'file',
  initialState,
  reducers: {
    /**
     * 设置当前路径
     */
    setCurrentPath(state, action: PayloadAction<string>) {
      state.currentPath = action.payload;
    },
    
    /**
     * 设置根目录
     */
    setRootPath(state, action: PayloadAction<string | null>) {
      state.rootPath = action.payload;
    },
    
    /**
     * 开始加载文件列表
     */
    startLoading(state) {
      state.loading = true;
      state.error = undefined;
    },
    
    /**
     * 文件列表加载成功
     */
    filesLoaded(state, action: PayloadAction<{ files: FileInfo[]; currentPath: string }>) {
      state.loading = false;
      state.fileList = action.payload.files;
      state.currentPath = action.payload.currentPath;
    },
    
    /**
     * 加载失败
     */
    loadError(state, action: PayloadAction<string>) {
      state.loading = false;
      state.error = action.payload;
    },
    
    /**
     * 获取驱动器列表
     */
    setDrives(state, action: PayloadAction<DriveInfo[]>) {
      state.drives = action.payload;
    },
    
    /**
     * 添加上传任务
     */
    addUploadTask(state, action: PayloadAction<UploadTask>) {
      state.uploadQueue.push(action.payload);
    },
    
    /**
     * 更新上传进度
     */
    updateUploadProgress(state, action: PayloadAction<{ id: string; progress: number }>) {
      const task = state.uploadQueue.find(t => t.id === action.payload.id);
      if (task) {
        task.progress = action.payload.progress;
      }
    },
    
    /**
     * 上传完成
     */
    uploadComplete(state, action: PayloadAction<{ id: string; error?: string }>) {
      const task = state.uploadQueue.find(t => t.id === action.payload.id);
      if (task) {
        task.status = action.payload.error ? 'error' : 'completed';
        task.error = action.payload.error;
        task.progress = 100;
      }
    },
    
    /**
     * 移除上传任务
     */
    removeUploadTask(state, action: PayloadAction<string>) {
      state.uploadQueue = state.uploadQueue.filter(t => t.id !== action.payload);
    },
    
    /**
     * 添加下载任务
     */
    addDownloadTask(state, action: PayloadAction<DownloadTask>) {
      state.downloadQueue.push(action.payload);
    },
    
    /**
     * 更新下载进度
     */
    updateDownloadProgress(state, action: PayloadAction<{ id: string; progress: number }>) {
      const task = state.downloadQueue.find(t => t.id === action.payload.id);
      if (task) {
        task.progress = action.payload.progress;
      }
    },
    
    /**
     * 下载完成
     */
    downloadComplete(state, action: PayloadAction<{ id: string; error?: string }>) {
      const task = state.downloadQueue.find(t => t.id === action.payload.id);
      if (task) {
        task.status = action.payload.error ? 'error' : 'completed';
        task.error = action.payload.error;
        task.progress = 100;
      }
    },
    
    /**
     * 移除下载任务
     */
    removeDownloadTask(state, action: PayloadAction<string>) {
      state.downloadQueue = state.downloadQueue.filter(t => t.id !== action.payload);
    },
    
    /**
     * 清空文件列表
     */
    clearFiles(state) {
      state.fileList = [];
      state.currentPath = '';
    },
  },
});

export const {
  setCurrentPath,
  setRootPath,
  startLoading,
  filesLoaded,
  loadError,
  setDrives,
  addUploadTask,
  updateUploadProgress,
  uploadComplete,
  removeUploadTask,
  addDownloadTask,
  updateDownloadProgress,
  downloadComplete,
  removeDownloadTask,
  clearFiles,
} = fileSlice.actions;

export default fileSlice.reducer;
