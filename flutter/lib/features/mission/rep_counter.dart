/// Compteur de répétitions : machine à états pure (aucune dépendance Flutter),
/// donc 100 % testable en unit test.
///
/// Cycle valide : HAUT → BAS (descente suffisante) → HAUT (remontée complète) = +1.
library;

enum Exercise { pushup, squat }

enum Difficulty { easy, normal, hard }

enum Sensitivity { low, normal, high }

enum RepPhase { unknown, up, down }

enum RepFeedback {
  outOfFrame,
  getInPosition,
  ready,
  goLower, // « Descends un peu plus »
  pushUp, // « Remonte complètement »
  goodRep,
  badPosition,
}

class PoseSample {
  const PoseSample({
    required this.angle,
    required this.confidence,
    required this.aligned,
    required this.tMs,
  });

  /// Angle principal en degrés : coude (pompes) ou genou (squats).
  final double angle;

  /// Confiance moyenne des repères requis (0..1).
  final double confidence;

  /// Pompes : épaule/hanche quasi horizontales. Squats : tronc quasi vertical.
  final bool aligned;

  /// Horodatage en millisecondes.
  final int tMs;
}

class RepConfig {
  const RepConfig({
    required this.upAngle,
    required this.downAngle,
    required this.minConfidence,
    required this.minRepMs,
    required this.requireAlignment,
    required this.smoothing,
  });

  final double upAngle;
  final double downAngle;
  final double minConfidence;
  final int minRepMs;
  final bool requireAlignment;
  final int smoothing;

  factory RepConfig.build({
    required Exercise exercise,
    required Difficulty difficulty,
    required Sensitivity sensitivity,
    required bool strict,
  }) {
    final pushup = exercise == Exercise.pushup;
    final down = switch (difficulty) {
      Difficulty.easy => pushup ? 110.0 : 120.0,
      Difficulty.normal => pushup ? 95.0 : 105.0,
      Difficulty.hard => pushup ? 80.0 : 90.0,
    };
    final up = pushup ? 155.0 : 160.0;
    final conf = switch (sensitivity) {
      Sensitivity.low => 0.7,
      Sensitivity.normal => 0.55,
      Sensitivity.high => 0.4,
    };
    return RepConfig(
      upAngle: strict ? up : up - 10,
      downAngle: strict ? down : down + 8,
      minConfidence: conf,
      minRepMs: strict ? 700 : 450,
      requireAlignment: strict,
      smoothing: sensitivity == Sensitivity.high ? 2 : 3,
    );
  }
}

class RepCounter {
  RepCounter(this.cfg);

  final RepConfig cfg;

  int count = 0;
  RepPhase phase = RepPhase.unknown;
  RepFeedback feedback = RepFeedback.outOfFrame;

  final List<double> _window = [];
  int _lastRepAt = 0;
  bool _reachedDepth = false;

  void reset() {
    count = 0;
    phase = RepPhase.unknown;
    feedback = RepFeedback.outOfFrame;
    _window.clear();
    _lastRepAt = 0;
    _reachedDepth = false;
  }

  /// Retourne `true` quand une répétition vient d'être validée.
  bool update(PoseSample? s) {
    if (s == null || s.confidence < cfg.minConfidence) {
      feedback = RepFeedback.outOfFrame;
      _window.clear();
      return false;
    }
    if (cfg.requireAlignment && !s.aligned) {
      feedback = RepFeedback.badPosition;
      return false;
    }

    _window.add(s.angle);
    if (_window.length > cfg.smoothing) _window.removeAt(0);
    final a = _window.reduce((x, y) => x + y) / _window.length;

    switch (phase) {
      case RepPhase.unknown:
        if (a >= cfg.upAngle) {
          phase = RepPhase.up;
          feedback = RepFeedback.ready;
        } else {
          feedback = RepFeedback.getInPosition;
        }
        return false;

      case RepPhase.up:
        if (a <= cfg.downAngle) {
          phase = RepPhase.down;
          _reachedDepth = true;
          feedback = RepFeedback.pushUp;
        } else if (a < cfg.upAngle - 5) {
          feedback = RepFeedback.goLower;
        } else {
          feedback = RepFeedback.ready;
        }
        return false;

      case RepPhase.down:
        if (a >= cfg.upAngle) {
          final okDepth = _reachedDepth;
          final okTime = s.tMs - _lastRepAt >= cfg.minRepMs;
          phase = RepPhase.up;
          _reachedDepth = false;
          if (okDepth && okTime) {
            count++;
            _lastRepAt = s.tMs;
            feedback = RepFeedback.goodRep;
            return true;
          }
          feedback = RepFeedback.ready;
        } else {
          feedback = RepFeedback.pushUp;
        }
        return false;
    }
  }
}
