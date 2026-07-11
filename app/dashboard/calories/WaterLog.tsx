"use client";

// Hydration tracker with a "nitro" tachometer look: a 270° dial (same SVG
// mechanics as CalorieGauge) sweeping 0 → 4 L with the redline past the 3 L
// goal, one nitro-bottle icon per completed liter, quick-add buttons and the
// day's entry list. Rendered inside the dashboard's water popup.

import { useMemo } from "react";
import { GlassWater, Milk, Trash2 } from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";
import { useDayLog, WATER_GOAL_ML } from "@/lib/day-log/provider";

// Dial sweeps past the goal so overshooting stays visible (needle clamps here).
const GAUGE_MAX_ML = 4000;

// === NitroBottle — tiny NOS-style bottle icon (no lucide equivalent) ===
// "filled" = completed liter, "ghost" = pending liter slot,
// "mono" = currentColor silhouette for use inside colored buttons.
export function NitroBottle({
  variant = "filled",
  className,
}: {
  variant?: "filled" | "ghost" | "mono";
  className?: string;
}) {
  const bolt = "11.5,10.5 6.8,17.5 9.6,17.5 8.4,24 13.4,16 10.6,16 12.9,10.5";
  return (
    <svg viewBox="0 0 20 30" className={className} aria-hidden="true">
      {variant === "ghost" ? (
        <g fill="none" stroke="currentColor" strokeOpacity={0.3} strokeWidth={1.4}>
          <rect x="6.7" y="1" width="6.6" height="3" rx="1" />
          <rect x="3.7" y="7" width="12.6" height="21.6" rx="5" />
          <polygon points={bolt} strokeWidth={1} />
        </g>
      ) : variant === "mono" ? (
        <g>
          <rect x="6.5" y="0.5" width="7" height="3.2" rx="1" fill="currentColor" />
          <rect x="8.2" y="3.7" width="3.6" height="3.6" fill="currentColor" opacity={0.8} />
          <rect x="3" y="6.8" width="14" height="22.4" rx="5" fill="currentColor" />
          <polygon points={bolt} fill="#0284c7" />
        </g>
      ) : (
        <g>
          <rect x="6.5" y="0.5" width="7" height="3.2" rx="1" fill="#9ee7ff" />
          <rect x="8.2" y="3.7" width="3.6" height="3.6" fill="#67e8f9" />
          <rect x="3" y="6.8" width="14" height="22.4" rx="5" fill="#22d3ee" />
          <polygon points={bolt} fill="#083344" />
        </g>
      )}
    </svg>
  );
}

// === WaterGauge — nitro tachometer (adapted from CalorieGauge's SVG math) ===

const CX = 150;
const CY = 146;
const R = 112; // outer glowing ring

// Dial sweep: fraction 0 → 225° (bottom-left), fraction 1 → -45° (bottom-right).
const START_ANGLE = 225;
const SWEEP = 270;

// Round to a fixed precision so server (Node) and client (browser) serialize
// SVG coordinates identically (avoids React hydration mismatches).
const round = (n: number) => Math.round(n * 1000) / 1000;

function polar(angleDeg: number, radius = R) {
  const a = (angleDeg * Math.PI) / 180;
  return { x: round(CX + radius * Math.cos(a)), y: round(CY - radius * Math.sin(a)) };
}

const fractionToAngle = (f: number) => START_ANGLE - f * SWEEP;

// Clockwise arc path between two dial fractions at a given radius.
function arcPath(f0: number, f1: number, radius: number) {
  const s = polar(fractionToAngle(f0), radius);
  const e = polar(fractionToAngle(f1), radius);
  const largeArc = (f1 - f0) * SWEEP > 180 ? 1 : 0;
  return `M ${s.x} ${s.y} A ${radius} ${radius} 0 ${largeArc} 1 ${e.x} ${e.y}`;
}

const BLUE_CORE = "#3ee6ff";
const RED = "#ef4444";
const RED_CORE = "#ff5252";
const NEEDLE = "#ff3b5c";

