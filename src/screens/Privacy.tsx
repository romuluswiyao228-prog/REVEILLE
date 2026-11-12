import { Header, Icon } from "../components/ui";
import { useStore } from "../lib/store";
import type { TKey } from "../lib/i18n";

export default function Privacy({ onClose }: { onClose: () => void }) {
  const { t } = useStore();
  const sections = [1, 2, 3, 4, 5];
  return (
    <div>
      <Header title={t("pv_title")} onBack={onClose} />
      <div className="space-y-4 px-5 pb-8">
        <div className="flex items-center justify-center rounded-3xl bg-[var(--ok)]/10 py-8 text-[var(--ok)]">
          <Icon name="shield" size={64} />
        </div>
        {sections.map((n) => (
          <div key={n} className="rounded-3xl border border-[var(--line)] bg-[var(--card)] p-5">
            <h2 className="text-lg font-extrabold">{t(`pv_h${n}` as TKey)}</h2>
            {n === 5 ? (
              <p className="mt-2 leading-relaxed text-[var(--muted)]">
                {t("pv_p5")}{" "}
                <a href="mailto:romuluswiyao228@gmail.com" className="font-bold text-[var(--accent)]" dir="ltr">
                  romuluswiyao228@gmail.com
                </a>
              </p>
            ) : (
              <p className="mt-2 leading-relaxed text-[var(--muted)]">{t(`pv_p${n}` as TKey)}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
