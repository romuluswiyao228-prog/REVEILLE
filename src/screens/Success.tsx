import { useEffect, useMemo } from "react";
import { Button, Icon } from "../components/ui";
import { useStore } from "../lib/store";
import { playSuccess, stopAlarmSound, vibrate } from "../lib/audio";
import type { TKey } from "../lib/i18n";

export interface SuccessData {
  reps: number;
  durationSec: number;
  streak: number;
  newBadges: { id: string; icon: string }[];
}

export default function Success({ data, onHome }: { data: SuccessData; onHome: () => void }) {
  const { t } = useStore();

  useEffect(() => {
    stopAlarmSound();
    playSuccess();
    vibrate([80, 60, 80, 60, 200]);
  }, []);

  const pieces = useMemo(
    () =>
      Array.from({ length: 36 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 1.2,
        dur: 2.2 + Math.random() * 2,
        color: ["#ff6b2c", "#3ddc97", "#ffc23d", "#5ab0ff", "#ff5d9e"][i % 5],
      })),
    [],
  );

  const m = Math.floor(data.durationSec / 60);
  const s = data.durationSec % 60;

  return (
    <div className="relative flex min-h-full flex-col items-center justify-between overflow-hidden px-6 pb-8 pt-16 text-center">
      <div className="pointer-events-none absolute inset-0">
        {pieces.map((p, i) => (
          <span key={i} className="confetti" style={{ left: `${p.left}%`, animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s`, background: p.color }} />
        ))}
      </div>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,color-mix(in_srgb,var(--ok)_25%,transparent),transparent_60%)]" />

      <div className="relative flex flex-1 flex-col items-center justify-center">
        <div className="slide-up flex h-36 w-36 items-center justify-center rounded-full bg-[var(--ok)] shadow-[0_0_80px_-10px_var(--ok)]">
          <svg width="76" height="76" viewBox="0 0 24 24" fill="none" stroke="#06140d" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
            <path className="check-draw" d="M5 12.5l4.5 4.5L19 7" />
          </svg>
        </div>
        <h1 className="mt-8 text-5xl font-black leading-tight tracking-tight">{t("missionDone")}</h1>
        <p className="mt-3 max-w-xs text-lg text-[var(--muted)]">{t("missionDoneSub")}</p>

        <div className="mt-8 grid w-full max-w-sm grid-cols-3 gap-3">
          <div className="rounded-2xl bg-[var(--card)] p-3 border border-[var(--line)]">
            <div className="tnum text-3xl font-black">{data.reps}</div>
            <div className="text-[11px] font-semibold text-[var(--muted)]">{t("repsUnit")}</div>
          </div>
          <div className="rounded-2xl bg-[var(--card)] p-3 border border-[var(--line)]">
            <div className="tnum text-3xl font-black" dir="ltr">
              {m}:{String(s).padStart(2, "0")}
            </div>
            <div className="text-[11px] font-semibold text-[var(--muted)]">{t("timeTaken")}</div>
          </div>
          <div className="rounded-2xl bg-[var(--card)] p-3 border border-[var(--line)]">
            <div className="tnum flex items-center justify-center gap-1 text-3xl font-black text-[var(--accent)]">
              <Icon name="flame" size={22} />
              {data.streak}
            </div>
            <div className="text-[11px] font-semibold text-[var(--muted)]">{t("streak")}</div>
          </div>
        </div>

        {data.newBadges.length > 0 && (
          <div className="mt-6 w-full max-w-sm rounded-2xl border border-[var(--warn)]/40 bg-[var(--warn)]/10 p-4">
            <div className="text-xs font-bold uppercase tracking-wider text-[var(--warn)]">{t("newBadge")}</div>
            <div className="mt-2 flex justify-center gap-4">
              {data.newBadges.map((b) => (
                <div key={b.id} className="flex items-center gap-2 text-lg font-extrabold">
                  <span className="text-3xl">{b.icon}</span>
                  {t(b.id as TKey)}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <Button onClick={onHome} className="relative">
        {t("backHome")}
      </Button>
    </div>
  );
}