function WaterGauge({
  ml,
  goalMl,
  label,
  goalLabel,
  litersUnit,
  locale,
}: {
  ml: number;
  goalMl: number;
  label: string;
  goalLabel: string;
  litersUnit: string;
  locale: string;
}) {
  // Redline starts at the goal: blue arc up to 3 L, red "overdrive" beyond.
  const redStart = goalMl / GAUGE_MAX_ML;

  const blueArc = arcPath(0, redStart, R);
  const redArc = arcPath(redStart, 1, R);
  const redBand = arcPath(redStart + 0.01, 0.99, R - 10);

  // 41 ticks: one every 100 ml, a major every 500 ml.
  const ticks = Array.from({ length: 41 }, (_, i) => {
    const f = i / 40;
    const angle = fractionToAngle(f);
    const major = i % 5 === 0;
    const inRed = f > redStart;
    return {
      major,
      inRed,
      outer: polar(angle, 97),
      inner: polar(angle, major ? 84 : 90),
    };
  });

  // Dial numbers in real liters, every 0.5 L (0, 0.5, … 4).
  const numbers = Array.from({ length: 9 }, (_, i) => {
    const f = i / 8;
    const pos = polar(fractionToAngle(f), 71);
    const liters = (f * GAUGE_MAX_ML) / 1000;
    return {
      pos,
      inRed: f > redStart,
      text: liters.toLocaleString(locale, { maximumFractionDigits: 1 }),
    };
  });

  const fraction = Math.max(0, Math.min(1, ml / GAUGE_MAX_ML));
  const needleAngle = fractionToAngle(fraction);
  const needleInner = polar(needleAngle, 50);
  const needleTip = polar(needleAngle, 93);

  // Goal marker sits on the blue/red boundary (the redline threshold).
  const goalAngle = fractionToAngle(redStart);
  const goalPos = polar(goalAngle, R);
  const goalCap = polar(goalAngle, R + 16);
  const goalCos = Math.cos((goalAngle * Math.PI) / 180);
  const goalAnchor = goalCos < -0.25 ? "end" : goalCos > 0.25 ? "start" : "middle";

  const valueText = (ml / 1000).toLocaleString(locale, {
    maximumFractionDigits: 2,
  });
  const valueSize = valueText.length >= 4 ? 32 : 40;

  return (
    <svg
      viewBox="0 0 300 264"
      className="w-full max-w-sm mx-auto"
      role="img"
      aria-label={`${label}: ${valueText} ${litersUnit}`}
    >
      {/* Outer ring — layered strokes fake the neon glow without filters */}
      {[
        { d: blueArc, c: `rgba(9,192,219,0.15)`, w: 13 },
        { d: blueArc, c: `rgba(9,192,219,0.4)`, w: 7 },
        { d: blueArc, c: BLUE_CORE, w: 3 },
        { d: redArc, c: `rgba(239,68,68,0.2)`, w: 13 },
        { d: redArc, c: `rgba(239,68,68,0.45)`, w: 7 },
        { d: redArc, c: RED_CORE, w: 3 },
      ].map((s, i) => (
        <path
          key={i}
          d={s.d}
          fill="none"
          stroke={s.c}
          strokeWidth={s.w}
          strokeLinecap="round"
        />
      ))}

      {/* Hatched redline band inside the ring */}
      <path
        d={redBand}
        fill="none"
        stroke={RED}
        strokeWidth={7}
        strokeDasharray="3 4"
        opacity={0.85}
      />

      {/* Tick marks */}
      {ticks.map((t, i) => (
        <line
          key={i}
          x1={t.inner.x}
          y1={t.inner.y}
          x2={t.outer.x}
          y2={t.outer.y}
          stroke={
            t.inRed
              ? `rgba(255,120,120,${t.major ? 0.9 : 0.45})`
              : `rgba(158,231,255,${t.major ? 0.9 : 0.45})`
          }
          strokeWidth={t.major ? 2.5 : 1}
        />
      ))}

      {/* Dial numbers (liters) */}
      {numbers.map((n, i) => (
        <text
          key={i}
          x={n.pos.x}
          y={n.pos.y}
          fill={n.inRed ? "#ffb4b4" : "#d7f5ff"}
          fontSize={11}
          fontWeight={600}
          textAnchor="middle"
          dominantBaseline="middle"
        >
          {n.text}
        </text>
      ))}

      {/* Goal marker */}
      <circle
        cx={goalPos.x}
        cy={goalPos.y}
        r={5}
        fill="#e5e7eb"
        stroke="#0f172a"
        strokeWidth={2}
      />
      <text
        x={goalCap.x}
        y={goalCap.y}
        fill="rgba(255,255,255,0.85)"
        fontSize={10}
        fontWeight={600}
        textAnchor={goalAnchor}
        dominantBaseline="middle"
      >
        {goalLabel}
      </text>

      {/* Needle — floats from the center panel edge to the tick scale */}
      {[
        { c: "rgba(255,59,92,0.15)", w: 10 },
        { c: "rgba(255,59,92,0.4)", w: 5 },
        { c: NEEDLE, w: 2.5 },
      ].map((s, i) => (
        <line
          key={i}
          x1={needleInner.x}
          y1={needleInner.y}
          x2={needleTip.x}
          y2={needleTip.y}
          stroke={s.c}
          strokeWidth={s.w}
          strokeLinecap="round"
        />
      ))}

      {/* Center readout: liters drunk today, speedometer style */}
      <text
        x={CX}
        y={CY + 10}
        fill="#ffffff"
        fontSize={valueSize}
        fontWeight={700}
        textAnchor="middle"
      >
        {valueText}
      </text>
      <text
        x={CX}
        y={CY + 32}
        fill={BLUE_CORE}
        fontSize={12}
        fontWeight={600}
        letterSpacing={1}
        textAnchor="middle"
      >
        {litersUnit}
      </text>

      {/* Label in the bottom gap of the dial */}
      <text
        x={CX}
        y={CY + 78}
        fill="rgba(255,255,255,0.7)"
        fontSize={12}
        textAnchor="middle"
      >
        {label}
      </text>
    </svg>
  );
}

