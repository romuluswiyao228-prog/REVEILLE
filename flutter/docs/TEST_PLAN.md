# Plan de test WakeFit

## 1. Tests unitaires (`flutter test`)
`test/rep_counter_test.dart`
- Rep complète (haut → bas → haut) = +1 ; 5 reps consécutives = 5 ; `update()` vrai une seule fois par rep.
- Descente insuffisante → 0 rep + feedback « Descends un peu plus ».
- Remontée incomplète → 0 rep + feedback « Remonte complètement ».
- Hors cadre / confiance faible → `outOfFrame`, rien compté.
- Rebond trop rapide (< `minRepMs`) ignoré.
- Mode strict : corps non aligné rejeté ; mode souple : toléré.
- Difficulté : « difficile » exige plus de profondeur que « facile ».
- Squats : même logique sur l'angle du genou. `reset()`.

À ajouter : calcul de série/meilleure série/badges (`stats`), `AlarmStore.nextTrigger` (JUnit), limites quotidiennes.

## 2. Tests d'intégration (`flutter test integration_test`)
- Création d'alarme → persistée (Hive) et visible dans la liste ; 5 ≤ reps ≤ 50.
- Activation/désactivation d'alarme.
- Flux de mission logique : l'alarme n'est « terminée » qu'après toutes les reps valides ; une rep partielle n'avance pas.
- Limites quotidiennes (report, confirmation manuelle, snooze d'urgence : 1 / jour).

## 3. Tests manuels sur appareils réels
### Alarmes — Android (Pixel + 1 Xiaomi/Samsung, Android 10, 12, 14)
| # | Scénario | Attendu |
|---|---|---|
| A1 | App fermée (balayée), alarme à +2 min | Sonne à l'heure, écran de mission s'ouvre |
| A2 | Écran verrouillé, Doze (`adb shell dumpsys deviceidle force-idle`) | Sonne à l'heure exacte |
| A3 | Redémarrage du téléphone avec alarme à +10 min | Sonne quand même |
| A4 | Changement d'heure / fuseau | Alarmes recalculées |
| A5 | Mode silencieux / Ne pas déranger | Sonne (USAGE_ALARM) |
| A6 | Tenter d'effacer la notification / bouton retour | Impossible tant que mission non finie |
| A7 | Alarme répétitive lun–ven | Se re-planifie le lendemain ; pas le week-end |
| A8 | Permission « alarmes exactes » refusée | Message guidant vers le réglage |

### Alarmes — iOS (iPhone récent + ancien, iOS 15.5 / 17 / 18)
| # | Scénario | Attendu |
|---|---|---|
| I1 | App fermée, alarme +2 min | Notification time-sensitive avec son ; rappels toutes les 45 s |
| I2 | Tap sur la notification | App s'ouvre sur la mission, son in-app en boucle |
| I3 | Mode silencieux / Focus | Comportement documenté (limites iOS) |
| I4 | Mission réussie | Chaîne de rappels annulée, alarme du lendemain conservée |

### Détection (appareil réel, éclairage normal / faible)
- 10 pompes correctes → compteur = 10. Triches (demi-pompes, rebonds, bras seuls) → non comptées.
- Sortie du cadre → message « Reviens dans le cadre » ; reprise sans perdre le compteur.
- Caméra posée au sol à 1–2 m, vue de profil ; vue de face dégradée (documenter).
- Squats : 10 squats complets comptés.
- Mode avion : détection identique (hors-ligne). Inspecter le trafic réseau (Charles/mitmproxy) : **aucune** requête pendant la mission.
- Perf : ≥ 10 fps, latence < 150 ms ; température et batterie sur 5 min (< 3 % attendu).

### Secours & limites
- « J'ai un problème » : report de 10 min, 1 fois / jour, notification claire, entrée « reporté » dans l'historique ; 2e tentative bloquée.
- « Confirmer manuellement » : grisé avant 30 s, 1 utilisation / jour, entrée « manuel ».
- Snooze d'urgence : 1 / jour (5 min).

### Interface / i18n / accessibilité
- FR / EN / AR : aucune troncature ; arabe en RTL (flèches, alignements, jours de la semaine).
- Thème sombre / clair ; contraste ≥ 7:1 sur l'écran de mission ; textes à 200 % de taille système.
- iPhone SE → Pro Max, Android 5" → tablette.

### Vie privée & stores
- Caméra demandée uniquement à l'onboarding (si accepté) ou à la 1re mission ; refus → écran explicatif + lien réglages.
- Politique de confidentialité accessible ; formulaires de collecte de données conformes (cf. PERMISSIONS.md).
- Premium : achat, restauration, expiration (sandbox RevenueCat).
