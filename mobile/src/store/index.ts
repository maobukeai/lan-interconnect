/**
 * Redux Store 配置
 */
import { configureStore } from '@reduxjs/toolkit';
import connectionReducer from './slices/connectionSlice';
import fileReducer from './slices/fileSlice';
import chatReducer from './slices/chatSlice';
import deviceReducer from './slices/deviceSlice';
import settingsReducer from './slices/settingsSlice';

const store = configureStore({
  reducer: {
    connection: connectionReducer,
    file: fileReducer,
    chat: chatReducer,
    device: deviceReducer,
    settings: settingsReducer,
  },
  middleware: getDefaultMiddleware =>
    getDefaultMiddleware({
      serializableCheck: {
        // 忽略 SSE 连接的序列化检查
        ignoredActions: ['chat/sseConnected', 'chat/sseDisconnected'],
        // 忽略 event source 实例的序列化检查
        ignoredPaths: ['chat.eventSource'],
      },
    }),
});

// 导出类型
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export default store;
