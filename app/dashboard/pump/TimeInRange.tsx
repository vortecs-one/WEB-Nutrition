// Time in range for the period shown on the chart: a donut split into
// below / in range / above the target, with the average glucose underneath.

import type { GlucoseReading, GlucoseSettings, GlucoseUnit } from "@/lib/glucose/types";
import { formatGlucose, unitLabel } from "@/lib/glucose/types";

const RADIUS = 42;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const GAP = 1.5;

type Slice = {
  key: "below" | "inRange" | "above";
  pct: number;
  stroke: string;
  text: string;
  dot: string;
  label: string;
};

export default function TimeInRange({
  readings,
  settings,
  unit,
  labels,
  emptyLabel,
  averageLabel,
}: {
  readings: GlucoseReading[];
  settings: Pick<GlucoseSettings, "targetLow" | "targetHigh">;
  unit: GlucoseUnit;
  labels: { below: string; inRange: string; above: string };
  emptyLabel: string;
  averageLabel: string;
}) {
  const total = readings.length;
  if (total === 0) {
    return <p className="py-6 text-center text-sm text-sidebar-foreground/60">{emptyLabel}</p>;
  }

  let below = 0;
  let above = 0;
  let sum = 0;
  for (const r of readings) {
    sum += r.sgv;
    if (r.sgv < settings.targetLow) below++;
    else if (r.sgv > settings.targetHigh) above++;
  }
  const inRange = total - below - above;
  const average = sum / total;

  // Largest-remainder rounding would be overkill; the in-range share absorbs
  // the rounding so the three always add up to 100.
  const belowPct = Math.round((below / total) * 100);
  const abovePct = Math.round((above / total) * 100);
  const inRangePct = Math.max(0, 100 - belowPct - abovePct);

  const slices: Slice[] = [
    {
      key: "above",
      pct: abovePct,
      stroke: "stroke-amber-500",
      text: "text-amber-500",
      dot: "bg-amber-500",
      label: labels.above,
    },
    {
      key: "inRange",
      pct: inRangePct,
      stroke: "stroke-lime-400",
      text: "text-lime-400",
      dot: "bg-lime-400",
      label: labels.inRange,
    },
    {
      key: "below",
      pct: belowPct,
      stroke: "stroke-destructive",
      text: "text-destructive",
      dot: "bg-destructive",
      label: labels.below,
    },
  ];

  // Arcs start at 12 o'clock and run clockwise: above, in range, below.
  let offset = 0;
  const arcs = slices
    .filter((s) => s.pct > 0)
    .map((s) => {
      const length = Math.max(0, (s.pct / 100) * CIRCUMFERENCE - GAP);
      const arc = { slice: s, length, start: offset };
      offset += (s.pct / 100) * CIRCUMFERENCE;
      return arc;
    });

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:gap-8">
      <div
        role="img"
        aria-label={`${labels.inRange}: ${inRangePct}%`}
        className="relative h-36 w-36 shrink-0"
      >
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden="true">
          <circle
            cx="50"
            cy="50"
            r={RADIUS}
            fill="none"
            strokeWidth="9"
            className="stroke-sidebar-foreground/10"
          />
          {arcs.map(({ slice, length, start }) => (
            <circle
              key={slice.key}
              cx="50"
              cy="50"
              r={RADIUS}
              fill="none"
              strokeWidth="9"
              strokeDasharray={`${length} ${CIRCUMFERENCE}`}
              strokeDashoffset={-start}
              className={slice.stroke}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-semibold leading-none tabular-nums">{inRangePct}</span>
          <span className="mt-1 text-xs text-sidebar-foreground/60">%</span>
        </div>
      </div>

      <dl className="grid w-full flex-1 grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-1">
        {slices.map((s) => (
          <div key={s.key} className="flex items-center gap-3">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${s.dot}`} aria-hidden="true" />
            <div className="min-w-0">
              <dd className="text-base font-semibold leading-tight tabular-nums">{s.pct}%</dd>
              <dt className={`text-xs font-medium leading-tight ${s.text}`}>{s.label}</dt>
            </div>
          </div>
        ))}
        <div className="col-span-2 flex items-center gap-3 border-t border-sidebar-foreground/10 pt-3 sm:col-span-1">
          <span className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <dd className="text-base font-semibold leading-tight tabular-nums">
              {formatGlucose(average, unit)}{" "}
              <span className="text-xs font-normal text-sidebar-foreground/60">
                {unitLabel(unit)}
              </span>
            </dd>
            <dt className="text-xs font-medium leading-tight text-sidebar-foreground/70">
              {averageLabel}
            </dt>
          </div>
        </div>
      </dl>
    </div>
  );
}
