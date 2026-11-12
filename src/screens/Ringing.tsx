import { useEffect, useState } from "react";
import { Button, Icon } from "../components/ui";
import { useStore } from "../lib/store";
import { audioRunning, startAlarmSound, vibrate } from "../lib/audio";
import { dateKey } from "../lib/stats";
import type { Alarm } from "../lib/types";

export default function Ringing({ alarm, onStart, onSnooze }: { alarm: Alarm; onStart: () => void; onSnooze: () => void }) {
  const { t, settings } = useStore();
  const [now, setNow] = useState(new Date());
  const [blocked, setBlocked] = useState(false);
  const snoozeAvailable = settings.emergencySnoozeDate !== dateKey(new Date());

  useEffect(() => {
    startAlarmSound(alarm.sound, alarm.volume);
    const check = setTimeout(() => setBlocked(!audioRunning()), 400);
    const clock = setInterval(() => setNow(new Date()), 1000);
    const vib = setInterval(() => vibrate([400, 200, 400]), 1500);
    return () => {
      clearTimeout(check);
      clearInterval(clock);
      clearInterval(vib);
      // le son continue pendant la mission : il est arrêté par l'écran suivant
    };
  }, [alarm.sound, alarm.volume]);

  const enableSound = () => {
    startAlarmSound(alarm.sound, alarm.volume);
    setBlocked(false);
  };

  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");

  return (
    <div
      onClick={blocked ? enableSound : undefined}
      className="relative flex min-h-full flex-col items-center justify-between overflow-hidden px-6 pb-8 pt-[max(2rem,env(safe-area-inset-top))] text-center"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,color-mix(in_srgb,var(--accent)_28%,transparent),transparent_65%)]" />

      <div className="relative w-full">
        {blocked && (
          <div className="mb-3 rounded-2xl bg-[var(--warn)]/15 p-3 text-sm font-bold text-[var(--warn)]">🔇 {t("soundBlocked")}</div>
        )}
        <div className="text-sm font-bold uppercase tracking-widest text-[var(--accent)]">{alarm.label || "WakeFit"}</div>
      </div>

      <div className="relative flex flex-col items-center">
        <div className="pulse-ring mb-8 flex h-28 w-28 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-fg)]">
          <Icon name="bell" size={56} className="ring-shake" />
        </div>
        <div className="tnum text-[6.5rem] font-black leading-none tracking-tighter" dir="ltr">
          {hh}:{mm}
        </div>
        <div className="mt-6 text-4xl font-black">{t("ringing")}</div>
        <div className="mt-4 rounded-full bg-[var(--card)] px-5 py-3 text-xl font-bold border border-[var(--line)]">
          💪 {alarm.reps} {t(alarm.exercise)}
        </div>
      </div>

      <div className="relative w-full space-y-3">
        <Button onClick={onStart} className="!min-h-20 text-xl">
          <Icon name="camera" size={26} /> {t("startMission")}
        </Button>
        <button
          onClick={onSnooze}
          disabled={!snoozeAvailable}
          className="w-full rounded-2xl border border-[var(--line)] py-3.5 text-sm font-semibold text-[var(--muted)] disabled:opacity-40"
        >
          {t("emergencySnooze")}
          <div className="text-xs font-normal">{snoozeAvailable ? t("emergencyLeft") : t("emergencyUsed")}</div>
        </button>
        <p className="text-xs text-[var(--muted)]">🔒 {t("noDismiss")}</p>
      </div>
    </div>
  );
}
