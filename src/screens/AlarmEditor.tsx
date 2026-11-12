import { useState } from "react";
import { Button, Card, Field, Header, Icon, Segmented } from "../components/ui";
import { uid, useStore } from "../lib/store";
import type { Alarm, SoundId } from "../lib/types";
import type { TKey } from "../lib/i18n";
import { previewSound } from "../lib/audio";
import { cn } from "../utils/cn";

export const SOUNDS: { id: SoundId; premium: boolean }[] = [
  { id: "sunrise", premium: false },
  { id: "pulse", premium: false },
  { id: "digital", premium: false },
  { id: "siren", premium: true },
  { id: "beacon", premium: true },
];

export default function AlarmEditor({ id, onClose, onPremium }: { id?: string; onClose: () => void; onPremium: () => void }) {
  const { t, alarms, settings, saveAlarm, removeAlarm } = useStore();
  const existing = alarms.find((a) => a.id === id);
  const [a, setA] = useState<Alarm>(
    existing ?? {
      id: uid(),
      time: "07:00",
      days: [1, 2, 3, 4, 5],
      label: "",
      sound: settings.sound,
      volume: settings.volume,
      exercise: "pushup",
      reps: 10,
      difficulty: "normal",
      enabled: true,
    },
  );
  const [err, setErr] = useState("");
  const set = (p: Partial<Alarm>) => setA((x) => ({ ...x, ...p }));

  const toggleDay = (d: number) => set({ days: a.days.includes(d) ? a.days.filter((x) => x !== d) : [...a.days, d].sort() });

  const save = () => {
    if (!existing && !settings.premium && alarms.length >= 3) {
      setErr(t("limitAlarms"));
      return;
    }
    saveAlarm(a);
    onClose();
  };

  const order = [1, 2, 3, 4, 5, 6, 0];

  return (
    <div className="flex min-h-full flex-col">
      <Header title={existing ? t("editAlarm") : t("newAlarm")} onBack={onClose} />
      <div className="flex-1 space-y-6 px-5 pb-6">
        <Card className="flex items-center justify-center !py-6">
          <input
            type="time"
            value={a.time}
            onChange={(e) => e.target.value && set({ time: e.target.value })}
            dir="ltr"
            className="tnum w-full bg-transparent text-center text-7xl font-black tracking-tight outline-none"
            aria-label={t("time")}
          />
        </Card>

        <Field label={t("repeat")}>
          <div className="flex justify-between gap-1.5">
            {order.map((d) => (
              <button
                key={d}
                onClick={() => toggleDay(d)}
                className={cn(
                  "flex h-12 flex-1 items-center justify-center rounded-2xl text-[11px] font-bold transition",
                  a.days.includes(d) ? "bg-[var(--accent)] text-[var(--accent-fg)]" : "bg-[var(--card)] text-[var(--muted)] border border-[var(--line)]",
                )}
              >
                {t(`d${d}` as TKey)}
              </button>
            ))}
          </div>
          {a.days.length === 0 && <p className="px-1 text-xs text-[var(--muted)]">{t("once")}</p>}
        </Field>

        <Field label={t("label")}>
          <input
            value={a.label}
            maxLength={30}
            onChange={(e) => set({ label: e.target.value })}
            placeholder={t("labelPh")}
            className="min-h-14 w-full rounded-2xl border border-[var(--line)] bg-[var(--card)] px-4 text-base font-semibold outline-none focus:border-[var(--accent)]"
          />
        </Field>

        <Field label={t("exercise")}>
          <Segmented
            value={a.exercise}
            onChange={(v) => set({ exercise: v })}
            options={[
              { value: "pushup", label: `💪 ${t("pushup")}` },
              { value: "squat", label: `🦵 ${t("squat")}`, disabled: !settings.allowSquats },
            ]}
          />
          {!settings.allowSquats && <p className="px-1 text-xs text-[var(--muted)]">{t("squatsLocked")}</p>}
        </Field>

        <Field label={`${t("reps")} · ${a.reps}`}>
          <Card className="!p-4">
            <div className="flex items-center gap-4">
              <button
                onClick={() => set({ reps: Math.max(5, a.reps - 1) })}
                className="h-12 w-12 rounded-full bg-[var(--card2)] text-2xl font-bold"
                aria-label="-"
              >
                −
              </button>
              <div className="tnum flex-1 text-center text-5xl font-black">{a.reps}</div>
              <button
                onClick={() => set({ reps: Math.min(50, a.reps + 1) })}
                className="h-12 w-12 rounded-full bg-[var(--card2)] text-2xl font-bold"
                aria-label="+"
              >
                +
              </button>
            </div>
            <input type="range" min={5} max={50} value={a.reps} onChange={(e) => set({ reps: +e.target.value })} className="mt-3 w-full" />
            <div className="flex justify-between text-xs text-[var(--muted)]" dir="ltr">
              <span>5</span>
              <span>50</span>
            </div>
          </Card>
        </Field>

        <Field label={t("difficulty")}>
          <Segmented
            value={a.difficulty}
            onChange={(v) => set({ difficulty: v })}
            options={[
              { value: "easy", label: t("easy") },
              { value: "normal", label: t("normal") },
              { value: "hard", label: t("hard") },
            ]}
          />
        </Field>

        <Field label={t("sound")}>
          <div className="space-y-2">
            {SOUNDS.map((s) => {
              const locked = s.premium && !settings.premium;
              return (
                <button
                  key={s.id}
                  onClick={() => {
                    if (locked) return onPremium();
                    set({ sound: s.id });
                    previewSound(s.id, a.volume);
                  }}
                  className={cn(
                    "flex min-h-14 w-full items-center gap-3 rounded-2xl border px-4 text-start font-semibold",
                    a.sound === s.id ? "border-[var(--accent)] bg-[var(--accent)]/10" : "border-[var(--line)] bg-[var(--card)]",
                  )}
                >
                  <Icon name="sound" className="text-[var(--accent)]" />
                  <span className="flex-1">{t(`sound_${s.id}` as TKey)}</span>
                  {locked && <Icon name="crown" size={18} className="text-[var(--warn)]" />}
                  {a.sound === s.id && <Icon name="check" className="text-[var(--accent)]" />}
                </button>
              );
            })}
          </div>
        </Field>

        <Field label={`${t("volume")} · ${Math.round(a.volume * 100)}%`}>
          <input type="range" min={0.1} max={1} step={0.05} value={a.volume} onChange={(e) => set({ volume: +e.target.value })} className="w-full" />
        </Field>

        <div className="flex items-start gap-3 rounded-2xl bg-[var(--card)] p-4 text-sm text-[var(--muted)] border border-[var(--line)]">
          <Icon name="lock" size={18} className="mt-0.5" />
          {t("noSnoozeInfo")}
        </div>

        {err && (
          <button onClick={onPremium} className="w-full rounded-2xl bg-[var(--warn)]/15 p-4 text-sm font-bold text-[var(--warn)]">
            {err} → Premium
          </button>
        )}
      </div>

      <div className="sticky bottom-0 space-y-2 border-t border-[var(--line)] bg-[var(--bg)]/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur">
        <Button onClick={save}>{t("save")}</Button>
        {existing && (
          <Button
            variant="danger"
            onClick={() => {
              if (confirm(t("confirmDelete"))) {
                removeAlarm(a.id);
                onClose();
              }
            }}
          >
            <Icon name="trash" size={20} /> {t("delete")}
          </Button>
        )}
      </div>
    </div>
  );
}
