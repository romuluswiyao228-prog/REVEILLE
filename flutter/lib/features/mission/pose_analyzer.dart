import 'dart:io';
import 'dart:math' as math;
import 'dart:ui';

import 'package:camera/camera.dart';
import 'package:google_mlkit_pose_detection/google_mlkit_pose_detection.dart';

import 'rep_counter.dart';

/// Repères du corps retournés à l'UI pour dessiner la silhouette.
class BodyLandmarks {
  const BodyLandmarks(this.points, this.imageSize);
  final Map<PoseLandmarkType, Offset> points;
  final Size imageSize;
}

class AnalyzerResult {
  const AnalyzerResult(this.sample, this.landmarks);
  final PoseSample? sample;
  final BodyLandmarks? landmarks;
}

/// Analyse les images caméra avec Google ML Kit Pose Detection (modèle embarqué, hors-ligne).
/// Aucune image n'est conservée : chaque frame est traitée en mémoire puis libérée.
class PoseAnalyzer {
  PoseAnalyzer({required this.exercise, this.frameSkip = 2})
      : _detector = PoseDetector(
          options: PoseDetectorOptions(
            mode: PoseDetectionMode.stream,
            model: PoseDetectionModel.base, // plus léger = meilleure batterie
          ),
        );

  final Exercise exercise;

  /// Ne traite qu'une frame sur (frameSkip + 1) → ~10 fps : suffisant et économe.
  final int frameSkip;

  final PoseDetector _detector;
  bool _busy = false;
  int _n = 0;
  final _clock = Stopwatch()..start();

  Future<AnalyzerResult?> process(CameraImage image, CameraDescription camera) async {
    if (_busy || (_n++ % (frameSkip + 1)) != 0) return null;
    _busy = true;
    try {
      final input = _toInputImage(image, camera);
      if (input == null) return null;
      final poses = await _detector.processImage(input);
      if (poses.isEmpty) return const AnalyzerResult(null, null);
      return _analyse(poses.first, input.metadata!.size);
    } finally {
      _busy = false;
    }
  }

  InputImage? _toInputImage(CameraImage image, CameraDescription camera) {
    final rotation = InputImageRotationValue.fromRawValue(camera.sensorOrientation);
    final format = InputImageFormatValue.fromRawValue(image.format.raw);
    if (rotation == null || format == null) return null;
    // Android : nv21 (1 plan) – iOS : bgra8888 (1 plan)
    if ((Platform.isAndroid && format != InputImageFormat.nv21) ||
        (Platform.isIOS && format != InputImageFormat.bgra8888) ||
        image.planes.length != 1) {
      return null;
    }
    final plane = image.planes.first;
    return InputImage.fromBytes(
      bytes: plane.bytes,
      metadata: InputImageMetadata(
        size: Size(image.width.toDouble(), image.height.toDouble()),
        rotation: rotation,
        format: format,
        bytesPerRow: plane.bytesPerRow,
      ),
    );
  }

  AnalyzerResult _analyse(Pose pose, Size size) {
    // Vue de profil : on prend le côté dont les repères sont les plus fiables.
    final left = _sideScore(pose, left: true);
    final useLeft = left >= _sideScore(pose, left: false);
    PoseLandmark? lm(PoseLandmarkType l, PoseLandmarkType r) => pose.landmarks[useLeft ? l : r];

    final shoulder = lm(PoseLandmarkType.leftShoulder, PoseLandmarkType.rightShoulder);
    final elbow = lm(PoseLandmarkType.leftElbow, PoseLandmarkType.rightElbow);
    final wrist = lm(PoseLandmarkType.leftWrist, PoseLandmarkType.rightWrist);
    final hip = lm(PoseLandmarkType.leftHip, PoseLandmarkType.rightHip);
    final knee = lm(PoseLandmarkType.leftKnee, PoseLandmarkType.rightKnee);
    final ankle = lm(PoseLandmarkType.leftAnkle, PoseLandmarkType.rightAnkle);

    final pts = <PoseLandmarkType, Offset>{
      for (final e in pose.landmarks.entries) e.key: Offset(e.value.x, e.value.y),
    };
    final marks = BodyLandmarks(pts, size);

    final needed = exercise == Exercise.pushup
        ? [shoulder, elbow, wrist, hip]
        : [hip, knee, ankle, shoulder];
    if (needed.any((p) => p == null)) return AnalyzerResult(null, marks);

    final conf = needed.map((p) => p!.likelihood).reduce((a, b) => a + b) / needed.length;

    // Hors cadre : repères hors de l'image.
    final inFrame = needed.every((p) => p!.x >= 0 && p.x <= size.width && p.y >= 0 && p.y <= size.height);

    late double angle;
    late bool aligned;
    if (exercise == Exercise.pushup) {
      angle = _angle(shoulder!, elbow!, wrist!);
      final dx = (shoulder.x - hip!.x).abs();
      final dy = (shoulder.y - hip.y).abs();
      aligned = dy < dx * 0.6; // épaules/hanches quasi à l'horizontale
    } else {
      angle = _angle(hip!, knee!, ankle!);
      final dx = (shoulder!.x - hip.x).abs();
      final dy = (shoulder.y - hip.y).abs();
      aligned = dx < dy; // tronc plutôt vertical
    }

    return AnalyzerResult(
      PoseSample(
        angle: angle,
        confidence: inFrame ? conf : 0,
        aligned: aligned,
        tMs: _clock.elapsedMilliseconds,
      ),
      marks,
    );
  }

  double _sideScore(Pose p, {required bool left}) {
    final types = left
        ? [PoseLandmarkType.leftShoulder, PoseLandmarkType.leftElbow, PoseLandmarkType.leftWrist, PoseLandmarkType.leftHip]
        : [PoseLandmarkType.rightShoulder, PoseLandmarkType.rightElbow, PoseLandmarkType.rightWrist, PoseLandmarkType.rightHip];
    return types.map((t) => p.landmarks[t]?.likelihood ?? 0).reduce((a, b) => a + b);
  }

  double _angle(PoseLandmark a, PoseLandmark b, PoseLandmark c) {
    final v1 = Offset(a.x - b.x, a.y - b.y);
    final v2 = Offset(c.x - b.x, c.y - b.y);
    final cos = (v1.dx * v2.dx + v1.dy * v2.dy) / ((v1.distance * v2.distance) == 0 ? 1 : v1.distance * v2.distance);
    return math.acos(cos.clamp(-1.0, 1.0)) * 180 / math.pi;
  }

  Future<void> dispose() => _detector.close();
}
