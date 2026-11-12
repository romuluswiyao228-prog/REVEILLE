import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_mlkit_pose_detection/google_mlkit_pose_detection.dart';
import 'package:permission_handler/permission_handler.dart';

import '../../core/alarm/alarm_scheduler.dart';
import '../../data/models.dart';
import '../../data/repository.dart';
import '../../l10n/app_localizations.dart';
import 'mission_controller.dart';
import 'pose_analyzer.dart';
import 'rep_counter.dart';
import 'success_screen.dart';

class MissionScreen extends ConsumerStatefulWidget {
  const MissionScreen({super.key, required this.alarm});
  final AlarmModel alarm;
  @override
  ConsumerState<MissionScreen> createState() => _MissionScreenState();
}

class _MissionScreenState extends ConsumerState<MissionScreen> {
  MissionController? _ctrl;
  MissionState _state = const MissionState();
  bool _denied = false;

  @override
  void initState() {
    super.initState();
    _boot();
  }

  Future<void> _boot() async {
    // La caméra n'est demandée qu'ici, au moment où elle est nécessaire.
    final status = await Permission.camera.request();
    if (!status.isGranted) return setState(() => _denied = true);

    final repo = ref.read(repositoryProvider);
    final ctrl = MissionController(
      alarm: widget.alarm,
      settings: repo.settings(),
      onFinished: _onFinished,
    );
    ctrl.addListener((s) => mounted ? setState(() => _state = s) : null);
    _ctrl = ctrl;
    await ctrl.start();
  }

  Future<void> _onFinished(MissionResult r) async {
    final repo = ref.read(repositoryProvider);
    await repo.addHistory(HistoryEntry(
      at: DateTime.now(), exercise: widget.alarm.exercise, reps: r.reps, target: r.target,
      success: true, method: r.method, durationSec: r.duration.inSeconds,
    ));
    await AlarmScheduler.instance.stopRinging(); // la sonnerie ne s'arrête qu'ici
    if (mounted) Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => SuccessScreen(result: r)));
  }

  /// « J'ai un problème » : report unique de 10 min, 1 fois / jour, avec notification claire.
  Future<void> _postpone() async {
    final repo = ref.read(repositoryProvider);
    final s = repo.settings();
    if (s.problemDay == dayKey()) return;
    await ref.read(settingsProvider.notifier).set('problemDay', dayKey());
    await repo.addHistory(HistoryEntry(
      at: DateTime.now(), exercise: widget.alarm.exercise, reps: _state.count, target: widget.alarm.reps,
      success: false, method: MissionMethod.postponed, durationSec: _state.elapsed.inSeconds,
    ));
    await AlarmScheduler.instance.postpone(widget.alarm, const Duration(minutes: 10));
    if (mounted) Navigator.of(context).popUntil((r) => r.isFirst);
  }

  @override
  void dispose() {
    _ctrl?.dispose();
    super.dispose();
  }

  String _feedbackText(AppLocalizations l) => switch (_state.feedback) {
        RepFeedback.outOfFrame => l.fbOutOfFrame,
        RepFeedback.getInPosition => l.fbGetInPosition,
        RepFeedback.ready => l.fbReady,
        RepFeedback.goLower => l.fbGoLower,
        RepFeedback.pushUp => l.fbPushUp,
        RepFeedback.goodRep => l.fbGoodRep,
        RepFeedback.badPosition => l.fbBadPosition,
      };

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final settings = ref.watch(settingsProvider);
    final manualUsed = settings.manualDay == dayKey();
    final problemUsed = settings.problemDay == dayKey();
    final cam = _ctrl?.camera;

    return PopScope(
      canPop: false, // impossible de quitter sans finir la mission
      child: Scaffold(
        body: SafeArea(
          child: _denied
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(mainAxisSize: MainAxisSize.min, children: [
                      Text(l.cameraWhy, textAlign: TextAlign.center, style: const TextStyle(fontSize: 18)),
                      const SizedBox(height: 16),
                      FilledButton(onPressed: openAppSettings, child: Text(l.openSettings)),
                    ]),
                  ),
                )
              : Column(children: [
                  Expanded(
                    flex: 5,
                    child: Stack(fit: StackFit.expand, children: [
                      if (cam != null && cam.value.isInitialized) ClipRRect(borderRadius: BorderRadius.circular(24), child: CameraPreview(cam)),
                      if (_state.landmarks != null) CustomPaint(painter: _SkeletonPainter(_state.landmarks!)),
                      Positioned(
                        left: 16, right: 16, bottom: 16,
                        child: Container(
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(color: Colors.black87, borderRadius: BorderRadius.circular(16)),
                          child: Semantics(
                            liveRegion: true,
                            child: Text(_feedbackText(l), textAlign: TextAlign.center,
                                style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800)),
                          ),
                        ),
                      ),
                    ]),
                  ),
                  Expanded(
                    flex: 4,
                    child: Center(
                      child: Stack(alignment: Alignment.center, children: [
                        SizedBox(
                          width: 220, height: 220,
                          child: CircularProgressIndicator(value: _state.progress, strokeWidth: 16, strokeCap: StrokeCap.round),
                        ),
                        Column(mainAxisSize: MainAxisSize.min, children: [
                          Text('${_state.count}', style: const TextStyle(fontSize: 96, fontWeight: FontWeight.w900, height: 1)),
                          Text(l.remainingCount(_state.remaining), style: const TextStyle(fontSize: 16)),
                        ]),
                      ]),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                    child: Row(children: [
                      Expanded(
                        child: OutlinedButton(
                          onPressed: (!manualUsed && _state.manualUnlocked)
                              ? () async {
                                  await ref.read(settingsProvider.notifier).set('manualDay', dayKey());
                                  await _ctrl?.confirmManually();
                                }
                              : null,
                          child: Text(manualUsed
                              ? l.manualUsed
                              : _state.manualUnlocked
                                  ? l.manualConfirm
                                  : l.manualWait(30 - _state.elapsed.inSeconds)),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: FilledButton.tonal(
                          onPressed: problemUsed ? null : _postpone,
                          child: Text(problemUsed ? l.problemUsed : l.problem),
                        ),
                      ),
                    ]),
                  ),
                ]),
        ),
      ),
    );
  }
}

