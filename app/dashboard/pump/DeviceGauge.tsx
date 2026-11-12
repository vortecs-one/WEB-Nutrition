// A ring gauge for one device level (battery, reservoir, sensor life...):
// the arc is the fraction left, the icon and value sit in the middle.

import type { LucideIcon } from "lucide-react";

export type GaugeTone = "ok" | "warn" | "bad";

/** Same thresholds as the level bars on the glucose card. */
export function toneForPercent(pct: number): GaugeTone {
  return pct <= 10 ? "bad" : pct <= 25 ? "warn" : "ok";
}

const strokeClass: Record<GaugeTone, string> = {
  ok: "stroke-lime-400",
  warn: "stroke-amber-500",
  bad: "stroke-destructive",
};

const RADIUS = 34;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function DeviceGauge({
  icon: Icon,
  label,
  value,
  unit,
  pct,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  unit: string;
  /** 0-100 fraction of the arc to fill. */
  pct: number;
  tone: GaugeTone;
}) {
  const filled = (Math.max(0, Math.min(100, pct)) / 100) * CIRCUMFERENCE;

  return (
    <div className="flex min-w-0 flex-col items-center gap-2 text-center">
      <div
        role="img"
        aria-label={`${label}: ${value} ${unit}`.trim()}
        className="relative h-24 w-24"
      >
        <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90" aria-hidden="true">
          <circle
            cx="40"
            cy="40"
            r={RADIUS}
            fill="none"
            strokeWidth="6"
            className="stroke-sidebar-foreground/10"
          />
          <circle
            cx="40"
            cy="40"
            r={RADIUS}
            fill="none"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${filled} ${CIRCUMFERENCE}`}
            className={`${strokeClass[tone]} transition-[stroke-dasharray] duration-500 motion-reduce:transition-none`}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <Icon className="h-4 w-4 text-sidebar-foreground/60" aria-hidden="true" />
          <span className="mt-0.5 text-lg font-semibold leading-none tabular-nums">{value}</span>
          {unit && (
            <span className="mt-0.5 text-[11px] leading-none text-sidebar-foreground/60">
              {unit}
            </span>
          )}
        </div>
      </div>
      <span className="text-pretty text-xs font-medium text-sidebar-foreground/70">{label}</span>
    </div>
  );
}
