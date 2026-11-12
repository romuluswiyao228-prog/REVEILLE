package com.reveil.app;

import android.content.Intent;
import android.os.Bundle;
import android.view.WindowManager;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import android.Manifest;
import android.content.pm.PackageManager;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final int CAM_REQ = 42;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(WakeAlarmPlugin.class);
        super.onCreate(savedInstanceState);
        // Permission caméra runtime : le WebChromeClient de Capacitor accorde
        // ensuite RESOURCE_VIDEO_CAPTURE à getUserMedia automatiquement.
        // Ne pas remplacer setWebChromeClient : cela casserait le sélecteur
        // de fichiers (musique personnalisée) et le bridge.
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
                != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.CAMERA}, CAM_REQ);
        }
        // L'alarme doit pouvoir sonner sans geste utilisateur (lancement plein écran).
        getBridge().getWebView().getSettings().setMediaPlaybackRequiresUserGesture(false);
        applyAlarmWindowFlags(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        applyAlarmWindowFlags(intent);
        String alarmId = intent != null ? intent.getStringExtra("alarmId") : null;
        if (alarmId != null) WakeAlarmPlugin.deliverFired(getBridge(), alarmId);
    }

    /** Ouverture par une alarme : écran allumé, visible sur le verrouillage, jamais éteint. */
    private void applyAlarmWindowFlags(Intent intent) {
        if (intent != null && intent.hasExtra("alarmId")) {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                    | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                    | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        }
    }
}