// === WaterLog — popup body: gauge + bottles + quick add + entry list ===

const QUICK_ADD_ML = [250, 500, 1000] as const;

export default function WaterLog({ todayKey }: { todayKey: string }) {
  const { dict, locale } = useI18n();
  const t = dict.hydration;

  const { dayData, waterFor, addWater, removeWater } = useDayLog();

  const entries = useMemo(
    () => (todayKey ? dayData(todayKey).water : []),
    [dayData, todayKey],
  );
  const totalMl = todayKey ? waterFor(todayKey) : 0;

  const bottles = Math.floor(totalMl / 1000);
  const goalBottles = Math.ceil(WATER_GOAL_ML / 1000);
  // One slot per goal liter; grows past the goal, capped so the row can't blow up.
  const slots = Math.min(Math.max(bottles, goalBottles), 6);

  const quickAddIcon = (ml: number) =>
    ml === 250 ? (
      <GlassWater className="h-6 w-6" aria-hidden="true" />
    ) : ml === 500 ? (
      <Milk className="h-6 w-6" aria-hidden="true" />
    ) : (
      <NitroBottle variant="mono" className="h-7 w-5" />
    );

  const quickAddLabel = (ml: number) =>
    ml >= 1000
      ? `+1 ${t.liters}`
      : `+${ml} ${t.ml}`;

  return (
    <div className="space-y-4">
      {/* Nitro tachometer */}
      <WaterGauge
        ml={totalMl}
        goalMl={WATER_GOAL_ML}
        label={t.gaugeLabel}
        goalLabel={t.goalLabel}
        litersUnit={t.liters}
        locale={locale}
      />

      {/* Nitro bottles — one per completed liter */}
      <div className="flex items-center justify-center gap-1.5">
        {Array.from({ length: slots }, (_, i) => (
          <NitroBottle
            key={i}
            variant={i < bottles ? "filled" : "ghost"}
            className="h-8 w-[1.35rem]"
          />
        ))}
        <span className="ml-2 text-sm font-semibold tabular-nums">
          × {bottles}
        </span>
        <span className="text-xs text-sidebar-foreground/60">{t.fullLiters}</span>
      </div>

      {/* Quick add */}
      <div className="grid grid-cols-3 gap-2">
        {QUICK_ADD_ML.map((ml) => (
          <button
            key={ml}
            type="button"
            onClick={() => addWater(todayKey, ml)}
            className="flex flex-col items-center gap-1.5 rounded-2xl bg-sidebar-accent p-3 hover:bg-sidebar-accent/80 active:scale-[0.97] transition"
          >
            {quickAddIcon(ml)}
            <span className="text-sm font-semibold tabular-nums">
              {quickAddLabel(ml)}
            </span>
          </button>
        ))}
      </div>

      {/* Today's entries (newest first) — deleting the top one is the undo */}
      {entries.length === 0 ? (
        <p className="text-center text-sm text-sidebar-foreground/60">
          {t.noEntries}
        </p>
      ) : (
        <div>
          <div className="mb-1 text-xs font-medium text-sidebar-foreground/70">
            {t.todayEntries}
          </div>
          <ul className="divide-y divide-sidebar-foreground/10">
            {entries.map((w) => (
              <li key={w.id} className="flex items-center justify-between gap-3 py-2">
                <span className="flex items-center gap-2 text-sm font-medium tabular-nums">
                  <GlassWater
                    className="h-4 w-4 text-sidebar-foreground/60"
                    aria-hidden="true"
                  />
                  {w.amountMl >= 1000
                    ? `${(w.amountMl / 1000).toLocaleString(locale, { maximumFractionDigits: 2 })} ${t.liters}`
                    : `${w.amountMl} ${t.ml}`}
                </span>
                <button
                  type="button"
                  onClick={() => removeWater(todayKey, w.id)}
                  // Optimistic rows (negative ids) reconcile in a moment; a
                  // delete against them would no-op on the server and resurrect.
                  disabled={w.id < 0}
                  aria-label={dict.common.delete}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-sidebar-foreground/60 hover:bg-destructive/10 hover:text-destructive active:scale-95 transition disabled:opacity-40"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
