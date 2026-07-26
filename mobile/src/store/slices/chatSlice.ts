/**
 * 聊天状态 Slice
 * 管理聊天消息和 SSE 连接状态
 */
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { ChatMessage } from '../../api/endpoints';

interface ChatState {
  messages: ChatMessage[];
  isConnected: boolean;
  isStreaming: boolean; // SSE 连接状态
  unreadCount: number;
  error?: string;
}

const initialState: ChatState = {
  messages: [],
  isConnected: false,
  isStreaming: false,
  unreadCount: 0,
};

const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    /**
     * 设置初始消息列表
     */
    setMessages(state, action: PayloadAction<ChatMessage[]>) {
      state.messages = action.payload;
      state.unreadCount = 0;
    },
    
    /**
     * 添加新消息
     */
    addMessage(state, action: PayloadAction<ChatMessage>) {
      state.messages.push(action.payload);
      
      // 如果消息不是自己发送的，增加未读数
      if (action.payload.sender !== state.messages[0]?.sender) {
        state.unreadCount += 1;
      }
      
      // 限制消息数量（最多 100 条）
      if (state.messages.length > 100) {
        state.messages.shift();
      }
    },
    
    /**
     * 清空聊天
     */
    clearMessages(state) {
      state.messages = [];
      state.unreadCount = 0;
    },
    
    /**
     * SSE 连接建立
     */
  sseConnected(state) {
      state.isConnected = true;
      state.isStreaming = true;
      state.error = undefined;
    },
    
    /**
     * SSE 连接断开
     */
    sseDisconnected(state) {
      state.isConnected = false;
      state.isStreaming = false;
    },
    
    /**
     * SSE 连接错误
     */
    sseError(state, action: PayloadAction<string>) {
      state.error = action.payload;
      state.isConnected = false;
      state.isStreaming = false;
    },
    
    /**
     * 标记为已读
     */
    markAsRead(state) {
      state.unreadCount = 0;
    },
    
    /**
     * 删除消息
     */
    removeMessage(state, action: PayloadAction<string>) {
      state.messages = state.messages.filter(m => m.id !== action.payload);
    },
  },
});

export const {
  setMessages,
  addMessage,
  clearMessages,
  sseConnected,
  sseDisconnected,
  sseError,
  markAsRead,
  removeMessage,
} = chatSlice.actions;

export default chatSlice.reducer;
