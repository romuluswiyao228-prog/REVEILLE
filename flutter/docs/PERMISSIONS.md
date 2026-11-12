# Permissions

## Android
| Permission | Pourquoi | Quand |
|---|---|---|
| `CAMERA` | Détecter les répétitions (caméra frontale, traitement local) | Au démarrage de la 1re mission (ou onboarding) |
| `POST_NOTIFICATIONS` (13+) | Notification d'alarme / report | À la création de la 1re alarme |
| `SCHEDULE_EXACT_ALARM` (12+) / `USE_EXACT_ALARM` | Déclenchement à l'heure exacte (app de réveil) | À la création de la 1re alarme |
| `USE_FULL_SCREEN_INTENT` | Ouvrir automatiquement l'écran de mission écran verrouillé | Alarme |
| `RECEIVE_BOOT_COMPLETED` | Replanifier après redémarrage | Système |
| `WAKE_LOCK` | Garder le CPU actif pendant la sonnerie | Alarme |
| `VIBRATE` | Vibration d'alarme et progressive | Alarme / mission |
| `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_MEDIA_PLAYBACK` | Sonnerie continue fiable | Alarme |
| `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` | Fabricants agressifs (Xiaomi, Huawei, Oppo…) | Réglage guidé, facultatif |
| `INTERNET` | Firebase Analytics/Crashlytics, RevenueCat uniquement — **jamais** pour la caméra | — |

Déclaration Play Store : formulaire « Full-screen intent » et « Exact alarms » → usage = application de réveil.

## iOS (`Info.plist`)
| Clé | Valeur |
|---|---|
| `NSCameraUsageDescription` | Texte expliquant le comptage local des répétitions (fr/en/ar via `InfoPlist.strings`) |
| `UIBackgroundModes` → `audio` | Poursuivre le son d'alarme in-app |
| Notifications | `UNUserNotificationCenter.requestAuthorization([.alert,.sound,.badge,.timeSensitive])` |
| Capability *Time Sensitive Notifications* | à activer dans Xcode |
| Entitlement *Critical Alerts* (optionnel) | à demander à Apple |

## Données collectées (formulaires App Store / Play)
- Images / vidéo / repères du corps : **non collectés** (traitement 100 % local, jamais transmis).
- Analytics & plantages : identifiants d'appareil anonymes, événements d'usage (sans contenu caméra).
- Achats : gérés par RevenueCat / stores.
