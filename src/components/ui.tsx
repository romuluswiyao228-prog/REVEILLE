import type { ReactNode } from "react";
import { cn } from "../utils/cn";

const paths: Record<string, ReactNode> = {
  back: <path d="M15 5l-7 7 7 7" />,
  plus: <path d="M12 5v14M5 12h14" />,
  bell: (
    <>
      <path d="M6 9a6 6 0 1112 0c0 5 2 6 2 7H4c0-1 2-2 2-7z" />
      <path d="M10 20a2 2 0 004 0" />
    </>
  ),
  home: <path d="M4 11l8-7 8 7v9a1 1 0 01-1 1h-4v-6h-6v6H5a1 1 0 01-1-1z" />,
  history: (
    <>
      <path d="M4 12a8 8 0 108-8 8 8 0 00-6 2.7L4 9" />
      <path d="M4 4v5h5M12 8v4l3 2" />
    </>
  ),
  chart: <path d="M5 20V10M12 20V4M19 20v-7" />,
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7" />,
  camera: (
    <>
      <path d="M4 8h3l2-3h6l2 3h3a1 1 0 011 1v9a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 118 0v3" />
    </>
  ),
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  crown: <path d="M3 8l4 4 5-7 5 7 4-4-2 11H5z" />,
  play: <path d="M8 5v14l11-7z" />,
  pause: <path d="M8 5v14M16 5v14" />,
  warn: (
    <>
      <path d="M12 3l10 18H2z" />
      <path d="M12 10v5M12 18v.5" />
    </>
  ),
  flame: <path d="M12 2c1 4 6 6 6 12a6 6 0 01-12 0c0-3 2-4 3-7 1 1 2 2 2 3 1-2 1-5 1-8z" />,
  shield: <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />,
  chevron: <path d="M9 6l6 6-6 6" />,
  sound: (
    <>
      <path d="M4 9v6h4l5 4V5L8 9z" />
      <path d="M16 9a4 4 0 010 6" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6L6 18" />,
  download: <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16" />,
};

export function Icon({ name, className, size = 22 }: { name: keyof typeof paths | string; className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("shrink-0", className)}
      aria-hidden
    >
      {paths[name]}
    </svg>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-3xl border border-[var(--line)] bg-[var(--card)] p-4", className)}>{children}</div>;
}

export function Button({
  children,
  onClick,
  variant = "primary",
  className,
  disabled,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost" | "danger" | "soft";
  className?: string;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  const v = {
    primary: "bg-[var(--accent)] text-[var(--accent-fg)]",
    ghost: "border border-[var(--line)] text-[var(--fg)]",
    soft: "bg-[var(--card2)] text-[var(--fg)]",
    danger: "bg-[var(--bad)]/15 text-[var(--bad)]",
  }[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl px-5 text-base font-bold transition active:scale-[0.98] disabled:opacity-40",
        v,
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={cn("relative h-8 w-14 shrink-0 rounded-full transition", on ? "bg-[var(--accent)]" : "bg-[var(--card2)]")}
    >
      <span
        className={cn(
          "absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all",
          on ? "start-7" : "start-1",
        )}
      />
    </button>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string; disabled?: boolean }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1 rounded-2xl bg-[var(--card2)] p-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
          className={cn(
            "min-h-11 flex-1 rounded-xl px-2 text-sm font-semibold transition disabled:opacity-35",
            value === o.value ? "bg-[var(--accent)] text-[var(--accent-fg)] shadow" : "text-[var(--muted)]",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Header({ title, onBack, right }: { title: string; onBack?: () => void; right?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-5 pb-3 pt-[max(1.25rem,env(safe-area-inset-top))]">
      {onBack && (
        <button onClick={onBack} aria-label="back" className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--card)] border border-[var(--line)]">
          <Icon name="back" className="rtl:rotate-180" />
        </button>
      )}
      <h1 className="flex-1 text-2xl font-extrabold tracking-tight">{title}</h1>
      {right}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="px-1 text-xs font-bold uppercase tracking-wider text-[var(--muted)]">{label}</div>
      {children}
    </div>
  );
}

export function ProgressRing({
  value,
  size = 220,
  stroke = 16,
  color = "var(--accent)",
  children,
}: {
  value: number; // 0..1
  size?: number;
  stroke?: number;
  color?: string;
  children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--card2)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(1, Math.max(0, value)))}
          style={{ transition: "stroke-dashoffset 0.4s ease, stroke 0.3s" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}
