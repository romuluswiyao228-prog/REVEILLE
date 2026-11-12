import 'package:flutter_test/flutter_test.dart';
import 'package:wakefit/features/mission/rep_counter.dart';

RepCounter _counter({
  Exercise ex = Exercise.pushup,
  Difficulty d = Difficulty.normal,
  Sensitivity s = Sensitivity.normal,
  bool strict = true,
}) =>
    RepCounter(RepConfig.build(exercise: ex, difficulty: d, sensitivity: s, strict: strict));

PoseSample _s(double angle, int t, {double conf = 0.9, bool aligned = true}) =>
    PoseSample(angle: angle, confidence: conf, aligned: aligned, tMs: t);

/// Rejoue une courbe d'angles (≈ 30 fps) et retourne le nombre de reps validées.
int _play(RepCounter c, List<double> angles, {int startMs = 0, int stepMs = 33}) {
  var t = startMs;
  for (final a in angles) {
    c.update(_s(a, t));
    t += stepMs;
  }
  return c.count;
}

/// Une pompe : haut → bas (minAngle) → haut, 20 frames par demi-cycle.
List<double> _rep({double top = 170, double bottom = 70, int n = 20}) => [
      for (var i = 0; i <= n; i++) top + (bottom - top) * i / n,
      for (var i = 1; i <= n; i++) bottom + (top - bottom) * i / n,
    ];

void main() {
  group('RepCounter – cycle complet', () {
    test('compte une pompe complète', () {
      final c = _counter();
      expect(_play(c, [170, 170, 170, ..._rep()]), 1);
    });

    test('compte plusieurs pompes consécutives', () {
      final c = _counter();
      final curve = [170.0, 170.0, for (var i = 0; i < 5; i++) ..._rep()];
      expect(_play(c, curve), 5);
    });

    test('update retourne true uniquement sur la frame qui valide la rep', () {
      final c = _counter();
      var trues = 0;
      var t = 0;
      for (final a in [170.0, 170.0, ..._rep()]) {
        if (c.update(_s(a, t))) trues++;
        t += 33;
      }
      expect(trues, 1);
    });
  });

  group('RepCounter – mouvements invalides', () {
    test('descente insuffisante : ne compte pas et dit « Descends un peu plus »', () {
      final c = _counter();
      _play(c, [170, 170, 170]);
      // descend seulement à 130° (< amplitude requise de 95°)
      var sawGoLower = false;
      var t = 200;
      for (final a in _rep(bottom: 130)) {
        c.update(_s(a, t));
        if (c.feedback == RepFeedback.goLower) sawGoLower = true;
        t += 33;
      }
      expect(c.count, 0);
      expect(sawGoLower, isTrue);
    });

    test('remontée incomplète : pas de rep, feedback « Remonte complètement »', () {
      final c = _counter();
      _play(c, [170, 170, 170]);
      var t = 200;
      for (final a in [for (var i = 0; i <= 20; i++) 170 - 100 * i / 20.0, 80.0, 90.0, 110.0, 120.0]) {
        c.update(_s(a, t));
        t += 33;
      }
      expect(c.count, 0);
      expect(c.feedback, RepFeedback.pushUp);
    });

    test('sortie du cadre : feedback outOfFrame, rien n’est compté', () {
      final c = _counter();
      c.update(_s(170, 0, conf: 0.1));
      expect(c.feedback, RepFeedback.outOfFrame);
      expect(c.count, 0);
      c.update(null);
      expect(c.feedback, RepFeedback.outOfFrame);
    });

    test('rebond trop rapide (< minRepMs) ignoré', () {
      final c = _counter();
      // 8 frames par demi-cycle à 33 ms = ~530 ms < 700 ms (mode strict)
      expect(_play(c, [170, 170, 170, ..._rep(n: 8)]), 0);
    });

    test('mode strict : corps non aligné rejeté', () {
      final c = _counter(strict: true);
      var t = 0;
      for (final a in [170.0, 170.0, ..._rep()]) {
        c.update(_s(a, t, aligned: false));
        t += 33;
      }
      expect(c.count, 0);
      expect(c.feedback, RepFeedback.badPosition);
    });

    test('mode souple : l’alignement n’est pas exigé', () {
      final c = _counter(strict: false);
      var t = 0;
      for (final a in [170.0, 170.0, ..._rep()]) {
        c.update(_s(a, t, aligned: false));
        t += 33;
      }
      expect(c.count, 1);
    });
  });

  group('RepCounter – difficulté & squats', () {
    test('difficile exige plus de profondeur que facile', () {
      final easy = _counter(d: Difficulty.easy);
      final hard = _counter(d: Difficulty.hard);
      final curve = [170.0, 170.0, 170.0, ..._rep(bottom: 100)];
      expect(_play(easy, curve), 1);
      expect(_play(hard, curve), 0);
    });

    test('squats : même machine à états sur l’angle du genou', () {
      final c = _counter(ex: Exercise.squat);
      expect(_play(c, [175, 175, 175, ..._rep(top: 175, bottom: 80)]), 1);
    });
  });

  group('RepCounter – reset', () {
    test('reset remet tout à zéro', () {
      final c = _counter();
      _play(c, [170, 170, ..._rep()]);
      expect(c.count, 1);
      c.reset();
      expect(c.count, 0);
      expect(c.phase, RepPhase.unknown);
    });
  });
}
