package com.landisk.mobile;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.media.app.NotificationCompat.MediaStyle;

/**
 * 音频后台保活前台服务（foregroundServiceType="mediaPlayback"）。
 * 持有 MediaSessionCompat：锁屏/通知栏/蓝牙耳机的播控经 NativeMediaPlugin.emitMediaControl 桥接到 JS。
 */
public class BackgroundMediaService extends Service {

    public static final String CHANNEL_ID = "landisk_playback";
    public static final int NOTIFICATION_ID = 4711;

    public static final String ACTION_ENABLE = "com.landisk.mobile.media.ENABLE";
    public static final String ACTION_UPDATE = "com.landisk.mobile.media.UPDATE";
    public static final String ACTION_DISABLE = "com.landisk.mobile.media.DISABLE";
    public static final String ACTION_PREV = "com.landisk.mobile.media.PREV";
    public static final String ACTION_TOGGLE = "com.landisk.mobile.media.TOGGLE";
    public static final String ACTION_NEXT = "com.landisk.mobile.media.NEXT";
    public static final String ACTION_STOP = "com.landisk.mobile.media.STOP";

    private static volatile boolean sRunning = false;

    public static boolean isRunning() {
        return sRunning;
    }

    private MediaSessionCompat session;
    private PowerManager.WakeLock wakeLock;

    private String title = "正在播放";
    private String artist = "猫步互联 Pro";
    private String album = "局域网直连";
    private boolean playing = false;
    private long positionMs = 0L;
    private long durationMs = 0L;
    private float speed = 1f;

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        session = new MediaSessionCompat(this, "LandiskPlayback");
        session.setCallback(new MediaSessionCompat.Callback() {
            @Override
            public void onPlay() {
                NativeMediaPlugin.emitMediaControl("play");
            }

            @Override
            public void onPause() {
                NativeMediaPlugin.emitMediaControl("pause");
            }

            @Override
            public void onSkipToNext() {
                NativeMediaPlugin.emitMediaControl("next");
            }

            @Override
            public void onSkipToPrevious() {
                NativeMediaPlugin.emitMediaControl("prev");
            }

            @Override
            public void onSeekTo(long pos) {
                NativeMediaPlugin.emitMediaControl("seekto", pos / 1000.0);
            }

            @Override
            public void onStop() {
                NativeMediaPlugin.emitMediaControl("stop");
            }
        });
        session.setActive(true);

        try {
            wakeLock = ((PowerManager) getSystemService(POWER_SERVICE))
                    .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Landisk:Playback");
            wakeLock.setReferenceCounted(false);
        } catch (Exception ignored) {
        }
        sRunning = true;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;

        if (ACTION_DISABLE.equals(action)) {
            stopSelf();
            return START_NOT_STICKY;
        }
        if (ACTION_PREV.equals(action)) {
            NativeMediaPlugin.emitMediaControl("prev");
            return START_STICKY;
        }
        if (ACTION_TOGGLE.equals(action)) {
            NativeMediaPlugin.emitMediaControl(playing ? "pause" : "play");
            return START_STICKY;
        }
        if (ACTION_NEXT.equals(action)) {
            NativeMediaPlugin.emitMediaControl("next");
            return START_STICKY;
        }
        if (ACTION_STOP.equals(action)) {
            NativeMediaPlugin.emitMediaControl("stop");
            stopSelf();
            return START_NOT_STICKY;
        }

        // ENABLE / UPDATE：吸收 extras
        if (intent != null) {
            if (intent.getStringExtra("title") != null) title = intent.getStringExtra("title");
            if (intent.getStringExtra("artist") != null) artist = intent.getStringExtra("artist");
            if (intent.getStringExtra("album") != null) album = intent.getStringExtra("album");
            if (intent.hasExtra("playing")) playing = intent.getBooleanExtra("playing", playing);
            if (intent.hasExtra("position")) positionMs = intent.getLongExtra("position", positionMs);
            if (intent.hasExtra("duration")) durationMs = intent.getLongExtra("duration", durationMs);
            if (intent.hasExtra("speed")) speed = intent.getFloatExtra("speed", speed);
        }

        startInForeground();
        syncSession();
        if (playing) acquireWake();
        else releaseWake();

