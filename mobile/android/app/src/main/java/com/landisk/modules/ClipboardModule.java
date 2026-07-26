package com.landisk.modules;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import androidx.annotation.NonNull;
import com.facebook.react.bridge.*;
import com.facebook.react.modules.core.DeviceEventManagerModule;

/**
 * 剪贴板模块
 * 提供剪贴板读写和监听功能
 */
public class ClipboardModule extends ReactContextBaseJavaModule 
    implements ClipboardManager.OnPrimaryClipChangedListener {
    
    private ClipboardManager clipboard;
    private boolean isListening = false;
    
    public ClipboardModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }
    
    @Override
    @NonNull
    public String getName() {
        return "ClipboardModule";
    }
    
    /**
     * 获取剪贴板文本
     * @return Promise<String> 剪贴板内容
     */
    @ReactMethod
    public void getText(Promise promise) {
        try {
            Context context = getReactApplicationContext();
            ClipboardManager clipboardManager = 
                (ClipboardManager) context.getSystemService(Context.CLIPBOARD_SERVICE);
            
            if (clipboardManager == null) {
                promise.reject("ERROR", "Clipboard service not available");
                return;
            }
            
            ClipData clipData = clipboardManager.getPrimaryClip();
            
            if (clipData != null && clipData.getItemCount() > 0) {
                CharSequence text = clipData.getItemAt(0).getText();
                if (text != null) {
                    promise.resolve(text.toString());
                } else {
                    promise.resolve("");
                }
            } else {
                promise.resolve("");
            }
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }
    
    /**
     * 设置剪贴板文本
     * @param text 要复制的文本
     * @return Promise<Boolean> 是否成功
     */
    @ReactMethod
    public void setText(String text, Promise promise) {
        try {
            Context context = getReactApplicationContext();
            ClipboardManager clipboardManager = 
                (ClipboardManager) context.getSystemService(Context.CLIPBOARD_SERVICE);
            
            if (clipboardManager == null) {
                promise.reject("ERROR", "Clipboard service not available");
                return;
            }
            
            ClipData clip = ClipData.newPlainText("LanDisk", text);
            clipboardManager.setPrimaryClip(clip);
            
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }
    
    /**
     * 添加剪贴板变化监听器
     */
    @ReactMethod
    public void addClipboardListener() {
        if (!isListening) {
            Context context = getReactApplicationContext();
            clipboard = (ClipboardManager) context.getSystemService(Context.CLIPBOARD_SERVICE);
            
            if (clipboard != null) {
                clipboard.addPrimaryClipChangedListener(this);
                isListening = true;
            }
        }
    }
    
    /**
     * 移除剪贴板变化监听器
     */
    @ReactMethod
    public void removeClipboardListener() {
        if (isListening && clipboard != null) {
            clipboard.removePrimaryClipChangedListener(this);
            isListening = false;
        }
    }
    
    /**
     * 剪贴板内容变化回调
     */
    @Override
    public void onPrimaryClipChanged() {
        // 获取新的剪贴板内容
        if (clipboard != null) {
            ClipData clipData = clipboard.getPrimaryClip();
            
            if (clipData != null && clipData.getItemCount() > 0) {
                CharSequence text = clipData.getItemAt(0).getText();
                
                if (text != null) {
                    // 发送事件到 React Native
                    WritableMap params = Arguments.createMap();
                    params.putString("text", text.toString());
                    
                    getReactApplicationContext()
                        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                        .emit("onClipboardChange", params);
                }
            }
        }
    }
}
