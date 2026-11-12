import 'dart:async';

import 'package:camera/camera.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:vibration/vibration.dart';
import 'package:wakelock_plus/wakelock_plus.dart';

import '../../data/models.dart';
import 'pose_analyzer.dart';
import 'rep_counter.dart';

class MissionState {
  const MissionState({
    this.count = 0,
    this.target = 10,
    this.feedback = RepFeedback.getInPosition,
    this.phase = RepPhase.unknown,
    this.elapsed = Duration.zero,
    this.landmarks,
    this.done = false,
    this.cameraReady = false,
  });

  final int count;
  final int target;
  final RepFeedback feedback;
  final RepPhase phase;
  final Duration elapsed;
  final BodyLandmarks? landmarks;
  final bool done;
  final bool cameraReady;

  int get remaining => (target - count).clamp(0, target);
  double get progress => target == 0 ? 0 : count / target;

  /// Bouton « Confirmer manuellement » : disponible après 30 s.
  bool get manualUnlocked => elapsed >= const Duration(seconds: 30);

  MissionState copyWith({
    int? count,
    RepFeedback? feedback,
    RepPhase? phase,
    Duration? elapsed,
    BodyLandmarks? landmarks,
    bool? done,
    bool? cameraReady,
  }) =>
      MissionState(
        count: count ?? this.count,
        target: target,
        feedback: feedback ?? this.feedback,
        phase: phase ?? this.phase,
        elapsed: elapsed ?? this.elapsed,
        landmarks: landmarks ?? this.landmarks,
        done: done ?? this.done,
        cameraReady: cameraReady ?? this.cameraReady,
      );
}

class MissionController extends StateNotifier<MissionState> {
  MissionController({
    required this.alarm,
    required this.settings,
    required this.onFinished,
  })  : _counter = RepCounter(RepConfig.build(
          exercise: alarm.exercise,
          difficulty: alarm.difficulty,
          sensitivity: settings.sensitivity,
          strict: settings.strictValidation,
        )),
        _analyzer = PoseAnalyzer(exercise: alarm.exercise),
        super(MissionState(target: alarm.reps));

  final AlarmModel alarm;
  final AppSettings settings;
  final void Function(MissionResult) onFinished;

  final RepCounter _counter;
  final PoseAnalyzer _analyzer;
  CameraController? _camera;
  Timer? _timer;

  Future<void> start() async {
    await WakelockPlus.enable(); // écran allumé pendant la mission
    final cams = await availableCameras();
    final front = cams.firstWhere((c) => c.lensDirection == CameraLensDirection.front, orElse: () => cams.first);
    _camera = CameraController(
      front,
      ResolutionPreset.medium, // 480p : assez pour ML Kit, bien moins gourmand
      enableAudio: false,
      imageFormatGroup: ImageFormatGroup.nv21, // sur iOS : bgra8888 (géré par le plugin)
    );
    await _camera!.initialize();
    state = state.copyWith(cameraReady: true);

    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      state = state.copyWith(elapsed: state.elapsed + const Duration(seconds: 1));
    });

    // Flux d'images en mémoire uniquement — rien n'est écrit sur disque ni envoyé.
    await _camera!.startImageStream((img) async {
      final r = await _analyzer.process(img, front);
      if (r == null || state.done) return;
      final rep = _counter.update(r.sample);
      state = state.copyWith(
        count: _counter.count,
        feedback: _counter.feedback,
        phase: _counter.phase,
        landmarks: r.landmarks,
      );
      if (rep) await _onRep();
    });
  }

  CameraController? get camera => _camera;

  Future<void> _onRep() async {
    // Vibration progressive : plus on approche de la fin, plus elle est longue.
    if (await Vibration.hasVibrator() ?? false) {
      Vibration.vibrate(duration: 30 + (state.progress * 170).round());
    }
    if (state.count >= state.target) await _finish(MissionMethod.camera);
  }

  Future<void> confirmManually() async {
    if (!state.manualUnlocked) return;
    await _finish(MissionMethod.manual);
  }

  Future<void> _finish(MissionMethod method) async {
    state = state.copyWith(done: true);
    await _camera?.stopImageStream().catchError((_) {});
    onFinished(MissionResult(reps: state.count.clamp(0, state.target), target: state.target, method: method, duration: state.elapsed));
  }

  @override
  void dispose() {
    _timer?.cancel();
    _camera?.dispose();
    _analyzer.dispose();
    WakelockPlus.disable();
    super.dispose();
  }
}
