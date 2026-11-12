import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/material.dart';
import 'package:vibration/vibration.dart';

import '../../data/models.dart';
import '../../l10n/app_localizations.dart';

/// Écran « Mission accomplie » : animation, son de réussite, vibration.
class SuccessScreen extends StatefulWidget {
  const SuccessScreen({super.key, required this.result});
  final MissionResult result;
  @override
  State<SuccessScreen> createState() => _SuccessScreenState();
}

class _SuccessScreenState extends State<SuccessScreen> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 900))..forward();

  @override
  void initState() {
    super.initState();
    AudioPlayer().play(AssetSource('sounds/success.mp3'));
    Vibration.vibrate(pattern: [0, 80, 60, 80, 60, 200]);
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(children: [
            const Spacer(),
            ScaleTransition(
              scale: CurvedAnimation(parent: _c, curve: Curves.elasticOut),
              child: const CircleAvatar(radius: 70, backgroundColor: Color(0xFF3DDC97), child: Icon(Icons.check, size: 90, color: Colors.black)),
            ),
            const SizedBox(height: 32),
            Text(l.missionDone, textAlign: TextAlign.center, style: const TextStyle(fontSize: 44, fontWeight: FontWeight.w900)),
            const SizedBox(height: 8),
            Text('${widget.result.reps} · ${widget.result.duration.inSeconds}s', style: const TextStyle(fontSize: 20)),
            const Spacer(),
            SizedBox(
              width: double.infinity,
              height: 60,
              child: FilledButton(onPressed: () => Navigator.of(context).popUntil((r) => r.isFirst), child: Text(l.backHome)),
            ),
          ]),
        ),
      ),
    );
  }
}
