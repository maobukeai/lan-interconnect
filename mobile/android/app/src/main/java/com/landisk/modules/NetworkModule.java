package com.landisk.modules;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import androidx.annotation.NonNull;
import com.facebook.react.bridge.*;

import java.io.File;
import java.util.Enumeration;
import java.net.InetAddress;
import java.net.NetworkInterface;

/**
 * 网络发现模块
 * 提供局域网扫描、IP 地址获取等功能
 */
public class NetworkModule extends ReactContextBaseJavaModule {
    
    public NetworkModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }
    
    @Override
    @NonNull
    public String getName() {
        return "NetworkModule";
    }
    
    /**
     * 获取本地 IP 地址
     * @return Promise<String> 本地 IP 地址（192.168.x.x 格式）
     */
    @ReactMethod
    public void getLocalIpAddress(Promise promise) {
        try {
            Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
            
            while (interfaces.hasMoreElements()) {
                NetworkInterface networkInterface = interfaces.nextElement();
                Enumeration<InetAddress> addresses = networkInterface.getInetAddresses();
                
                while (addresses.hasMoreElements()) {
                    InetAddress address = addresses.nextElement();
                    
                    if (!address.isLoopbackAddress() && 
                        !address.isAnyLocalAddress() &&
                        address.getHostAddress().startsWith("192.168.")) {
                        
                        promise.resolve(address.getHostAddress());
                        return;
                    }
                }
            }
            
            // 如果没找到 192.168.x.x，返回第一个非回环地址
            interfaces = NetworkInterface.getNetworkInterfaces();
            while (interfaces.hasMoreElements()) {
                NetworkInterface networkInterface = interfaces.nextElement();
                Enumeration<InetAddress> addresses = networkInterface.getInetAddresses();
                
                while (addresses.hasMoreElements()) {
                    InetAddress address = addresses.nextElement();
                    if (!address.isLoopbackAddress() && !address.isAnyLocalAddress()) {
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
    
    /**
     * 扫描局域网设备
     * @param port 要扫描的端口
     * @return Promise<Array> 在线设备 IP 列表
     */
    @ReactMethod
    public void scanNetwork(int port, Promise promise) {
        WritableArray devices = Arguments.createArray();
        
        new Thread(() -> {
            try {
                // 获取本机 IP
                String localIp = null;
                Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
                
                while (interfaces.hasMoreElements()) {
                    NetworkInterface networkInterface = interfaces.nextElement();
                    Enumeration<InetAddress> addresses = networkInterface.getInetAddresses();
                    
                    while (addresses.hasMoreElements()) {
                        InetAddress address = addresses.nextElement();
                        if (!address.isLoopbackAddress() && address.getHostAddress().startsWith("192.168.")) {
                            localIp = address.getHostAddress();
                            break;
                        }
                    }
                    if (localIp != null) break;
                }
                
                if (localIp == null) {
                    promise.reject("ERROR", "Cannot determine local IP");
                    return;
                }
                
                // 扫描同一网段的其他设备
                String[] ipParts = localIp.split("\\.");
                String networkPrefix = ipParts[0] + "." + ipParts[1] + "." + ipParts[2] + ".";
                
                for (int i = 1; i <= 254; i++) {
                    String targetIp = networkPrefix + i;
                    
                    // 跳过本机
                    if (targetIp.equals(localIp)) continue;
                    
                    // Ping 测试
                    try {
                        InetAddress inetAddress = InetAddress.getByName(targetIp);
                        boolean isReachable = inetAddress.isReachable(500);
                        
                        if (isReachable) {
                            // 尝试连接指定端口
                            try {
                                java.net.Socket socket = new java.net.Socket();
                                socket.connect(new java.net.InetSocketAddress(targetIp, port), 300);
                                socket.close();
                                
                                synchronized (devices) {
                                    devices.pushString(targetIp);
                                }
                            } catch (Exception e) {
                                // 端口未开放
                            }
                        }
                    } catch (Exception e) {
                        // 主机不可达
                    }
                }
                
                promise.resolve(devices);
            } catch (Exception e) {
                promise.reject("ERROR", e.getMessage());
            }
        }).start();
    }
}
