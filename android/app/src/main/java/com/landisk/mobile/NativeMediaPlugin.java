package com.landisk.mobile;

import android.app.Activity;
import android.app.PictureInPictureParams;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Rational;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;

import android.view.WindowInsets;
import android.view.WindowInsetsController;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 原生媒体能力插件（沉浸式全屏 / 真后台音频 / 系统级画中画）
 * 供播放器 JS 在 Capacitor 容器内按需调用；浏览器与桌面端完全不经过此层。
 */
@CapacitorPlugin(name = "NativeMedia")
public class NativeMediaPlugin extends Plugin {

    private static NativeMediaPlugin instance;

    @Override
    public void load() {
        instance = this;
    }

    @Override
    protected void handleOnDestroy() {
        if (instance == this) {
            instance = null;
        }
    }

    /** 前台服务 → 插件 → JS 的事件桥：锁屏/耳机/通知栏按钮的播控指令 */
    public static void emitMediaControl(String action, Double seekTimeSec) {
        if (instance == null) return;
        JSObject data = new JSObject();
        data.put("action", action);
        if (seekTimeSec != null) data.put("time", seekTimeSec);
        instance.notifyListeners("mediaControl", data);
    }

    public static void emitMediaControl(String action) {
        emitMediaControl(action, null);
    }

    /** 沉浸式全屏：隐藏状态栏与导航栏（sticky 模式，滑出后自动收回）。退出全屏必须回传 false 还原 */
    @PluginMethod
    public void setImmersive(PluginCall call) {
        final Activity activity = bridge.getActivity();
        if (activity == null || activity.isFinishing()) {
            call.resolve();
            return;
        }
        final boolean on = Boolean.TRUE.equals(call.getBoolean("on", true));
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    Window window = activity.getWindow();
                    if (window == null) {
                        call.resolve();
                        return;
                    }
                    View decor = window.getDecorView();

                    // 1. AndroidX WindowCompat / WindowInsetsControllerCompat 现代统一控制
                    WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, decor);
                    if (controller != null) {
                        if (on) {
                            controller.hide(WindowInsetsCompat.Type.systemBars());
                            controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                        } else {
                            controller.show(WindowInsetsCompat.Type.systemBars());
                        }
                    }

