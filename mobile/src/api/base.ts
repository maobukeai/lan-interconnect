/**
 * API 基础配置和请求封装
 */
import axios, { AxiosInstance, AxiosRequestConfig, AxiosError } from 'axios';
import store from '../store';
import { connectionSlice } from '../store/slices/connectionSlice';

class ApiClient {
  private client: AxiosInstance;
  
  constructor() {
    this.client = axios.create({
      timeout: 30000, // 30 秒超时
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    this.setupInterceptors();
  }
  
  /**
   * 设置请求/响应拦截器
   */
  private setupInterceptors() {
    // 请求拦截器 - 自动注入 PIN 码和服务器地址
    this.client.interceptors.request.use(
      config => {
        const state = store.getState();
        const { pin, serverUrl } = state.connection;
        
        if (serverUrl) {
          // 替换 baseURL 为当前连接的服务器
          config.baseURL = serverUrl;
        }
        
        // 自动注入 PIN 码
        if (pin) {
          config.headers['x-pin'] = pin;
        }
        
        console.log('[API Request]', config.method?.toUpperCase(), config.url);
        return config;
      },
      error => {
        console.error('[API Request Error]', error);
        return Promise.reject(error);
      }
    );
    
    // 响应拦截器 - 统一错误处理
    this.client.interceptors.response.use(
      response => {
        console.log('[API Response]', response.config.url, response.status);
        return response;
      },
      (error: AxiosError) => {
        console.error('[API Response Error]', error.response?.status, error.message);
        
        // 401 未授权 - 断开连接
        if (error.response?.status === 401) {
          store.dispatch(connectionSlice.actions.disconnect());
        }
        
        // 403 禁止访问
        if (error.response?.status === 403) {
          console.warn('IP 不在白名单或路径不安全');
        }
        
        return Promise.reject(error);
      }
    );
  }
  
  /**
   * GET 请求
   */
  async get<T>(url: string, config?: AxiosRequestConfig) {
    const response = await this.client.get<T>(url, config);
    return response.data;
  }
  
  /**
   * POST 请求
   */
  async post<T>(url: string, data?: any, config?: AxiosRequestConfig) {
    const response = await this.client.post<T>(url, data, config);
    return response.data;
  }
  
  /**
   * DELETE 请求
   */
  async delete<T>(url: string, config?: AxiosRequestConfig) {
    const response = await this.client.delete<T>(url, config);
    return response.data;
  }
  
  /**
   * PUT 请求
   */
  async put<T>(url: string, data?: any, config?: AxiosRequestConfig) {
    const response = await this.client.put<T>(url, data, config);
    return response.data;
  }
  
  /**
   * 下载文件（返回 Blob）
   */
  async downloadBlob(url: string, config?: AxiosRequestConfig) {
    const response = await this.client.get(url, {
      ...config,
      responseType: 'blob',
    });
    return response.data as Blob;
  }
}

// 导出单例
export default new ApiClient();
