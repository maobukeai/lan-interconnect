/**
 * 连接状态 Slice
 * 管理与服务器连接相关的状态
 */
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface ConnectionState {
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  serverUrl: string;
  pin: string;
  deviceId: string;
  error?: string;
}

const initialState: ConnectionState = {
  status: 'disconnected',
  serverUrl: '',
  pin: '',
  deviceId: `mobile_${Date.now().toString(36)}`, // 生成唯一设备 ID
};

const connectionSlice = createSlice({
  name: 'connection',
  initialState,
  reducers: {
    /**
     * 开始连接
     */
    startConnecting(state, action: PayloadAction<{ serverUrl: string; pin?: string }>) {
      state.status = 'connecting';
      state.serverUrl = action.payload.serverUrl;
      state.pin = action.payload.pin || '';
      state.error = undefined;
    },
    
    /**
     * 连接成功
     */
    connected(state, action: PayloadAction<{ serverUrl: string; pin?: string }>) {
      state.status = 'connected';
      state.serverUrl = action.payload.serverUrl;
      state.pin = action.payload.pin || '';
      state.error = undefined;
    },
    
    /**
     * 连接失败
     */
    connectionError(state, action: PayloadAction<string>) {
      state.status = 'error';
      state.error = action.payload;
    },
    
    /**
     * 断开连接
     */
    disconnect(state) {
      state.status = 'disconnected';
      state.serverUrl = '';
      state.pin = '';
      state.error = undefined;
    },
    
    /**
     * 更新 PIN 码
     */
    updatePin(state, action: PayloadAction<string>) {
      state.pin = action.payload;
    },
    
    /**
     * 更新设备 ID
     */
    updateDeviceId(state, action: PayloadAction<string>) {
      state.deviceId = action.payload;
    },
  },
});

export const {
  startConnecting,
  connected,
  connectionError,
  disconnect,
  updatePin,
  updateDeviceId,
} = connectionSlice.actions;

export default connectionSlice.reducer;
