import { useState } from "react";
import { Button, Icon } from "../components/ui";
import { useStore } from "../lib/store";
import { cn } from "../utils/cn";
import type { TKey } from "../lib/i18n";

export default function Paywall({ onClose }: { onClose: () => void }) {
  const { t, settings, setSettings } = useStore();
  const [plan, setPlan] = useState<"yearly" | "monthly">("yearly");

  const features: TKey[] = ["pw_f1", "pw_f2", "pw_f3", "pw_f4"];

  return (
    <div className="relative flex min-h-full flex-col px-6 pb-8 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_50%_0%,color-mix(in_srgb,var(--warn)_30%,transparent),transparent_70%)]" />
      <button onClick={onClose} aria-label={t("close")} className="relative flex h-11 w-11 items-center justify-center self-end rounded-full bg-[var(--card)] border border-[var(--line)]">
        <Icon name="close" />
      </button>

      <div className="relative flex flex-1 flex-col">
        <div className="mx-auto mt-2 flex h-24 w-24 items-center justify-center rounded-[2rem] bg-gradient-to-br from-[var(--accent)] to-[var(--warn)] text-[var(--accent-fg)]">
          <Icon name="crown" size={52} />
        </div>
        <h1 className="mt-6 text-center text-4xl font-black tracking-tight">{t("pw_title")}</h1>
        <p className="mx-auto mt-2 max-w-xs text-center text-[var(--muted)]">{t("pw_sub")}</p>

        <ul className="mt-8 space-y-3">
          {features.map((f) => (
            <li key={f} className="flex items-center gap-3 text-base font-semibold">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--ok)]/15 text-[var(--ok)]">
                <Icon name="check" size={16} />
              </span>
              {t(f)}
            </li>
          ))}
        </ul>

        <div className="mt-8 grid grid-cols-2 gap-3">
          {(["monthly", "yearly"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPlan(p)}
              className={cn(
                "relative rounded-3xl border-2 p-4 text-start transition",
                plan === p ? "border-[var(--accent)] bg-[var(--accent)]/10" : "border-[var(--line)] bg-[var(--card)]",
              )}
            >
              {p === "yearly" && (
                <span className="absolute -top-3 end-3 rounded-full bg-[var(--ok)] px-2.5 py-0.5 text-xs font-black text-[#06140d]">{t("bestValue")}</span>
              )}
              <div className="text-sm font-bold text-[var(--muted)]">{t(p)}</div>
              <div className="tnum mt-1 text-2xl font-black">{p === "monthly" ? "2,99 €" : "21,99 €"}</div>
              <div className="text-xs text-[var(--muted)]">{p === "monthly" ? t("perMonth") : t("perYear")}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="relative mt-6 space-y-3">
        {settings.premium ? (
          <Button variant="soft" onClick={() => setSettings({ premium: false })}>
            {t("premiumActive")}
          </Button>
        ) : (
          <Button
            onClick={() => {
              setSettings({ premium: true });
              onClose();
            }}
          >
            {t("subscribe")}
          </Button>
        )}
        <button className="w-full py-2 text-sm font-semibold text-[var(--muted)]">{t("restore")}</button>
        <p className="text-center text-[11px] text-[var(--muted)]">{t("pw_note")}</p>
      </div>
    </div>
  );
}
