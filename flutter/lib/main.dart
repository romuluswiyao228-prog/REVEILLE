import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_crashlytics/firebase_crashlytics.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive_flutter/hive_flutter.dart';

import 'core/alarm/alarm_scheduler.dart';
import 'data/repository.dart';
import 'features/home/home_screen.dart';
import 'features/mission/mission_screen.dart';
import 'l10n/app_localizations.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Hive.initFlutter();
  await Repository.open();

  // Crashlytics : jamais de contenu caméra dans les rapports (aucun log d'image / de repères).
  try {
    await Firebase.initializeApp();
    FlutterError.onError = FirebaseCrashlytics.instance.recordFlutterFatalError;
    PlatformDispatcher.instance.onError = (e, st) {
      FirebaseCrashlytics.instance.recordError(e, st, fatal: true);
      return true;
    };
  } catch (_) {/* app fonctionnelle sans Firebase */}

  runApp(const ProviderScope(child: WakeFitApp()));
}

final navigatorKey = GlobalKey<NavigatorState>();

class WakeFitApp extends ConsumerStatefulWidget {
  const WakeFitApp({super.key});
  @override
  ConsumerState<WakeFitApp> createState() => _WakeFitAppState();
}

class _WakeFitAppState extends ConsumerState<WakeFitApp> {
  @override
  void initState() {
    super.initState();
    // Alarme qui sonne : ouvrir directement l'écran de mission (app fermée → cold start, ou ouverte → onRing).
    AlarmScheduler.instance.listenForRing(_openMission);
    // Filet de sécurité : si le BootReceiver a été manqué, on replanifie tout au lancement.
    AlarmScheduler.instance.rescheduleAll();
    AlarmScheduler.instance.initialRingingAlarm().then((id) {
      if (id != null) WidgetsBinding.instance.addPostFrameCallback((_) => _openMission(id));
    });
  }

  void _openMission(int alarmId) {
    final alarm = ref.read(repositoryProvider).alarmById(alarmId);
    if (alarm == null) return;
    navigatorKey.currentState?.pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => MissionScreen(alarm: alarm)),
      (r) => r.isFirst,
    );
  }

  @override
  Widget build(BuildContext context) {
    final settings = ref.watch(settingsProvider);
    return MaterialApp(
      navigatorKey: navigatorKey,
      title: 'WakeFit',
      debugShowCheckedModeBanner: false,
      themeMode: settings.dark ? ThemeMode.dark : ThemeMode.light,
      theme: _theme(Brightness.light),
      darkTheme: _theme(Brightness.dark), // sombre par défaut
      locale: Locale(settings.locale), // fr / en / ar (RTL géré automatiquement)
      supportedLocales: const [Locale('fr'), Locale('en'), Locale('ar')],
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      home: const HomeScreen(),
    );
  }

  ThemeData _theme(Brightness b) {
    final dark = b == Brightness.dark;
    return ThemeData(
      useMaterial3: true,
      brightness: b,
      scaffoldBackgroundColor: dark ? const Color(0xFF0B0D12) : const Color(0xFFF4F5F8),
      colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFFFF6B2C), brightness: b),
      textTheme: Typography.material2021().white.apply(fontFamilyFallback: const ['Noto Sans Arabic']),
    );
  }
}
