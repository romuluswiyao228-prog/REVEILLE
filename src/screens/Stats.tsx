import { useMemo } from "react";
import { Card, Header, Icon, ProgressRing } from "../components/ui";
import { useStore } from "../lib/store";
import { computeBadges, computeStats } from "../lib/stats";
import type { TKey } from "../lib/i18n";
import { cn } from "../utils/cn";

export default function Stats() {
  const { t, history } = useStore();
  const s = useMemo(() => computeStats(history), [history]);
  const badges = computeBadges(s);
  const max = Math.max(10, ...s.last7.map((d) => d.reps));
  const today = new Date().getDay();

  return (
    <div>
      <Header title={t("statsTitle")} />
      <div className="space-y-4 px-5 pb-6">
        <div className="grid grid-cols-2 gap-3">
          <Card className="!p-4">
            <div className="flex items-center gap-2 text-[var(--accent)]">
              <Icon name="flame" />
              <span className="tnum text-5xl font-black">{s.current}</span>
            </div>
            <div className="mt-1 text-sm font-semibold text-[var(--muted)]">{t("currentStreak")}</div>
          </Card>
          <Card className="!p-4">
            <div className="flex items-center gap-2 text-[var(--warn)]">
              <Icon name="crown" />
              <span className="tnum text-5xl font-black">{s.best}</span>
            </div>
            <div className="mt-1 text-sm font-semibold text-[var(--muted)]">{t("bestStreak")}</div>
          </Card>
          <Card className="!p-4">
            <div className="tnum text-4xl font-black">{s.weekReps}</div>
            <div className="mt-1 text-sm font-semibold text-[var(--muted)]">{t("weekTotal")}</div>
          </Card>
          <Card className="!p-4">
            <div className="tnum text-4xl font-black">{s.monthReps}</div>
            <div className="mt-1 text-sm font-semibold text-[var(--muted)]">{t("monthTotal")}</div>
          </Card>
        </div>

        <Card className="flex items-center gap-5">
          <ProgressRing value={s.rate / 100} size={96} stroke={10} color="var(--ok)">
            <span className="tnum text-xl font-black">{s.rate}%</span>
          </ProgressRing>
          <div>
            <div className="text-lg font-extrabold">{t("successRate")}</div>
            <div className="text-sm text-[var(--muted)]">
              {history.filter((h) => h.success).length} / {history.filter((h) => h.method !== "postponed").length}
            </div>
          </div>
        </Card>

        <Card>
          <div className="mb-4 text-sm font-bold uppercase tracking-wider text-[var(--muted)]">{t("last7")}</div>
          <div className="flex h-36 items-end justify-between gap-2" dir="ltr">
            {s.last7.map((d) => (
              <div key={d.key} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                <div className="tnum text-[11px] font-bold text-[var(--muted)]">{d.reps || ""}</div>
                <div
                  className={cn("w-full rounded-lg", d.day === today ? "bg-[var(--accent)]" : "bg-[var(--accent)]/45")}
                  style={{ height: `${Math.max(d.reps ? 6 : 3, (d.reps / max) * 100)}%`, opacity: d.reps ? 1 : 0.25 }}
                />
                <div className="text-[11px] font-semibold text-[var(--muted)]">{t(`d${d.day}` as TKey)}</div>
              </div>
            ))}
          </div>
        </Card>

        <div>
          <div className="mb-3 px-1 text-sm font-bold uppercase tracking-wider text-[var(--muted)]">{t("badges")}</div>
          <div className="grid grid-cols-2 gap-3">
            {badges.map((b) => (
              <Card key={b.id} className={cn("!p-4 text-center", !b.unlocked && "opacity-45")}>
                <div className={cn("text-5xl", !b.unlocked && "grayscale")}>{b.icon}</div>
                <div className="mt-2 font-extrabold">{t(b.id as TKey)}</div>
                <div className="text-xs text-[var(--muted)]">{t(`${b.id}_d` as TKey)}</div>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
