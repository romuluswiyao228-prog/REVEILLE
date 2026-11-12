# WakeFit (Flutter)

Réveil qui **oblige à faire des pompes (ou squats)**, comptées automatiquement par la caméra frontale,
avant de pouvoir éteindre l'alarme. 100 % du traitement vidéo reste sur le téléphone.

> **État de ce dossier** : code source Flutter du cœur du produit (compteur de répétitions + tests,
> pipeline caméra/ML Kit, couche d'alarme native Android/iOS, base locale, traductions, tests d'intégration,
> docs). Il n'a **pas été compilé ni exécuté** dans l'environnement qui l'a généré (pas de SDK Flutter) :
> prévois une passe de `flutter analyze` / ajustement de versions au premier build.
> Le prototype **web** à la racine du dépôt (`src/`) implémente les 10 écrans et sert de référence UI/UX.

## Prérequis
- Flutter ≥ 3.22 (Dart ≥ 3.4), Android Studio / Xcode 15+
- Android : minSdk **24**, compileSdk 34+, appareil réel recommandé (la caméra émulée ne fait pas de pose)
- iOS : iOS 15.5+ (requis par ML Kit), appareil réel, compte développeur Apple

## Installation
```bash
cd flutter
flutter create . --org app.wakefit --project-name wakefit   # génère android/ ios/ manquants (ne pas écraser nos fichiers)
flutter pub get
flutter gen-l10n                                           # génère AppLocalizations (FR / EN / AR)
```

1. **Android** — vérifie que `android/app/src/main/AndroidManifest.xml` et le dossier
   `kotlin/app/wakefit/` correspondent à ceux fournis ; dans `android/app/build.gradle` : `minSdk 24`.
   Ajoute les sonneries dans `android/app/src/main/res/raw/` (`sunrise.mp3`, `pulse.mp3`, …).
2. **iOS** — fusionne `ios/Runner/Info.plist.additions.xml` dans `Info.plist`, remplace `AppDelegate.swift`,
   ajoute les `.caf` (≤ 30 s) à la cible Runner. Dans le `Podfile` : `platform :ios, '15.5'`.
3. **Firebase** — `flutterfire configure` (Analytics + Crashlytics). L'app fonctionne sans.
4. **RevenueCat** — clés API Android/iOS dans `lib/core/purchases.dart` (à créer), produits `wakefit_monthly`
   et `wakefit_yearly`, entitlement `premium`.
5. Assets : `assets/sounds/success.mp3`.

## Lancer
```bash
flutter run --release            # la détection de pose est lente en debug
flutter test                     # tests unitaires (compteur de répétitions)
flutter test integration_test -d <device_id>
```

## Structure
```
lib/
  main.dart                      # init Hive, Firebase, locales, ouverture auto de la mission
  core/alarm/alarm_scheduler.dart   # MethodChannel vers le code natif
  data/models.dart, repository.dart # Hive (alarmes, historique, réglages, limites quotidiennes)
  features/
    home/ …                      # liste d'alarmes
    mission/
      rep_counter.dart           # machine à états pure (testée)
      pose_analyzer.dart         # CameraImage → ML Kit Pose → angle / confiance / alignement
      mission_controller.dart    # caméra, timer, vibration, fin de mission
      mission_screen.dart        # UI : aperçu, silhouette, compteur, secours
      success_screen.dart
  l10n/app_{fr,en,ar}.arb
android/…/alarm/                 # AlarmStore, AlarmReceiver, AlarmService, BootReceiver
ios/Runner/AppDelegate.swift     # UNUserNotificationCenter + AVAudioSession
test/rep_counter_test.dart
integration_test/alarm_mission_test.dart
docs/PERMISSIONS.md, docs/TEST_PLAN.md
```

## Fiabilité des alarmes
**Android** — `AlarmManager.setAlarmClock` (exempté du Doze, précis à la seconde) → `AlarmReceiver` →
`AlarmService` (foreground, `USAGE_ALARM`, boucle, wake lock, notification plein écran non balayable).
`BootReceiver` replanifie après redémarrage, changement d'heure/fuseau et mise à jour. Les alarmes sont
stockées en natif (device-protected storage) pour fonctionner avant le premier déverrouillage.
Android 12+/14+ : l'utilisateur doit accorder « Alarmes et rappels » ; certains OEM exigent aussi
l'exemption d'optimisation de batterie (flux guidé fourni).

**iOS** — iOS ne permet pas de sonner en arrière-plan sans interaction. WakeFit utilise des notifications
locales *time-sensitive* à l'heure exacte avec son personnalisé (≤ 30 s) + une chaîne de ~20 rappels
(toutes les 45 s) jusqu'à l'ouverture de l'app, puis `AVAudioSession(.playback)` en boucle dans l'app.
Limites : mode silencieux / Focus peuvent atténuer le son (solutions : entitlement *Critical Alerts*
sur demande à Apple, ou AlarmKit sur iOS 26+). Il est conseillé d'expliquer cela à l'onboarding.

## Vie privée
Aucune image ni repère du corps n'est écrit sur disque, journalisé ou envoyé. `startImageStream` traite
les frames en mémoire (1 sur 3), ML Kit tourne on-device (modèle embarqué). Caméra demandée uniquement
au premier besoin (onboarding facultatif ou mission). Voir `docs/PERMISSIONS.md`.

## Batterie
Résolution 480p, modèle `base`, ~10 fps, `WakelockPlus` limité à la mission, caméra et analyseur libérés
à la fin, aucun service en arrière-plan hors sonnerie.
