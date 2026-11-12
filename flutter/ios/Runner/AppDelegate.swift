import UIKit
import Flutter
import UserNotifications
import AVFoundation

/// iOS ne permet PAS à une app tierce de lancer du code ou de jouer du son à une heure donnée
/// en arrière-plan. La stratégie respectueuse des limites iOS est donc :
///  1. UNUserNotificationCenter : notifications locales à l'heure exacte avec un son personnalisé (≤ 30 s),
///     interruptionLevel .timeSensitive (traverse la plupart des Focus).
///  2. Une CHAÎNE de rappels (toutes les 30–60 s, jusqu'à ~20 notifications) pour que « ça continue de sonner »
///     tant que l'utilisateur n'a pas ouvert l'app. iOS limite à 64 notifications locales en attente.
///  3. À l'ouverture (tap sur la notification), AVAudioSession(.playback) + AVAudioPlayer en boucle
///     prennent le relais dans l'app, et l'écran de mission s'affiche.
///  4. Option : entitlement « Critical Alerts » (à demander à Apple) ou AlarmKit (iOS 26+) pour sonner
///     même en mode silencieux / Ne pas déranger.
@main
@objc class AppDelegate: FlutterAppDelegate {
    private var channel: FlutterMethodChannel?
    private var player: AVAudioPlayer?
    private var launchAlarmId: Int?
    private let chainLength = 20
    private let chainStep: TimeInterval = 45

