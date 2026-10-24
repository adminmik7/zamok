package ru.zamok.app;

import android.graphics.Color;
import android.os.Bundle;
import android.view.View;

import androidx.core.view.WindowCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String BACKGROUND = "#0b0d12";

    @Override
    protected void load() {
        // The bridge is created inside load(), so the plugin has to be
        // registered before it runs — otherwise the JS side sees an unknown
        // "Update" plugin and the installer never opens.
        registerPlugin(UpdatePlugin.class);
        registerPlugin(NfcCardPlugin.class);
        super.load();
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Keep the window edge-to-edge on every Android version. From Android 15
        // the system forces it anyway, while older releases would otherwise fit
        // the WebView below the status bar and the CSS safe-area padding would be
        // applied on top of that offset.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        View webView = getBridge().getWebView();
        if (webView != null) {
            webView.setBackgroundColor(Color.parseColor(BACKGROUND));
        }
    }
}
