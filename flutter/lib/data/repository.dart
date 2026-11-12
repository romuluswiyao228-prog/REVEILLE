import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive_flutter/hive_flutter.dart';

import '../features/mission/rep_counter.dart';
import 'models.dart';

/// Base locale Hive (boxes de Map, sans génération de code). Tout reste sur l'appareil.
class Repository {
  Repository._(this._alarms, this._history, this._prefs);

  final Box _alarms;
  final Box _history;
  final Box _prefs;

  static late Repository instance;

  static Future<void> open() async {
    instance = Repository._(
      await Hive.openBox('alarms'),
      await Hive.openBox('history'),
      await Hive.openBox('prefs'),
    );
  }

  // ── Alarmes ────────────────────────────────────────────────
  List<AlarmModel> alarms() => _alarms.values.map((m) => AlarmModel.fromMap(Map.from(m as Map))).toList()
    ..sort((a, b) => (a.hour * 60 + a.minute).compareTo(b.hour * 60 + b.minute));
  AlarmModel? alarmById(int id) {
    final m = _alarms.get(id);
    return m == null ? null : AlarmModel.fromMap(Map.from(m as Map));
  }

  Future<void> saveAlarm(AlarmModel a) => _alarms.put(a.id, a.toMap());
  Future<void> deleteAlarm(int id) => _alarms.delete(id);

  // ── Historique ─────────────────────────────────────────────
  List<HistoryEntry> history() =>
      _history.values.map((m) => HistoryEntry.fromMap(Map.from(m as Map))).toList()..sort((a, b) => b.at.compareTo(a.at));
  Future<void> addHistory(HistoryEntry e) => _history.add(e.toMap());

  // ── Réglages & limites quotidiennes ────────────────────────
  AppSettings settings() => AppSettings(
        locale: _prefs.get('locale', defaultValue: 'fr'),
        dark: _prefs.get('dark', defaultValue: true),
        volume: _prefs.get('volume', defaultValue: 0.8),
        sound: _prefs.get('sound', defaultValue: 'sunrise'),
        sensitivity: Sensitivity.values.byName(_prefs.get('sensitivity', defaultValue: 'normal')),
        strictValidation: _prefs.get('strict', defaultValue: true),
        allowSquats: _prefs.get('allowSquats', defaultValue: true),
        premium: _prefs.get('premium', defaultValue: false),
        emergencySnoozeDay: _prefs.get('emergencySnoozeDay', defaultValue: ''),
        problemDay: _prefs.get('problemDay', defaultValue: ''),
        manualDay: _prefs.get('manualDay', defaultValue: ''),
      );

  Future<void> put(String key, Object value) => _prefs.put(key, value);
}

final repositoryProvider = Provider<Repository>((_) => Repository.instance);

class SettingsNotifier extends StateNotifier<AppSettings> {
  SettingsNotifier(this._repo) : super(_repo.settings());
  final Repository _repo;

  Future<void> set(String key, Object value) async {
    await _repo.put(key, value);
    state = _repo.settings();
  }
}

final settingsProvider = StateNotifierProvider<SettingsNotifier, AppSettings>(
  (ref) => SettingsNotifier(ref.watch(repositoryProvider)),
);

/// Clé de jour « yyyy-MM-dd » : une limite quotidienne = comparer avec aujourd'hui.
String dayKey([DateTime? d]) {
  final n = d ?? DateTime.now();
  return '${n.year}-${n.month.toString().padLeft(2, '0')}-${n.day.toString().padLeft(2, '0')}';
}
