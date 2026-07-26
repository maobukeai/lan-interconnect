/**
 * 连接管理服务
 * 处理与服务器的连接、断开、重连等逻辑
 */
import { store, AppDispatch } from '../store';
import {
  startConnecting,
  connected,
  connectionError,
  disconnect,
} from '../store/slices/connectionSlice';
import { verifyAPI, createChatEventSource } from '../api/endpoints';
import { sseConnected, sseDisconnected, setMessages, addMessage } from '../store/slices/chatSlice';
import { EventSourcePolyfill } from 'event-source-polyfill';

export class ConnectionService {
  private eventSource: EventSourcePolyfill | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private readonly MAX_RECONNECT_ATTEMPTS = 3;
  private reconnectAttempts = 0;

  /**
   * 连接到服务器
   */
  async connect(serverUrl: string, pin?: string) {
    const dispatch: AppDispatch = store.dispatch;
    
    try {
      dispatch(startConnecting({ serverUrl, pin }));
      
      // 1. 验证连接
      const result = await verifyAPI.verify();
      console.log('[Connection] Server verified:', result);
      
      // 2. 连接成功
      dispatch(connected({ serverUrl, pin }));
      
      // 3. 建立 SSE 连接
      this.initSSE(serverUrl, pin || '');
      
      return { success: true };
    } catch (error: any) {
      console.error('[Connection] Failed to connect:', error);
      dispatch(connectionError(error.message || '连接失败'));
      return { 
        success: false, 
        error: error.message || '连接失败' 
      };
    }
  }

  /**
   * 初始化 SSE 实时消息流
   */
  private initSSE(serverUrl: string, pin: string) {
    try {
      // 关闭旧的连接
      if (this.eventSource) {
        this.eventSource.close();
      }

      const url = `${serverUrl}/api/chat/stream?pin=${encodeURIComponent(pin)}`;
      
      this.eventSource = new EventSourcePolyfill(url, {
        headers: {
          'x-pin': pin,
        },
        heartbeatTimeout: 60000, // 60 秒超时
      });

      // 监听消息事件
      this.eventSource.onmessage = (event: any) => {
        try {
          const data = JSON.parse(event.data);
          const dispatch: AppDispatch = store.dispatch;
          
          if (data.type === 'init') {
            // 初始消息列表
            dispatch(setMessages(data.messages));
            console.log('[SSE] Initial messages loaded:', data.messages.length);
          } else if (data.type === 'new') {
            // 新消息
            dispatch(addMessage(data.message));
            console.log('[SSE] New message received:', data.message.id);
          }
        } catch (error) {
          console.error('[SSE] Error parsing message:', error);
        }
      };

      // 监听连接打开
      this.eventSource.onopen = () => {
        console.log('[SSE] Connected');
        store.dispatch(sseConnected());
        this.reconnectAttempts = 0; // 重置重连计数
      };

      // 监听错误
      this.eventSource.onerror = () => {
        console.error('[SSE] Error occurred');
        store.dispatch(sseDisconnected());
        
        // 自动重连
        this.scheduleReconnect(serverUrl, pin);
      };

    } catch (error) {
      console.error('[SSE] Failed to initialize:', error);
      store.dispatch(sseDisconnected());
    }
  }

  /**
   * 安排重连
   */
  private scheduleReconnect(serverUrl: string, pin: string) {
    if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
      console.log('[SSE] Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts += 1;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    
    console.log(`[SSE] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    this.reconnectTimer = setTimeout(() => {
      this.initSSE(serverUrl, pin);
    }, delay);
  }

  /**
   * 断开连接
   */
  disconnect() {
    // 关闭 SSE 连接
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    
    // 清除重连定时器
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    // 更新 Redux 状态
    store.dispatch(disconnect());
    store.dispatch(sseDisconnected());
    
    console.log('[Connection] Disconnected');
  }

  /**
   * 发送聊天消息
   */
  async sendMessage(text: string, type: 'text' | 'image' | 'audio' = 'text') {
    const state = store.getState();
    const { serverUrl, pin, deviceId } = state.connection;
    
    if (!serverUrl) {
      throw new Error('未连接到服务器');
    }

    const { chatAPI } = await import('../api/endpoints');
    
    try {
      const response = await chatAPI.sendMessage({
        text,
        sender: deviceId,
        type,
      });
      
      console.log('[Chat] Message sent:', response.message.id);
      return response;
    } catch (error: any) {
      console.error('[Chat] Failed to send message:', error);
      throw error;
    }
  }

  /**
   * 获取当前连接状态
   */
  getConnectionStatus() {
    const state = store.getState();
    return state.connection;
  }
}

// 导出单例
export const connectionService = new ConnectionService();