                    // 2. 传统兼容层补丁 (针对 Android 10 及以下与各类定制 ROM)
                    if (on) {
                        window.addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
                        decor.setSystemUiVisibility(
                                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                            WindowManager.LayoutParams lp = window.getAttributes();
                            lp.layoutInDisplayCutoutMode =
                                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
                            window.setAttributes(lp);
                        }
                    } else {
                        window.clearFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
                        decor.setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                            WindowManager.LayoutParams lp = window.getAttributes();
                            lp.layoutInDisplayCutoutMode =
                                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_DEFAULT;
                            window.setAttributes(lp);
                        }
                    }
                } catch (Exception ignored) {
                }
                call.resolve();
            }
        });
    }

    /** 屏幕方向控制：横屏/竖屏/自动跟随传感器 */
    @PluginMethod
    public void setOrientation(PluginCall call) {
        final Activity activity = bridge.getActivity();
        if (activity == null || activity.isFinishing()) {
            call.resolve();
            return;
        }
        final String orientation = call.getString("orientation", "unspecified");
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    if ("landscape".equalsIgnoreCase(orientation) || "sensor_landscape".equalsIgnoreCase(orientation)) {
                        activity.setRequestedOrientation(android.content.pm.ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
                    } else if ("portrait".equalsIgnoreCase(orientation)) {
                        activity.setRequestedOrientation(android.content.pm.ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
                    } else {
                        activity.setRequestedOrientation(android.content.pm.ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
                    }
                } catch (Exception ignored) {
                }
                call.resolve();
            }
        });
    }

    /** 启动前台服务：进程在后台保活，WebView 音频得以继续，通知栏出现播控 */
    @PluginMethod
    public void enableBackgroundAudio(PluginCall call) {
        Context ctx = bridge.getContext();
        if (ctx == null) {
            call.resolve();
            return;
        }
        Intent intent = new Intent(ctx, BackgroundMediaService.class);
        intent.setAction(BackgroundMediaService.ACTION_ENABLE);
        intent.putExtra("title", call.getString("title", "正在播放"));
        intent.putExtra("artist", call.getString("artist", "猫步互联 Pro"));
        intent.putExtra("album", call.getString("album", "局域网直连"));
        intent.putExtra("playing", Boolean.TRUE.equals(call.getBoolean("playing", true)));
        try {
            ContextCompat.startForegroundService(ctx, intent);
        } catch (Exception ignored) {
        }
        // API 33+ 通知显示需要运行时权限；未授予时前台服务与音频保活不受影响，仅通知不显示
        Activity activity = bridge.getActivity();
        if (activity != null && Build.VERSION.SDK_INT >= 33) {
            try {
                activity.requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, 20013);
            } catch (Exception ignored) {
            }
        }
        call.resolve();
    }

    /** 更新通知栏与 MediaSession 的元数据 / 播放状态（切集、暂停恢复、进度推进时调用） */
    @PluginMethod
    public void updateBackgroundAudio(PluginCall call) {
        Context ctx = bridge.getContext();
        if (ctx == null) {
            call.resolve();
            return;
        }
        // 服务已死时把更新当一次冷启动，避免裸 startService 不调 startForeground 的类型崩溃
        Intent intent = new Intent(ctx, BackgroundMediaService.class);
        intent.setAction(BackgroundMediaService.isRunning() ? BackgroundMediaService.ACTION_UPDATE : BackgroundMediaService.ACTION_ENABLE);
        if (call.hasOption("title")) intent.putExtra("title", call.getString("title"));
        if (call.hasOption("artist")) intent.putExtra("artist", call.getString("artist"));
        if (call.hasOption("album")) intent.putExtra("album", call.getString("album"));
        if (call.hasOption("playing")) intent.putExtra("playing", Boolean.TRUE.equals(call.getBoolean("playing")));
        if (call.hasOption("position")) intent.putExtra("position", (long) (call.getDouble("position", 0d) * 1000d));
        if (call.hasOption("duration")) intent.putExtra("duration", (long) (call.getDouble("duration", 0d) * 1000d));
        if (call.hasOption("speed")) intent.putExtra("speed", (float) call.getDouble("speed", 1d).doubleValue());
        try {
            ctx.startService(intent);
        } catch (Exception ignored) {
        }
        call.resolve();
    }

    @PluginMethod
    public void disableBackgroundAudio(PluginCall call) {
        Context ctx = bridge.getContext();
        if (ctx != null) {
            Intent intent = new Intent(ctx, BackgroundMediaService.class);
            intent.setAction(BackgroundMediaService.ACTION_DISABLE);
            try {
                ctx.startService(intent);
            } catch (Exception ignored) {
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void isPipSupported(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("supported", Build.VERSION.SDK_INT >= Build.VERSION_CODES.O);
        call.resolve(ret);
    }

    /** 系统级画中画：整个 App 缩成系统小窗，WebView 继续播放 */
    @PluginMethod
    public void enterPip(PluginCall call) {
        final Activity activity = bridge.getActivity();
        if (activity == null || activity.isFinishing() || Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            call.resolve();
            return;
        }
        try {
            PictureInPictureParams.Builder builder = new PictureInPictureParams.Builder();
            int w = call.getInt("width", 16) == null ? 16 : call.getInt("width", 16);
            int h = call.getInt("height", 9) == null ? 9 : call.getInt("height", 9);
            if (w <= 0) w = 16;
            if (h <= 0) h = 9;
            // 系统允许的宽高比区间约 [0.41841, 2.39]，越界会抛异常，这里先归一化
            double ratio = (double) w / (double) h;
            if (ratio > 2.39) w = (int) Math.round(h * 2.39);
            if (ratio < 0.41841) h = (int) Math.round(w / 0.41841);
            builder.setAspectRatio(new Rational(Math.max(1, w), Math.max(1, h)));
            activity.enterPictureInPictureMode(builder.build());
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }
}
