package app.wakefit

import android.app.AlarmManager
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import app.wakefit.alarm.AlarmService
import app.wakefit.alarm.AlarmStore
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import org.json.JSONArray
import org.json.JSONObject

class MainActivity : FlutterActivity() {
    private var channel: MethodChannel? = null

    override fun configureFlutterEngine(engine: FlutterEngine) {
        super.configureFlutterEngine(engine)
        channel = MethodChannel(engine.dartExecutor.binaryMessenger, "app.wakefit/alarm").also { ch ->
            ch.setMethodCallHandler { call, result ->
                when (call.method) {
                    "schedule" -> {
                        val a = JSONObject().apply {
                            put("id", call.argument<Int>("id"))
                            put("hour", call.argument<Int>("hour"))
                            put("minute", call.argument<Int>("minute"))
                            put("days", JSONArray(call.argument<List<Int>>("days") ?: emptyList<Int>()))
                            put("label", call.argument<String>("label") ?: "")
                            put("sound", call.argument<String>("sound") ?: "sunrise")
                            put("volume", call.argument<Double>("volume") ?: 0.8)
                            put("reps", call.argument<Int>("reps"))
                            put("exercise", call.argument<String>("exercise"))
                            put("enabled", true)
                        }
                        AlarmStore.save(this, a); AlarmStore.schedule(this, a); result.success(null)
                    }
                    "postpone" -> {
                        val a = JSONObject().apply {
                            put("id", call.argument<Int>("id")); put("atMs", call.argument<Long>("atMs"))
                            put("label", call.argument<String>("label") ?: "")
                            put("sound", call.argument<String>("sound") ?: "sunrise")
                            put("volume", call.argument<Double>("volume") ?: 0.8)
                            put("days", JSONArray()); put("hour", 0); put("minute", 0)
                        }
                        // Le report est une alarme exacte ponctuelle : NE remplace PAS l'alarme récurrente (non persisté).
                        stopService(Intent(this, AlarmService::class.java))
                        AlarmStore.schedule(this, a); result.success(null)
                    }
                    "cancel" -> {
                        val id = call.argument<Int>("id")!!
                        AlarmStore.cancel(this, id); AlarmStore.remove(this, id); result.success(null)
                    }
                    "stopRinging" -> { stopService(Intent(this, AlarmService::class.java)); result.success(null) }
                    "initialRingingAlarm" -> result.success(
                        intent?.getIntExtra("ringingAlarmId", -1)?.takeIf { it != -1 } ?: AlarmService.currentAlarmId
                    )
                    "canScheduleExact" -> {
                        val am = getSystemService(ALARM_SERVICE) as AlarmManager
                        result.success(Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms())
                    }
                    "openExactAlarmSettings" -> {
                        if (Build.VERSION.SDK_INT >= 31)
                            startActivity(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:$packageName")))
                        result.success(null)
                    }
                    "requestIgnoreBatteryOptimizations" -> {
                        val pm = getSystemService(POWER_SERVICE) as PowerManager
                        if (!pm.isIgnoringBatteryOptimizations(packageName))
                            startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName")))
                        result.success(null)
                    }
                    else -> result.notImplemented()
                }
            }
        }
    }

    // App déjà ouverte (singleTop) et alarme qui sonne : on prévient Flutter.
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        val id = intent.getIntExtra("ringingAlarmId", -1)
        if (id != -1) channel?.invokeMethod("onRing", mapOf("id" to id))
    }
}
