import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/alarm/alarm_scheduler.dart';
import '../../data/models.dart';
import '../../data/repository.dart';
import '../../l10n/app_localizations.dart';

/// Liste des alarmes (accueil). Les autres écrans (création d'alarme, historique, statistiques,
/// réglages, paywall, onboarding) suivent le même schéma — voir le prototype web (src/screens/*)
/// qui sert de référence UI/UX et de logique pour chacun d'eux.
class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});
  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final repo = ref.watch(repositoryProvider);
    final alarms = repo.alarms();

    return Scaffold(
      appBar: AppBar(title: Text(l.appTitle)),
      floatingActionButton: FloatingActionButton.extended(
        icon: const Icon(Icons.add),
        label: Text(l.addAlarm),
        onPressed: () async {
          // Demande d'autorisation « alarme exacte » (Android 12+) à la 1re alarme créée.
          if (!await AlarmScheduler.instance.canScheduleExact()) {
            await AlarmScheduler.instance.openExactAlarmSettings();
          }
          final a = AlarmModel(id: DateTime.now().millisecondsSinceEpoch ~/ 1000, hour: 7, minute: 0, days: const [1, 2, 3, 4, 5]);
          await repo.saveAlarm(a);
          await AlarmScheduler.instance.schedule(a);
          setState(() {});
        },
      ),
      body: ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: alarms.length,
        separatorBuilder: (_, __) => const SizedBox(height: 12),
        itemBuilder: (_, i) {
          final a = alarms[i];
          return Card(
            child: SwitchListTile(
              title: Text('${a.hour.toString().padLeft(2, '0')}:${a.minute.toString().padLeft(2, '0')}',
                  style: const TextStyle(fontSize: 40, fontWeight: FontWeight.w900)),
              subtitle: Text('${a.reps} × ${a.exercise.name} · ${a.label}'),
              value: a.enabled,
              onChanged: (v) async {
                final n = a.copyWith(enabled: v);
                await repo.saveAlarm(n);
                v ? await AlarmScheduler.instance.schedule(n) : await AlarmScheduler.instance.cancel(n.id);
                setState(() {});
              },
            ),
          );
        },
      ),
    );
  }
}