        // 通知栏按钮走 Service action 而不是 MediaSession 按键，双通道互不依赖
        if (ACTION_ENABLE.equals(action) || ACTION_UPDATE.equals(action)) {
            // 刷新通知以同步播放/暂停图标状态
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            try {
                nm.notify(NOTIFICATION_ID, buildNotification());
            } catch (Exception ignored) {
            }
        }
        return START_STICKY;
    }

    private void startInForeground() {
        Notification notification = buildNotification();
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    private void syncSession() {
        if (session == null) return;
        try {
            PlaybackStateCompat.Builder sb = new PlaybackStateCompat.Builder()
                    .setActions(PlaybackStateCompat.ACTION_PLAY
                            | PlaybackStateCompat.ACTION_PAUSE
                            | PlaybackStateCompat.ACTION_PLAY_PAUSE
                            | PlaybackStateCompat.ACTION_SKIP_TO_NEXT
                            | PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS
                            | PlaybackStateCompat.ACTION_SEEK_TO
                            | PlaybackStateCompat.ACTION_STOP)
                    .setState(playing ? PlaybackStateCompat.STATE_PLAYING : PlaybackStateCompat.STATE_PAUSED,
                            positionMs, playing ? speed : 0f);
            session.setPlaybackState(sb.build());

            MediaMetadataCompat.Builder mb = new MediaMetadataCompat.Builder()
                    .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title)
                    .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, artist)
                    .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, album);
            if (durationMs > 0) {
                mb.putLong(MediaMetadataCompat.METADATA_KEY_DURATION, durationMs);
            }
            session.setMetadata(mb.build());
        } catch (Exception ignored) {
        }
    }

    private PendingIntent servicePending(String action) {
        Intent i = new Intent(this, BackgroundMediaService.class).setAction(action);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getService(this, action.hashCode(), i, flags);
    }

    private Notification buildNotification() {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL_ID) == null) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "媒体播放", NotificationManager.IMPORTANCE_LOW);
            channel.setShowBadge(false);
            nm.createNotificationChannel(channel);
        }

        int launchFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 23) launchFlags |= PendingIntent.FLAG_IMMUTABLE;
        Intent launch = getPackageManager() != null
                ? getLaunchIntentForPackage()
                : null;
        PendingIntent contentPi = null;
        if (launch != null) contentPi = PendingIntent.getActivity(this, 0, launch, launchFlags);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_media_play)
                .setContentTitle(title)
                .setContentText(artist + (album != null && !album.isEmpty() ? " · " + album : ""))
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .addAction(new NotificationCompat.Action(android.R.drawable.ic_media_previous, "上一集", servicePending(ACTION_PREV)))
                .addAction(new NotificationCompat.Action(
                        playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play,
                        playing ? "暂停" : "播放", servicePending(ACTION_TOGGLE)))
                .addAction(new NotificationCompat.Action(android.R.drawable.ic_media_next, "下一集", servicePending(ACTION_NEXT)))
                .addAction(new NotificationCompat.Action(android.R.drawable.ic_menu_close_clear_cancel, "关闭", servicePending(ACTION_STOP)));
        if (contentPi != null) builder.setContentIntent(contentPi);
        if (session != null) {
            builder.setStyle(new MediaStyle()
                    .setMediaSession(session.getSessionToken())
                    .setShowActionsInCompactView(0, 1, 2));
        }
        return builder.build();
    }

    private Intent getLaunchIntentForPackage() {
        try {
            return getPackageManager().getLaunchIntentForPackage(getPackageName());
        } catch (Exception e) {
            return null;
        }
    }

    private void acquireWake() {
        if (wakeLock != null && !wakeLock.isHeld()) {
            try {
                wakeLock.acquire(4 * 60 * 60 * 1000L);
            } catch (Exception ignored) {
            }
        }
    }

    private void releaseWake() {
        if (wakeLock != null && wakeLock.isHeld()) {
            try {
                wakeLock.release();
            } catch (Exception ignored) {
            }
        }
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        // 用户从最近任务划掉 App：同步停掉通知与保活
        NativeMediaPlugin.emitMediaControl("stop");
        stopSelf();
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        releaseWake();
        if (session != null) {
            try {
                session.release();
            } catch (Exception ignored) {
            }
            session = null;
        }
        sRunning = false;
        super.onDestroy();
    }
}
