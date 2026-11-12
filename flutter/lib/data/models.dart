import '../features/mission/rep_counter.dart';

enum MissionMethod { camera, manual, postponed }

class AlarmModel {
  const AlarmModel({
    required this.id,
    required this.hour,
    required this.minute,
    this.days = const [], // 1 = lundi … 7 = dimanche ; vide = une fois
    this.label = '',
    this.sound = 'sunrise',
    this.volume = 0.8,
    this.exercise = Exercise.pushup,
    this.reps = 10, // 5..50
    this.difficulty = Difficulty.normal,
    this.enabled = true,
  });

  final int id; // int 31 bits : sert d'identifiant natif (AlarmManager / notifications)
  final int hour;
  final int minute;
  final List<int> days;
  final String label;
  final String sound;
  final double volume;
  final Exercise exercise;
  final int reps;
  final Difficulty difficulty;
  final bool enabled;

  AlarmModel copyWith({bool? enabled}) => AlarmModel(
        id: id, hour: hour, minute: minute, days: days, label: label, sound: sound,
        volume: volume, exercise: exercise, reps: reps, difficulty: difficulty,
        enabled: enabled ?? this.enabled,
      );

  Map<String, dynamic> toMap() => {
        'id': id, 'hour': hour, 'minute': minute, 'days': days, 'label': label,
        'sound': sound, 'volume': volume, 'exercise': exercise.name, 'reps': reps,
        'difficulty': difficulty.name, 'enabled': enabled,
      };

  factory AlarmModel.fromMap(Map m) => AlarmModel(
        id: m['id'] as int,
        hour: m['hour'] as int,
        minute: m['minute'] as int,
        days: (m['days'] as List).cast<int>(),
        label: m['label'] as String? ?? '',
        sound: m['sound'] as String? ?? 'sunrise',
        volume: (m['volume'] as num?)?.toDouble() ?? 0.8,
        exercise: Exercise.values.byName(m['exercise'] as String),
        reps: m['reps'] as int,
        difficulty: Difficulty.values.byName(m['difficulty'] as String),
        enabled: m['enabled'] as bool? ?? true,
      );
}

class HistoryEntry {
  const HistoryEntry({
    required this.at,
    required this.exercise,
    required this.reps,
    required this.target,
    required this.success,
    required this.method,
    required this.durationSec,
  });

  final DateTime at;
  final Exercise exercise;
  final int reps;
  final int target;
  final bool success;
  final MissionMethod method;
  final int durationSec;

  Map<String, dynamic> toMap() => {
        'at': at.millisecondsSinceEpoch, 'exercise': exercise.name, 'reps': reps,
        'target': target, 'success': success, 'method': method.name, 'durationSec': durationSec,
      };

  factory HistoryEntry.fromMap(Map m) => HistoryEntry(
        at: DateTime.fromMillisecondsSinceEpoch(m['at'] as int),
        exercise: Exercise.values.byName(m['exercise'] as String),
        reps: m['reps'] as int,
        target: m['target'] as int,
        success: m['success'] as bool,
        method: MissionMethod.values.byName(m['method'] as String),
        durationSec: m['durationSec'] as int,
      );
}

class MissionResult {
  const MissionResult({required this.reps, required this.target, required this.method, required this.duration});
  final int reps;
  final int target;
  final MissionMethod method;
  final Duration duration;
}

class AppSettings {
  const AppSettings({
    this.locale = 'fr',
    this.dark = true,
    this.volume = 0.8,
    this.sound = 'sunrise',
    this.sensitivity = Sensitivity.normal,
    this.strictValidation = true,
    this.allowSquats = true,
    this.premium = false,
    this.emergencySnoozeDay = '', // yyyy-MM-dd du dernier usage → limite 1 / jour
    this.problemDay = '',
    this.manualDay = '',
  });

  final String locale;
  final bool dark;
  final double volume;
  final String sound;
  final Sensitivity sensitivity;
  final bool strictValidation;
  final bool allowSquats;
  final bool premium;
  final String emergencySnoozeDay;
  final String problemDay;
  final String manualDay;
}
