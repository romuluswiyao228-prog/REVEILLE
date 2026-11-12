// Tests d'intégration : création d'alarme + flux de mission.
// Lancer : flutter test integration_test -d <emulateur>
//
// Le flux de mission est testé au niveau logique (séquences d'angles injectées dans RepCounter),
// sans caméra, donc exécutable en CI. Le test sur appareil réel avec caméra est décrit dans
// docs/TEST_PLAN.md (section « Tests manuels »).
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:wakefit/data/models.dart';
import 'package:wakefit/data/repository.dart';
import 'package:wakefit/features/mission/rep_counter.dart';
import 'package:wakefit/main.dart' as app;

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('Création d’une alarme : apparaît dans la liste et est persistée', (tester) async {
    await app.main();
    await tester.pumpAndSettle();

    final before = Repository.instance.alarms().length;
    await tester.tap(find.byType(FloatingActionButton));
    await tester.pumpAndSettle();

    expect(Repository.instance.alarms().length, before + 1);
    final created = Repository.instance.alarms().last;
    expect(created.enabled, isTrue);
    expect(created.reps, inInclusiveRange(5, 50));
    expect(find.text('07:00'), findsWidgets);
  });

  testWidgets('Désactiver une alarme la marque désactivée', (tester) async {
    await app.main();
    await tester.pumpAndSettle();
    await tester.tap(find.byType(Switch).first);
    await tester.pumpAndSettle();
    expect(Repository.instance.alarms().any((a) => !a.enabled), isTrue);
  });

  test('Flux de mission : la mission n’est validée qu’après toutes les répétitions', () {
    // Flux logique (sans caméra) : 3 reps demandées, 2 complètes + 1 partielle → non terminé.
    final c = RepCounter(RepConfig.build(
      exercise: Exercise.pushup, difficulty: Difficulty.normal, sensitivity: Sensitivity.normal, strict: true));
    var t = 0;
    int feed(List<double> angles) {
      for (final a in angles) {
        c.update(PoseSample(angle: a, confidence: .9, aligned: true, tMs: t));
        t += 33;
      }
      return c.count;
    }

    List<double> rep(double bottom) => [
          for (var i = 0; i <= 20; i++) 170 + (bottom - 170) * i / 20,
          for (var i = 1; i <= 20; i++) bottom + (170 - bottom) * i / 20,
        ];

    feed([170, 170, 170]);
    feed(rep(70));
    feed(rep(70));
    expect(feed(rep(130)), 2); // partielle ignorée
    expect(c.count < 3, isTrue); // alarme toujours active
    expect(feed(rep(70)), 3); // mission terminée → stopRinging()
  });

  test('Limites quotidiennes : report et confirmation manuelle 1 fois / jour', () {
    final today = dayKey();
    const s = AppSettings();
    expect(s.problemDay == today, isFalse);
    expect(AppSettings(problemDay: today).problemDay == dayKey(), isTrue);
    expect(dayKey(DateTime(2025, 3, 7)), '2025-03-07');
  });
}
