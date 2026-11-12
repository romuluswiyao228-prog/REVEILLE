import { useEffect, useMemo, useState } from "react";
import { Button, Card, Icon, Toggle } from "../components/ui";
import { useStore } from "../lib/store";
import { computeStats, formatDuration, nextRing } from "../lib/stats";
import type { Alarm } from "../lib/types";
import type { TKey } from "../lib/i18n";

export function daysLabel(a: Alarm, t: (k: TKey) => string): string {
  if (a.days.length === 0) return t("once");
  if (a.days.length === 7) return t("everyDay");
  if (a.days.length === 5 && [1, 2, 3, 4, 5].every((d) => a.days.includes(d))) return t("weekdays");
  return a.days.map((d) => t(`d${d}` as TKey)).join(" · ");
}

export default function Home({
  onAdd,
  onEdit,
  onTest,
  onPremium,
}: {
  onAdd: () => void;
  onEdit: (id: string) => void;
  onTest: (id: string) => void;
  onPremium: () => void;
}) {
  const { t, alarms, history, toggleAlarm, postponed, settings } = useStore();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(id);
  }, []);

  const stats = useMemo(() => computeStats(history, now), [history, now]);

  const next = useMemo(() => {
    let best: { alarm: Alarm; at: number } | null = null;
    for (const a of alarms) {
      if (!a.enabled) continue;
      const at = nextRing(a.time, a.days, now);
      if (at && (!best || at < best.at)) best = { alarm: a, at };
    }
    return best;
  }, [alarms, now]);

  const sorted = [...alarms].sort((a, b) => a.time.localeCompare(b.time));
  const greeting = now.getHours() < 12 ? "☀️" : now.getHours() < 18 ? "🌤️" : "🌙";

  return (
    <div className="space-y-5 px-5 pb-6">
      <div className="flex items-center justify-between pt-[max(1.25rem,env(safe-area-inset-top))]">
        <div className="text-2xl font-black tracking-tight">
          {greeting} Wake<span className="text-[var(--accent)]">Fit</span>
        </div>
        {!settings.premium && (
          <button onClick={onPremium} className="flex items-center gap-1.5 rounded-full bg-[var(--warn)]/15 px-3 py-2 text-xs font-bold text-[var(--warn)]">
            <Icon name="crown" size={16} /> Premium
          </button>
        )}
      </div>

      {postponed && (
        <div className="flex items-start gap-3 rounded-2xl border border-[var(--warn)]/40 bg-[var(--warn)]/10 p-4 text-sm font-semibold text-[var(--warn)]">
          <Icon name="warn" />
          <span>
            {postponed.kind === "problem"
              ? t("postponedAt", { t: new Date(postponed.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) })
              : t("snoozedTo", { t: new Date(postponed.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) })}
          </span>
        </div>
      )}

      {/* Prochaine alarme */}
      <Card className="relative overflow-hidden !p-6">
        <div className="absolute -end-10 -top-10 h-40 w-40 rounded-full bg-[var(--accent)]/15 blur-3xl" />
        <div className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">{t("nextAlarm")}</div>
        {next ? (
          <>
            <div className="tnum mt-2 text-7xl font-black leading-none tracking-tight" dir="ltr">
              {next.alarm.time}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-full bg-[var(--accent)]/15 px-3 py-1 font-bold text-[var(--accent)]">
                {t("inTime", { t: formatDuration(next.at - now.getTime()) })}
              </span>
              <span className="text-[var(--muted)]">
                {next.alarm.reps} × {t(next.alarm.exercise)}
              </span>
            </div>
          </>
        ) : (
          <div className="mt-3 text-xl font-bold text-[var(--muted)]">{t("noAlarm")}</div>
        )}
      </Card>

      {/* Stats rapides */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="!p-3 text-center">
          <div className="flex items-center justify-center gap-1 text-3xl font-black text-[var(--accent)]">
            <Icon name="flame" size={24} />
            <span className="tnum">{stats.current}</span>
          </div>
          <div className="mt-1 text-[11px] font-semibold text-[var(--muted)]">
            {t("streak")} · {t("daysUnit")}
          </div>
        </Card>
        <Card className="!p-3 text-center">
          <div className="tnum text-3xl font-black">{stats.weekReps}</div>
          <div className="mt-1 text-[11px] font-semibold text-[var(--muted)]">{t("week")}</div>
        </Card>
        <Card className="!p-3 text-center">
          <div className="tnum text-3xl font-black">{stats.monthReps}</div>
          <div className="mt-1 text-[11px] font-semibold text-[var(--muted)]">{t("month")}</div>
        </Card>
      </div>

      {/* Liste */}
      <div className="flex items-center justify-between pt-1">
        <h2 className="text-lg font-extrabold">{t("myAlarms")}</h2>
        <button onClick={onAdd} className="flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-4 py-2.5 text-sm font-bold text-[var(--accent-fg)]">
          <Icon name="plus" size={18} /> {t("addAlarm")}
        </button>
      </div>

      {sorted.length === 0 && <Card className="text-center text-[var(--muted)]">{t("emptyAlarms")}</Card>}

      <div className="space-y-3">
        {sorted.map((a) => (
          <Card key={a.id} className={`!p-0 transition ${a.enabled ? "" : "opacity-60"}`}>
            <div className="flex items-center gap-3 p-4">
              <button onClick={() => onEdit(a.id)} className="flex-1 text-start">
                <div className="tnum text-4xl font-black tracking-tight" dir="ltr">
                  {a.time}
                </div>
                <div className="mt-1 text-sm font-semibold text-[var(--muted)]">
                  {a.label ? `${a.label} · ` : ""}
                  {daysLabel(a, t)}
                </div>
                <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-[var(--card2)] px-2.5 py-1 text-xs font-bold">
                  💪 {a.reps} {t(a.exercise)} · {t(a.difficulty)}
                </div>
              </button>
              <Toggle on={a.enabled} onChange={() => toggleAlarm(a.id)} label="toggle" />
            </div>
          </Card>
        ))}
      </div>

      {alarms.length > 0 && (
        <Button variant="soft" onClick={() => onTest((sorted.find((a) => a.enabled) ?? sorted[0]).id)}>
          <Icon name="bell" size={20} /> {t("testRing")}
        </Button>
      )}
    </div>
  );
}
