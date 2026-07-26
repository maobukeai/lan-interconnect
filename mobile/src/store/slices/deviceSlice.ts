/**
 * 设备状态 Slice
 * 管理在线设备和网络统计
 */
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Device, NetworkStats } from '../../api/endpoints';

interface DeviceState {
  devices: Device[];
  stats: NetworkStats | null;
  lastUpdate: number;
  loading: boolean;
}

const initialState: DeviceState = {
  devices: [],
  stats: null,
  lastUpdate: 0,
  loading: false,
};

const deviceSlice = createSlice({
  name: 'device',
  initialState,
  reducers: {
    /**
     * 开始加载设备列表
     */
    startLoading(state) {
      state.loading = true;
    },
    
    /**
     * 更新设备列表和统计
     */
    updateDevices(state, action: PayloadAction<{ devices: Device[]; stats: NetworkStats }>) {
      state.loading = false;
      state.devices = action.payload.devices;
      state.stats = action.payload.stats;
      state.lastUpdate = Date.now();
    },
    
    /**
     * 加载失败
     */
    loadError(state) {
      state.loading = false;
    },
    
    /**
     * 移除设备
     */
    removeDevice(state, action: PayloadAction<string>) {
      state.devices = state.devices.filter(d => d.ip !== action.payload);
    },
    
    /**
     * 清空设备列表
     */
    clearDevices(state) {
      state.devices = [];
      state.stats = null;
    },
  },
});

export const {
  startLoading,
  updateDevices,
  loadError,
  removeDevice,
  clearDevices,
} = deviceSlice.actions;

export default deviceSlice.reducer;