/// Silhouette : dessine les repères ML Kit mis à l'échelle de l'aperçu (miroir pour caméra frontale).
class _SkeletonPainter extends CustomPainter {
  _SkeletonPainter(this.body);
  final BodyLandmarks body;

  static const _links = <(PoseLandmarkType, PoseLandmarkType)>[
    (PoseLandmarkType.leftShoulder, PoseLandmarkType.leftElbow),
    (PoseLandmarkType.leftElbow, PoseLandmarkType.leftWrist),
    (PoseLandmarkType.rightShoulder, PoseLandmarkType.rightElbow),
    (PoseLandmarkType.rightElbow, PoseLandmarkType.rightWrist),
    (PoseLandmarkType.leftShoulder, PoseLandmarkType.leftHip),
    (PoseLandmarkType.rightShoulder, PoseLandmarkType.rightHip),
    (PoseLandmarkType.leftShoulder, PoseLandmarkType.rightShoulder),
    (PoseLandmarkType.leftHip, PoseLandmarkType.rightHip),
    (PoseLandmarkType.leftHip, PoseLandmarkType.leftKnee),
    (PoseLandmarkType.leftKnee, PoseLandmarkType.leftAnkle),
    (PoseLandmarkType.rightHip, PoseLandmarkType.rightKnee),
    (PoseLandmarkType.rightKnee, PoseLandmarkType.rightAnkle),
  ];

  @override
  void paint(Canvas canvas, Size size) {
    // Portrait : l'image ML Kit (après rotation) a width/height inversés par rapport au buffer capteur.
    final sx = size.width / body.imageSize.height;
    final sy = size.height / body.imageSize.width;
    Offset map(Offset o) => Offset(size.width - o.dx * sx, o.dy * sy); // miroir frontale

    final line = Paint()
      ..color = Colors.white
      ..strokeWidth = 4
      ..strokeCap = StrokeCap.round;
    final dot = Paint()..color = const Color(0xFFFF6B2C);

    for (final (a, b) in _links) {
      final pa = body.points[a], pb = body.points[b];
      if (pa != null && pb != null) canvas.drawLine(map(pa), map(pb), line);
    }
    for (final t in const [
      PoseLandmarkType.leftShoulder, PoseLandmarkType.rightShoulder,
      PoseLandmarkType.leftElbow, PoseLandmarkType.rightElbow,
      PoseLandmarkType.leftWrist, PoseLandmarkType.rightWrist,
      PoseLandmarkType.leftHip, PoseLandmarkType.rightHip,
    ]) {
      final p = body.points[t];
      if (p != null) canvas.drawCircle(map(p), 7, dot);
    }
  }

  @override
  bool shouldRepaint(covariant _SkeletonPainter old) => old.body != body;
}
