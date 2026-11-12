import { useEffect, useState } from "react";
import { Icon } from "./ui";

const DISMISS_KEY = "wakefit-install-dismissed";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  const ua = navigator.userAgent;
  return /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isStandalone() || localStorage.getItem(DISMISS_KEY) === "1") return;

    if (isIos()) {
      setIos(true);
      setVisible(true);
      return;
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    const onInstalled = () => setVisible(false);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === "accepted") setVisible(false);
    setDeferred(null);
  };

  return (
    <div className="pointer-events-none absolute inset-x-4 bottom-24 z-40 flex justify-center">
      <div className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-3 shadow-2xl">
        <img src="/icon-192.png" alt="" className="h-11 w-11 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-[var(--fg)]">Installer l'application</p>
          {ios ? (
            <p className="text-xs text-[var(--muted)]">Appuie sur Partager puis « Sur l'écran d'accueil ».</p>
          ) : (
            <p className="text-xs text-[var(--muted)]">Accès rapide depuis l'écran d'accueil.</p>
          )}
        </div>
        {deferred && (
          <button
            onClick={install}
            className="shrink-0 rounded-xl bg-[var(--accent)] px-3 py-2 text-xs font-bold text-[var(--accent-fg)] transition active:scale-95"
          >
            Installer
          </button>
        )}
        <button
          onClick={dismiss}
          aria-label="Fermer"
          className="shrink-0 rounded-lg p-1.5 text-[var(--muted)] transition hover:text-[var(--fg)]"
        >
          <Icon name="close" size={18} />
        </button>
      </div>
    </div>
  );
}
