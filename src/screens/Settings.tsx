import { useEffect, useState } from "react";
import { Card, Field, Header, Icon, Segmented, Toggle } from "../components/ui";
import { useStore } from "../lib/store";
import { SOUNDS } from "./AlarmEditor";
import { previewSound } from "../lib/audio";
import {
  isNative, pendingNotifications, notificationPermission, exactAlarmStatus,
  openExactAlarmSettings, scheduleTestNotification, type PendingInfo,
} from "../lib/nativeAlarms";
import type { TKey } from "../lib/i18n";
import { cn } from "../utils/cn";

function NativeDiagnostics({ t }: { t: (k: TKey) => string }) {
  const [notif, setNotif] = useState("…");
  const [exact, setExact] = useState("…");
  const [pending, setPending] = useState<PendingInfo[]>([]);
  const refresh = async () => {
    setNotif(await notificationPermission());
    setExact(await exactAlarmStatus());
    setPending(await pendingNotifications());
  };
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Field label={t("diagTitle")}>
      <Card className="!p-4 text-sm">
        <div className="flex justify-between"><span className="text-[var(--muted)]">{t("diagNotifPerm")}</span><b>{notif}</b></div>
        <div className="mt-1 flex justify-between"><span className="text-[var(--muted)]">{t("diagExactPerm")}</span><b>{exact}</b></div>
        <div className="mt-3 text-[var(--muted)]">{t("diagPending")} : {pending.length}</div>
        {pending.slice(0, 8).map((p) => (
          <div key={p.id} className="tnum text-xs" dir="ltr">#{p.id} · {p.at ? new Date(p.at).toLocaleString() : "-"}</div>
        ))}
        <div className="mt-3 flex gap-2">
          <button onClick={() => void scheduleTestNotification()} className="flex-1 rounded-xl bg-[var(--accent)] px-3 py-2.5 text-xs font-bold text-[var(--accent-fg)]">
            {t("testAlarmBtn")}
          </button>
          <button onClick={() => void openExactAlarmSettings().then(refresh)} className="flex-1 rounded-xl border border-[var(--line)] px-3 py-2.5 text-xs font-bold">
            {t("allowExactBtn")}
          </button>
        </div>
        <p className="mt-3 text-xs leading-snug text-[var(--muted)]">{t("diagHelp")}</p>
      </Card>
    </Field>
  );
}

export default function Settings({ onPrivacy, onPremium }: { onPrivacy: () => void; onPremium: () => void }) {
  const { t, settings, setSettings, profile, setProfile, reset } = useStore();

  return (
    <div>
      <Header title={t("settingsTitle")} />
      <div className="space-y-6 px-5 pb-8">
        <button
          onClick={onPremium}
          className="flex w-full items-center gap-3 rounded-3xl bg-gradient-to-r from-[var(--accent)] to-[var(--warn)] p-4 text-start text-[var(--accent-fg)]"
        >
          <Icon name="crown" size={28} />
          <div className="flex-1 text-lg font-black">{settings.premium ? t("premiumActive") : t("premium")}</div>
          <Icon name="chevron" className="rtl:rotate-180" />
        </button>

        <Field label={t("language")}>
          <Segmented
            value={settings.lang}
            onChange={(v) => setSettings({ lang: v })}
            options={[
              { value: "fr", label: "Français" },
              { value: "en", label: "English" },
              { value: "ar", label: "العربية" },
            ]}
          />
        </Field>

        <Field label={t("theme")}>
          <Segmented
            value={settings.theme}
            onChange={(v) => setSettings({ theme: v })}
            options={[
              { value: "dark", label: `🌙 ${t("dark")}` },
              { value: "light", label: `☀️ ${t("light")}` },
            ]}
          />
        </Field>

        <Field label={`${t("volume")} · ${Math.round(settings.volume * 100)}%`}>
          <Card className="!p-4">
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={settings.volume}
              onChange={(e) => setSettings({ volume: +e.target.value })}
              onPointerUp={() => previewSound(settings.sound, settings.volume)}
              className="w-full"
            />
          </Card>
        </Field>

        <Field label={t("alarmSound")}>
          <div className="space-y-2">
            {SOUNDS.map((s) => {
              const locked = s.premium && !settings.premium;
              return (
                <button
                  key={s.id}
                  onClick={() => {
                    if (locked) return onPremium();
                    setSettings({ sound: s.id });
                    previewSound(s.id, settings.volume);
                  }}
                  className={cn(
                    "flex min-h-14 w-full items-center gap-3 rounded-2xl border px-4 text-start font-semibold",
                    settings.sound === s.id ? "border-[var(--accent)] bg-[var(--accent)]/10" : "border-[var(--line)] bg-[var(--card)]",
                  )}
                >
                  <Icon name="sound" className="text-[var(--accent)]" />
                  <span className="flex-1">{t(`sound_${s.id}` as TKey)}</span>
                  {locked && <Icon name="crown" size={18} className="text-[var(--warn)]" />}
                  {settings.sound === s.id && <Icon name="check" className="text-[var(--accent)]" />}
                </button>
              );
            })}
          </div>
        </Field>

        <Field label={t("sensitivity")}>
          <Segmented
            value={settings.sensitivity}
            onChange={(v) => setSettings({ sensitivity: v })}
            options={[
              { value: "low", label: t("low") },
              { value: "normal", label: t("normal") },
              { value: "high", label: t("high") },
            ]}
          />
        </Field>

        <Field label={t("validation")}>
          <Segmented
            value={settings.strict ? "strict" : "soft"}
            onChange={(v) => setSettings({ strict: v === "strict" })}
            options={[
              { value: "strict", label: t("strict") },
              { value: "soft", label: t("soft") },
            ]}
          />
          <p className="px-1 text-xs text-[var(--muted)]">{settings.strict ? t("strictDesc") : t("softDesc")}</p>
        </Field>

        <Card className="flex items-center gap-4">
          <div className="flex-1">
            <div className="font-bold">{t("allowSquats")}</div>
            <div className="text-sm text-[var(--muted)]">{t("allowSquatsDesc")}</div>
          </div>
          <Toggle on={settings.allowSquats} onChange={(v) => setSettings({ allowSquats: v })} label={t("allowSquats")} />
        </Card>

        <Field label={t("profileName")}>
          <input
            value={profile.name}
            maxLength={30}
            onChange={(e) => setProfile({ name: e.target.value })}
            placeholder={t("profileNamePh")}
            className="min-h-14 w-full rounded-2xl border border-[var(--line)] bg-[var(--card)] px-4 text-base font-semibold outline-none focus:border-[var(--accent)]"
          />
        </Field>

        {isNative() && <NativeDiagnostics t={t} />}

        <button onClick={onPrivacy} className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--card)] px-4 text-start font-bold">
          <Icon name="shield" className="text-[var(--ok)]" />
          <span className="flex-1">{t("privacyPolicy")}</span>
          <Icon name="chevron" className="rtl:rotate-180 text-[var(--muted)]" />
        </button>

        <button
          onClick={() => {
            if (confirm(t("resetConfirm")) && confirm(t("resetConfirm2"))) reset();
          }}
          className="w-full rounded-2xl py-3 text-sm font-semibold text-[var(--bad)]"
        >
          {t("resetData")}
        </button>
        <div className="text-center text-xs text-[var(--muted)]">WakeFit · v1.0.0</div>
      </div>
    </div>
  );
}
