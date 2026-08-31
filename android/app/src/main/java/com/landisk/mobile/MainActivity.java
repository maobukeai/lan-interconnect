package com.landisk.mobile;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 沉浸式全屏 / 后台音频 / 系统画中画
        registerPlugin(NativeMediaPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
