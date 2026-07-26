package com.landisk.modules;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.webkit.MimeTypeMap;
import androidx.annotation.NonNull;
import androidx.core.content.FileProvider;
import com.facebook.react.bridge.*;

import java.io.File;

/**
 * 文件操作模块
 * 提供文件访问、打开等功能
 */
public class FileModule extends ReactContextBaseJavaModule {
    
    public FileModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }
    
    @Override
    @NonNull
    public String getName() {
        return "FileModule";
    }
    
    /**
     * 获取外部存储路径
     * @return Promise<String> 外部存储绝对路径
     */
    @ReactMethod
    public void getExternalStoragePath(Promise promise) {
        try {
            Context context = getReactApplicationContext();
            File externalDir = context.getExternalFilesDir(null);
            
            if (externalDir != null) {
                promise.resolve(externalDir.getAbsolutePath());
            } else {
                promise.reject("ERROR", "External storage not available");
            }
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }
    
    /**
     * 打开文件（使用系统默认应用）
     * @param filePath 文件路径
     * @return Promise<Boolean> 是否成功打开
     */
    @ReactMethod
    public void openFile(String filePath, Promise promise) {
        try {
            File file = new File(filePath);
            
            if (!file.exists()) {
                promise.reject("ERROR", "File not found");
                return;
            }
            
            // 创建 Uri
            Uri uri = FileProvider.getUriForFile(
                getReactApplicationContext(),
                getReactApplicationContext().getPackageName() + ".provider",
                file
            );
            
            // 创建 Intent
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, getMimeType(filePath));
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            
            // 检查是否有应用可以处理此 Intent
            if (intent.resolveActivity(getReactApplicationContext().getPackageManager()) != null) {
                getCurrentActivity().startActivity(intent);
                promise.resolve(true);
            } else {
                promise.reject("ERROR", "No application can open this file");
            }
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }
    
    /**
     * 获取文件 MIME 类型
     */
    private String getMimeType(String path) {
        String extension = getFileExtension(path);
        
        if (extension == null) {
            return "*/*";
        }
        
        MimeTypeMap mimeTypeMap = MimeTypeMap.getSingleton();
        String mimeType = mimeTypeMap.getMimeTypeFromExtension(extension.toLowerCase());
        
        return mimeType != null ? mimeType : "*/*";
    }
    
    /**
     * 获取文件扩展名
     */
    private String getFileExtension(String path) {
        int lastDot = path.lastIndexOf('.');
        if (lastDot > 0) {
            return path.substring(lastDot + 1);
        }
        return null;
    }
    
    /**
     * 检查文件是否存在
     * @param filePath 文件路径
     * @return Promise<Boolean> 是否存在
     */
    @ReactMethod
    public void exists(String filePath, Promise promise) {
        try {
            File file = new File(filePath);
            promise.resolve(file.exists());
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }
    
    /**
     * 获取文件大小
     * @param filePath 文件路径
     * @return Promise<Long> 文件大小（字节）
     */
    @ReactMethod
    public void getSize(String filePath, Promise promise) {
        try {
            File file = new File(filePath);
            if (file.exists()) {
                promise.resolve(file.length());
            } else {
                promise.reject("ERROR", "File not found");
            }
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }
}
