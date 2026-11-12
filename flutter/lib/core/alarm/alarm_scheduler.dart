import 'dart:io';

import 'package:flutter/services.dart';

import '../../data/models.dart';

/// Pont Dart ⇄ code natif pour planifier les alarmes de façon fiable.
///
/// Android : AlarmManager.setAlarmClock + Foreground Service + BootReceiver (voir android/).
/// iOS     : UNUserNotificationCenter (chaîne de notifications) + AVAudioSession (voir ios/).
class AlarmScheduler {
  AlarmScheduler._();
  static final instance = AlarmScheduler._();

  static const _channel = MethodChannel('app.wakefit/alarm');

  /// Appelé quand l'utilisateur ouvre l'app depuis une alarme (plein écran / notification).
  void listenForRing(void Function(int alarmId) onRing) {
    _channel.setMethodCallHandler((call) async {
      if (call.method == 'onRing') onRing((call.arguments as Map)['id'] as int);
    });
  }

  /// Alarme qui a déclenché le lancement de l'app (cold start).
  Future<int?> initialRingingAlarm() async => _channel.invokeMethod<int>('initialRingingAlarm');

  Future<void> schedule(AlarmModel a) async {
    if (!a.enabled) return cancel(a.id);
    await _channel.invokeMethod('schedule', {
      'id': a.id,
      'hour': a.hour,
      'minute': a.minute,
      'days': a.days,
      'label': a.label,
      'sound': a.sound,
      'volume': a.volume,
      'reps': a.reps,
      'exercise': a.exercise.name,
    });
  }

  Future<void> cancel(int id) => _channel.invokeMethod('cancel', {'id': id});

  /// Replanifie toutes les alarmes actives côté natif (filet de sécurité au lancement de l'app).
  Future<void> rescheduleAll() => _channel.invokeMethod('rescheduleAll');

  /// Report ponctuel (snooze d'urgence 5 min / « J'ai un problème » 10 min).
  Future<void> postpone(AlarmModel a, Duration d) => _channel.invokeMethod('postpone', {
        'id': a.id,
        'atMs': DateTime.now().add(d).millisecondsSinceEpoch,
        'label': a.label,
        'sound': a.sound,
        'volume': a.volume,
      });

  /// Arrête la sonnerie native (appelé uniquement quand la mission est réussie).
  Future<void> stopRinging() => _channel.invokeMethod('stopRinging');

  /// Android 12+ : SCHEDULE_EXACT_ALARM. Android 14+ : à accorder par l'utilisateur.
  Future<bool> canScheduleExact() async =>
      !Platform.isAndroid || (await _channel.invokeMethod<bool>('canScheduleExact') ?? false);

  Future<void> openExactAlarmSettings() => _channel.invokeMethod('openExactAlarmSettings');

  /// Android : exemption d'optimisation de batterie (fabricants agressifs : Xiaomi, Huawei…).
  Future<void> requestIgnoreBatteryOptimizations() => _channel.invokeMethod('requestIgnoreBatteryOptimizations');

  /// Notification claire lors d'un report (exigence produit).
  /// Affichée côté natif : « Mission reportée à HH:mm — dernier report aujourd'hui ».
}