    override func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        let controller = window?.rootViewController as! FlutterViewController
        channel = FlutterMethodChannel(name: "app.wakefit/alarm", binaryMessenger: controller.binaryMessenger)
        channel?.setMethodCallHandler { [weak self] call, result in
            guard let self = self else { return }
            let args = call.arguments as? [String: Any] ?? [:]
            switch call.method {
            case "schedule": self.schedule(args); result(nil)
            case "postpone": self.postpone(args); result(nil)
            case "cancel": self.cancel(id: args["id"] as? Int ?? 0); result(nil)
            case "stopRinging": self.stopRinging(); result(nil)
            case "initialRingingAlarm": result(self.launchAlarmId)
            default: result(FlutterMethodNotImplemented)
            }
        }
        requestNotificationPermission()
        GeneratedPluginRegistrant.register(with: self)
        return super.application(application, didFinishLaunchingWithOptions: launchOptions)
    }

    // MARK: Permission (demandée au moment de créer la 1re alarme)
    private func requestNotificationPermission() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge, .timeSensitive]) { _, _ in }
    }

    // MARK: Planification
    private func schedule(_ a: [String: Any]) {
        let id = a["id"] as? Int ?? 0
        cancel(id: id)
        let hour = a["hour"] as? Int ?? 7, minute = a["minute"] as? Int ?? 0
        let days = a["days"] as? [Int] ?? []        // 1 = lundi … 7 = dimanche
        let label = (a["label"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? "WakeFit"
        let sound = a["sound"] as? String ?? "sunrise"
        let reps = a["reps"] as? Int ?? 10
        let ex = a["exercise"] as? String ?? "pushup"

        // Calendrier iOS : dimanche = 1 … samedi = 7
        let weekdays: [Int?] = days.isEmpty ? [nil] : days.map { ($0 % 7) + 1 }
        for wd in weekdays {
            for n in 0..<chainLength {
                var comps = DateComponents(hour: hour, minute: minute)
                if let wd = wd { comps.weekday = wd }
                let total = Int(chainStep) * n
                comps.second = total % 60
                comps.minute = (minute + total / 60) % 60
                comps.hour = (hour + (minute + total / 60) / 60) % 24

                let content = UNMutableNotificationContent()
                content.title = n == 0 ? "⏰ \(label)" : "⏰ \(label) — \(reps) \(ex)"
                content.body = "Fais tes répétitions pour éteindre l'alarme."
                content.sound = UNNotificationSound(named: UNNotificationSoundName("\(sound).caf")) // ≤ 30 s
                content.interruptionLevel = .timeSensitive
                content.categoryIdentifier = "WAKEFIT_ALARM"
                content.userInfo = ["alarmId": id]
                let trigger = UNCalendarNotificationTrigger(dateMatching: comps, repeats: !days.isEmpty)
                let req = UNNotificationRequest(identifier: "alarm_\(id)_\(wd ?? 0)_\(n)", content: content, trigger: trigger)
                UNUserNotificationCenter.current().add(req)
            }
        }
    }

    private func postpone(_ a: [String: Any]) {
        let id = a["id"] as? Int ?? 0
        let atMs = a["atMs"] as? Double ?? (Date().timeIntervalSince1970 + 600) * 1000
        let sound = a["sound"] as? String ?? "sunrise"
        for n in 0..<chainLength {
            let content = UNMutableNotificationContent()
            content.title = "⏰ WakeFit"
            content.body = "Mission reportée : c'est l'heure, fais tes répétitions."
            content.sound = UNNotificationSound(named: UNNotificationSoundName("\(sound).caf"))
            content.interruptionLevel = .timeSensitive
            content.userInfo = ["alarmId": id]
            let fire = Date(timeIntervalSince1970: atMs / 1000 + chainStep * Double(n))
            let trigger = UNTimeIntervalNotificationTrigger(timeInterval: max(1, fire.timeIntervalSinceNow), repeats: false)
            UNUserNotificationCenter.current().add(
                UNNotificationRequest(identifier: "postpone_\(id)_\(n)", content: content, trigger: trigger))
        }
    }

    private func cancel(id: Int) {
        let center = UNUserNotificationCenter.current()
        center.getPendingNotificationRequests { reqs in
            let ids = reqs.map { $0.identifier }.filter { $0.hasPrefix("alarm_\(id)_") || $0.hasPrefix("postpone_\(id)_") }
            center.removePendingNotificationRequests(withIdentifiers: ids)
        }
    }

    /// Mission réussie : on coupe le son in-app et on purge la chaîne de rappels déjà livrés / à venir.
    private func stopRinging() {
        player?.stop(); player = nil
        let center = UNUserNotificationCenter.current()
        center.removeAllDeliveredNotifications()
        center.getPendingNotificationRequests { reqs in
            // On conserve les occurrences futures des alarmes récurrentes (n == 0 de chaque jour)
            let chain = reqs.filter { !$0.identifier.hasSuffix("_0") }.map { $0.identifier }
            center.removePendingNotificationRequests(withIdentifiers: chain)
        }
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    // MARK: Son in-app (boucle) quand l'app est ouverte sur une alarme
    private func startInAppSound(sound: String) {
        guard let url = Bundle.main.url(forResource: sound, withExtension: "caf") else { return }
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [])
            try AVAudioSession.sharedInstance().setActive(true)
            player = try AVAudioPlayer(contentsOf: url)
            player?.numberOfLoops = -1
            player?.play()
        } catch { NSLog("WakeFit audio error: \(error)") }
    }

    // MARK: Notifications
    override func userNotificationCenter(
        _ center: UNUserNotificationCenter, willPresent n: UNNotification,
        withCompletionHandler done: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        // App au premier plan : on ouvre directement la mission et on joue le son en boucle.
        if let id = n.request.content.userInfo["alarmId"] as? Int {
            startInAppSound(sound: "sunrise")
            channel?.invokeMethod("onRing", arguments: ["id": id])
        }
        done([])
    }

    override func userNotificationCenter(
        _ center: UNUserNotificationCenter, didReceive r: UNNotificationResponse,
        withCompletionHandler done: @escaping () -> Void
    ) {
        if let id = r.notification.request.content.userInfo["alarmId"] as? Int {
            launchAlarmId = id
            startInAppSound(sound: "sunrise")
            channel?.invokeMethod("onRing", arguments: ["id": id])
        }
        done()
    }
}
