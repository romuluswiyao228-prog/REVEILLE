import { useEffect, useState } from "react";
import { Button, Icon } from "./ui";

const DISMISS_KEY = "wakefit-install-dismissed";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type IosBrowser = "safari" | "chrome" | "edge" | "firefox" | "other";

function isIos(): boolean {
  const ua = navigator.userAgent;
  return /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/** Navigateur iOS via UA : CriOS=Chrome, EdgiOS=Edge, FxiOS=Firefox, sinon Safari/WebKit. */
function iosBrowser(): IosBrowser | null {
  if (!isIos()) return null;
  const ua = navigator.userAgent;
  if (/crios/i.test(ua)) return "chrome";
  if (/edgios/i.test(ua)) return "edge";
  if (/fxios/i.test(ua)) return "firefox";
  if (/safari/i.test(ua) && !/crios|edgios|fxios|android/i.test(ua)) return "safari";
  return "other";
}

/** Navigateurs sans API d'installation (ex. Firefox desktop). */
function isUnsupported(): boolean {
  return /firefox/i.test(navigator.userAgent) && !isIos();
}

const IOS_STEPS: Record<IosBrowser, string[]> = {
  safari: [
    "1. Appuie sur Partager",
    "2. Choisis « Sur l'écran d'accueil »",
    "3. Appuie sur Ajouter",
  ],
  chrome: [
    "1. Appuie sur Partager (ou le menu ⋯)",
    "2. Choisis « Sur l'écran d'accueil »",
    "3. Appuie sur Ajouter",
  ],
  edge: [
    "1. Appuie sur Partager (ou le menu ⋯)",
    "2. Choisis « Sur l'écran d'accueil »",
    "3. Appuie sur Ajouter",
  ],
  firefox: [
    "1. Appuie sur Partager (ou le menu ⋯)",
    "2. Choisis « Sur l'écran d'accueil »",
    "3. Appuie sur Ajouter",
  ],
  other: [
    "1. Appuie sur Partager (ou le menu ⋯)",
    "2. Choisis « Sur l'écran d'accueil »",
    "3. Appuie sur Ajouter",
  ],
};

const IOS_BROWSER_LABEL: Record<IosBrowser, string> = {
  safari: "Safari",
  chrome: "Chrome",
  edge: "Edge",
  firefox: "Firefox",
  other: "votre navigateur",
};

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [ios, setIos] = useState<IosBrowser | null>(null);
  const [unsupported, setUnsupported] = useState(false);
  const [visible, setVisible] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    if (
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as { standalone?: boolean }).standalone === true ||
      localStorage.getItem(DISMISS_KEY) === "1"
    ) {
      return;
    }

    const ib = iosBrowser();
    if (ib) {
      setIos(ib);
      setVisible(true);
      return;
    }
    if (isUnsupported()) {
      setUnsupported(true);
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
    setShowHelp(false);
  };

  const install = async () => {
    if (ios) {
      setShowHelp(true);
      return;
    }
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === "accepted") setVisible(false);
    setDeferred(null);
  };

  return (
    <>
      <div className="pointer-events-none absolute inset-x-4 bottom-24 z-40 flex justify-center">
        <div className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-3 shadow-2xl">
          <img src="/icon-192.png" alt="" className="h-11 w-11 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-[var(--fg)]">Installer l'application</p>
            <p className="text-xs text-[var(--muted)]">
              {unsupported
                ? "Ouvre ce site dans Chrome ou Edge pour l'installer"
                : ios
                  ? `Dans ${IOS_BROWSER_LABEL[ios]}, ajoute WakeFit à ton écran d'accueil.`
                  : "Accès rapide depuis l'écran d'accueil."}
            </p>
          </div>
          {!unsupported && (
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

      {showHelp && ios && (
        <div className="absolute inset-0 z-50 flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={() => setShowHelp(false)}>
          <div
            className="slide-up w-full max-w-sm space-y-4 rounded-3xl bg-[var(--card)] p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <div className="text-xl font-black text-[var(--fg)]">Installer WakeFit</div>
              <div className="mt-1 text-sm text-[var(--muted)]">
                Dans {IOS_BROWSER_LABEL[ios]} :
              </div>
            </div>
            <ol className="space-y-2.5">
              {IOS_STEPS[ios].map((s) => (
                <li key={s} className="flex items-start gap-3 text-sm font-semibold text-[var(--fg)]">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-xs font-black text-[var(--accent-fg)]">
                    {s[0]}
                  </span>
                  <span className="pt-0.5">{s.slice(2)}</span>
                </li>
              ))}
            </ol>
            <p className="rounded-xl bg-[var(--card2)] px-3 py-2 text-xs font-semibold text-[var(--muted)]">
              iOS 16.4 ou plus récent requis.
            </p>
            <Button onClick={() => setShowHelp(false)}>Compris</Button>
          </div>
        </div>
      )}
    </>
  );
}
