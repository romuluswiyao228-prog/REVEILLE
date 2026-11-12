import type { Alarm } from "./types";
import { startAlarmSound, startCustomAlarmSound, stopAlarmSound } from "./audio";
import { getCustomSound } from "./customSounds";

/**
 * Démarre la sonnerie d'une alarme : musique personnalisée si disponible,
 * sinon sonnerie par défaut. Toute erreur de lecture retombe sur le défaut.
 */
export async function startAlarmPlayback(alarm: Alarm, volumeOverride?: number): Promise<void> {
  stopAlarmSound();
  if (alarm.customSoundName) {
    try {
      const rec = await getCustomSound(alarm.id);
      if (rec) {
        const ok = await startCustomAlarmSound(rec.blob);
        if (ok) return;
      }
    } catch {
      /* fallback sur la sonnerie par défaut */
    }
  }
  startAlarmSound(alarm.sound, volumeOverride ?? alarm.volume);
}

export function stopAlarmPlayback() {
  stopAlarmSound();
}
