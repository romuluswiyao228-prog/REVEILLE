import { useState } from "react";
import { Button, Icon } from "../components/ui";
import { useStore } from "../lib/store";
import { cn } from "../utils/cn";
import type { Lang } from "../lib/types";

const langs: { id: Lang; label: string }[] = [
  { id: "fr", label: "Français" },
  { id: "en", label: "English" },
  { id: "ar", label: "العربية" },
];

export default function Onboarding({ onDone }: { onDone: () => void }) {
  const { t, settings, setSettings, profile, setProfile } = useStore();
  const [i, setI] = useState(0);
  const [camMsg, setCamMsg] = useState<string | null>(null);

  const slides = [
    { icon: "bell", title: t("ob1_t"), desc: t("ob1_d") },
    { icon: "camera", title: t("ob2_t"), desc: t("ob2_d") },
    { icon: "shield", title: t("ob3_t"), desc: t("ob3_d") },
  ];
  const s = slides[i];

  const finish = () => {
    setSettings({ onboarded: true });
    onDone();
  };

  const askCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      stream.getTracks().forEach((tr) => tr.stop()); // on libère aussitôt la caméra
      setSettings({ cameraGranted: true });
      setCamMsg(t("cameraGranted"));
      setTimeout(finish, 700);
    } catch {
      setCamMsg(t("cameraDenied"));
    }
  };

  return (
    <div className="flex min-h-full flex-col px-6 pb-8 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <div className="flex items-center justify-between">
        <div className="text-xl font-black tracking-tight">
          Wake<span className="text-[var(--accent)]">Fit</span>
        </div>
        <div className="flex gap-1 rounded-full bg-[var(--card)] p-1 border border-[var(--line)]">
          {langs.map((l) => (
            <button
              key={l.id}
              onClick={() => setSettings({ lang: l.id })}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-bold",
                settings.lang === l.id ? "bg-[var(--accent)] text-[var(--accent-fg)]" : "text-[var(--muted)]",
              )}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      <div key={i} className="slide-up flex flex-1 flex-col items-center justify-center text-center">
        <div className="mb-10 flex h-40 w-40 items-center justify-center rounded-[2.5rem] bg-[var(--card)] border border-[var(--line)] shadow-[0_0_80px_-20px_var(--accent)]">
          <Icon name={s.icon} size={72} className={cn("text-[var(--accent)]", i === 0 && "ring-shake")} />
        </div>
        <h1 className="text-3xl font-black leading-tight tracking-tight">{s.title}</h1>
        <p className="mt-4 max-w-xs text-base leading-relaxed text-[var(--muted)]">{s.desc}</p>
        {i === 2 && (
          <input
            value={profile.name}
            maxLength={30}
            onChange={(e) => setProfile({ name: e.target.value })}
            placeholder={t("profileNamePh")}
            className="mt-6 min-h-14 w-full max-w-xs rounded-2xl border border-[var(--line)] bg-[var(--card)] px-4 text-base font-semibold outline-none focus:border-[var(--accent)]"
          />
        )}
        {i === 2 && camMsg && <p className="mt-4 text-sm font-semibold text-[var(--warn)]">{camMsg}</p>}
      </div>

      <div className="mb-6 flex justify-center gap-2">
        {slides.map((_, k) => (
          <span key={k} className={cn("h-2 rounded-full transition-all", k === i ? "w-8 bg-[var(--accent)]" : "w-2 bg-[var(--line)]")} />
        ))}
      </div>

      {i < 2 ? (
        <Button onClick={() => setI(i + 1)}>{t("next")}</Button>
      ) : (
        <div className="space-y-3">
          <Button onClick={askCamera}>
            <Icon name="camera" /> {t("allowCamera")}
          </Button>
          <Button variant="ghost" onClick={finish}>
            {t("later")}
          </Button>
        </div>
      )}
    </div>
  );
}
