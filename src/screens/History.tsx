import { Card, Header } from "../components/ui";
import { useStore } from "../lib/store";

export default function History() {
  const { t, history, settings } = useStore();
  const locale = settings.lang === "ar" ? "ar-u-nu-latn" : settings.lang;
  const items = [...history].sort((a, b) => b.ts - a.ts);

  return (
    <div>
      <Header title={t("historyTitle")} />
      <div className="space-y-3 px-5 pb-6">
        {items.length === 0 && <Card className="text-center text-[var(--muted)]">{t("emptyHistory")}</Card>}
        {items.map((h) => {
          const d = new Date(h.ts);
          return (
            <Card key={h.id} className="flex items-center gap-4 !p-4">
              <div
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-xl ${
                  h.success ? "bg-[var(--ok)]/15 text-[var(--ok)]" : "bg-[var(--bad)]/15 text-[var(--bad)]"
                }`}
              >
                {h.success ? "✓" : "✕"}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-extrabold capitalize">{d.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "short" })}</div>
                <div className="text-sm text-[var(--muted)]">
                  <span dir="ltr">{h.time}</span> · {t(h.exercise)}
                  {h.method === "manual" && ` · ${t("manualTag")}`}
                  {h.method === "postponed" && ` · ${t("postponedTag")}`}
                </div>
              </div>
              <div className="text-end">
                <div className="tnum text-xl font-black" dir="ltr">
                  {h.reps}/{h.target}
                </div>
                <div className={`text-xs font-bold ${h.success ? "text-[var(--ok)]" : "text-[var(--bad)]"}`}>{h.success ? t("success") : t("failed")}</div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
