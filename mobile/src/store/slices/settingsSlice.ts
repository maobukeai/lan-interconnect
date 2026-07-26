/**
 * 设置状态 Slice
 * 管理应用设置
 */
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface SettingsState {
  theme: 'light' | 'dark' | 'auto';
  primaryColor: string;
  autoConnect: boolean; // 自动连接上次服务器
  lastServerUrl?: string;
  lastPin?: string;
  notifications: boolean; // 是否启用通知
}

const initialState: SettingsState = {
  theme: 'auto',
  primaryColor: '#6366f1', // Indigo
  autoConnect: true,
  notifications: true,
};

const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
    /**
     * 更新主题
     */
    setTheme(state, action: PayloadAction<'light' | 'dark' | 'auto'>) {
      state.theme = action.payload;
    },
    
    /**
     * 更新主色调
     */
    setPrimaryColor(state, action: PayloadAction<string>) {
      state.primaryColor = action.payload;
    },
    
    /**
     * 更新自动连接设置
     */
    setAutoConnect(state, action: PayloadAction<boolean>) {
      state.autoConnect = action.payload;
    },
    
    /**
     * 保存上次连接的服务器
     */
    saveLastConnection(state, action: PayloadAction<{ serverUrl: string; pin?: string }>) {
      state.lastServerUrl = action.payload.serverUrl;
      state.lastPin = action.payload.pin;
    },
    
    /**
     * 清除上次连接信息
     */
    clearLastConnection(state) {
      state.lastServerUrl = undefined;
      state.lastPin = undefined;
    },
    
    /**
     * 更新通知设置
     */
    setNotifications(state, action: PayloadAction<boolean>) {
      state.notifications = action.payload;
    },
  },
});

export const {
  setTheme,
  setPrimaryColor,
  setAutoConnect,
  saveLastConnection,
  clearLastConnection,
  setNotifications,
} = settingsSlice.actions;

export default settingsSlice.reducer;
