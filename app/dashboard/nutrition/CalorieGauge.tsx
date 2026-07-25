"use client";

// Tachometer-style calorie-balance gauge (car dashboard look).
// 270° dial: left end = -range (deficit), right end = +range (surplus).
// Neon-glow ring with a "redline" zone at the surplus extreme, red needle,
// and the big value centered like a digital speedometer.
// Pure SVG so it scales crisply and needs no chart dependency.

import { Flame, Salad } from "lucide-react";

type Props = {
  /** Signed balance the needle points at and the center shows: consumed - burned.
   *  Negative = deficit (left), positive = surplus (right). */
  value: number;
  /** Symmetric range of the dial, e.g. 800 means -800..+800. */
  range: number;
  /** Spacing between numbered divisions, e.g. 200 for -1000..1000 by 200s.
   *  Must evenly divide 2*range. */
  step: number;
  /** Optional goal marker value (e.g. target deficit). */
  goal?: number;
  /** Big centered label above the number. */
  label: string;
  /** Optional small "Goal" caption rendered near the marker. */
  goalLabel?: string;
  /** Optional total calories consumed today — draws a green salad badge on the
   *  surplus (right) side at +consumed. Hidden when 0. */
  consumed?: number;
  /** Optional total calories burned today — draws a red flame badge on the
   *  deficit (left) side at -burned. Hidden when 0. */
  burned?: number;
  /** Hide the visible label in the dial's bottom gap (still used for aria). */
  hideLabel?: boolean;
};

const CX = 150;
const CY = 146;
const R = 112; // outer glowing ring

// Dial sweep: fraction 0 → 225° (bottom-left), fraction 1 → -45° (bottom-right).
const START_ANGLE = 225;
const SWEEP = 270;
// Last 20% of the dial is the "redline" zone.
const RED_START = 0.8;

// Round to a fixed precision so server (Node) and client (browser) serialize
// SVG coordinates identically. Math.cos/Math.sin may differ in the last bit
// across JS engines, which otherwise causes React hydration mismatches.
const round = (n: number) => Math.round(n * 1000) / 1000;

// Convert a math angle (0 deg = right, 90 = up, 180 = left) into an
// SVG point, flipping y because screen coordinates grow downward.
function polar(angleDeg: number, radius = R) {
  const a = (angleDeg * Math.PI) / 180;
  return { x: round(CX + radius * Math.cos(a)), y: round(CY - radius * Math.sin(a)) };
}

const fractionToAngle = (f: number) => START_ANGLE - f * SWEEP;

// Map a clamped value in [-range, range] to a dial angle.
function valueToAngle(value: number, range: number) {
  const clamped = Math.max(-range, Math.min(range, value));
  return fractionToAngle((clamped + range) / (2 * range));
}

// Clockwise arc path between two dial fractions at a given radius.
function arcPath(f0: number, f1: number, radius: number) {
  const s = polar(fractionToAngle(f0), radius);
  const e = polar(fractionToAngle(f1), radius);
  const largeArc = (f1 - f0) * SWEEP > 180 ? 1 : 0;
  return `M ${s.x} ${s.y} A ${radius} ${radius} 0 ${largeArc} 1 ${e.x} ${e.y}`;
}

// Meter (dial track) palette: purple on the deficit side, yellow "redline" at
// the surplus extreme. The *_GLOW values are rgb triplets for the soft,
// low-opacity outer strokes that fake the neon glow.
const PURPLE_CORE = "#c084fc";
const PURPLE_GLOW = "168,85,247";
const YELLOW_CORE = "#fde047";
const YELLOW_GLOW = "250,204,21";
const YELLOW = "#facc15"; // hatched redline band
const RED = "#ef4444"; // burned-flame badge — matches its dashboard card (kept)
const NEEDLE = "#fde047"; // yellow pointer + center hub ring
const LIME = "#84cc16"; // salad badge — matches the consumed card's bg-lime-500

export default function CalorieGauge({
  value,
  range,
  step,
  goal,
  consumed,
  burned,
  label,
  goalLabel,
  hideLabel,
}: Props) {
  const blueArc = arcPath(0, RED_START, R);
  const redArc = arcPath(RED_START, 1, R);
  // Dashed band just inside the ring — the hatched "redline" strip.
  const redBand = arcPath(RED_START + 0.01, 0.99, R - 10);

  // One major division (numbered) per `step`, 4 minor ticks between each.
  const majorDivisions = (2 * range) / step;

  const ticks = Array.from({ length: majorDivisions * 5 + 1 }, (_, i) => {
    const f = i / (majorDivisions * 5);
    const angle = fractionToAngle(f);
    const major = i % 5 === 0;
    const inRed = f > RED_START;
    return {
      major,
      inRed,
      outer: polar(angle, 97),
      inner: polar(angle, major ? 84 : 90),
    };
  });

  // Dial numbers show the real net-kcal at each division (…, -step, 0, step, …).
  const numbers = Array.from({ length: majorDivisions + 1 }, (_, i) => {
    const f = i / majorDivisions;
    const pos = polar(fractionToAngle(f), 71);
    return {
      pos,
      inRed: f > RED_START,
      text: String(Math.round(-range + f * 2 * range)),
    };
  });

  const needleAngle = valueToAngle(value, range);
  const needleInner = polar(needleAngle, 50);
  const needleTip = polar(needleAngle, 90);

  // Goal/Meta badge is pinned to the purple↔yellow boundary (RED_START) — it
  // marks where the dial enters the yellow "redline" zone, not the raw `goal`
  // value. Still gated on `goal` so a caller can omit the marker entirely.
  const goalAngle = goal != null ? fractionToAngle(RED_START) : null;
  // Badge centered on the glowing ring — its center rides the meter line (R),
  // so the r=12 circle straddles the arc evenly.
  const goalBadge = goalAngle != null ? polar(goalAngle, R) : null;

  // Contribution badges sit on the meter line too (radius R, centered on the
  // ring, aligned with the goal badge): consumed pushes the balance right
  // (+consumed), burned pushes it left (-burned), mirroring the signed card
  // labels. Hidden at 0 so a fresh day doesn't stack both at center.
  const consumedBadge =
    consumed && consumed > 0 ? polar(valueToAngle(consumed, range), R) : null;
  const burnedBadge =
    burned && burned > 0 ? polar(valueToAngle(-burned, range), R) : null;

  // Shown signed: + for a surplus, - for a deficit.
  const valueText = `${value > 0 ? "+" : ""}${value}`;
  const valueSize = valueText.length >= 4 ? 19 : 23;

  return (
    <svg
      viewBox="28 22 244 242"
      className="w-full max-w-md mx-auto"
      role="img"
      aria-label={`${label}: ${value}`}
    >
      {/* Outer ring — layered strokes fake the neon glow without filters */}
      {[
        { d: blueArc, c: `rgba(${PURPLE_GLOW},0.15)`, w: 13 },
        { d: blueArc, c: `rgba(${PURPLE_GLOW},0.4)`, w: 7 },
        { d: blueArc, c: PURPLE_CORE, w: 3 },
        { d: redArc, c: `rgba(${YELLOW_GLOW},0.2)`, w: 13 },
        { d: redArc, c: `rgba(${YELLOW_GLOW},0.45)`, w: 7 },
        { d: redArc, c: YELLOW_CORE, w: 3 },
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
        stroke={YELLOW}
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
              ? `rgba(253,224,71,${t.major ? 0.9 : 0.45})`
              : `rgba(216,180,254,${t.major ? 0.9 : 0.45})`
          }
          strokeWidth={t.major ? 2.5 : 1}
        />
      ))}

      {/* Dial numbers (value ÷ 100) */}
      {numbers.map((n, i) => (
        <text
          key={i}
          x={n.pos.x}
          y={n.pos.y}
          fill={n.inRed ? "#fef08a" : "#e9d5ff"}
          fontSize={11}
          fontWeight={600}
          textAnchor="middle"
          dominantBaseline="middle"
        >
          {n.text}
        </text>
      ))}

      {/* Burned contribution — red flame badge on the deficit (left) side */}
      {burnedBadge && (
        <>
          <circle
            cx={burnedBadge.x}
            cy={burnedBadge.y}
            r={11}
            fill={RED}
            stroke="#0f172a"
            strokeWidth={2}
          />
          {/* y offset is size/2 + 1: the extra 1 raises the bottom-heavy flame
              (mass in the bulb, thin tip up) so it reads optically centered. */}
          <Flame
            x={burnedBadge.x - 8}
            y={burnedBadge.y - 9}
            size={16}
            color="#ffffff"
            strokeWidth={2.2}
            aria-hidden="true"
          />
        </>
      )}

      {/* Consumed contribution — green salad badge on the surplus (right) side */}
      {consumedBadge && (
        <>
          <circle
            cx={consumedBadge.x}
            cy={consumedBadge.y}
            r={11}
            fill={LIME}
            stroke="#0f172a"
            strokeWidth={2}
          />
          {/* Same optical raise as the flame (size/2 + 1) — the bowl is heavy,
              the leaves are light, so geometric-center reads slightly low. */}
          <Salad
            x={consumedBadge.x - 8}
            y={consumedBadge.y - 9}
            size={16}
            color="#ffffff"
            strokeWidth={2.2}
            aria-hidden="true"
          />
        </>
      )}

      {/* Goal marker — badge floating on the rim, label inside it */}
      {goalBadge && (
        <>
          <circle
            cx={goalBadge.x}
            cy={goalBadge.y}
            r={11}
            fill="#e5e7eb"
            stroke="#0f172a"
            strokeWidth={2}
          />
          <text
            x={goalBadge.x}
            y={goalBadge.y}
            fill="#0f172a"
            fontSize={8}
            fontWeight={700}
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {goalLabel}
          </text>
        </>
      )}

      {/* Needle — floats from the center panel edge to the tick scale */}
      {[
        { c: `rgba(${YELLOW_GLOW},0.15)`, w: 10 },
        { c: `rgba(${YELLOW_GLOW},0.4)`, w: 5 },
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

      {/* Soft gray hub behind the center readout + warning label, sized to
          fit the longest localized label ("Superávit calórico" / "Calorie surplus").
          Its border gets the same layered-stroke neon glow as the outer ring. */}
      <circle cx={CX} cy={CY} r={46} fill="#9ca3af" fillOpacity={0.14} />
      {[
        { c: `rgba(${YELLOW_GLOW},0.15)`, w: 10 },
        { c: `rgba(${YELLOW_GLOW},0.4)`, w: 5 },
        { c: NEEDLE, w: 2 },
      ].map((s, i) => (
        <circle
          key={`hub-${i}`}
          cx={CX}
          cy={CY}
          r={46}
          fill="none"
          stroke={s.c}
          strokeWidth={s.w}
        />
      ))}

      {/* Status label just below the readout — white, centered on CX. */}
      {label && (
        <text
          x={CX}
          y={CY + 17}
          fill="#ffffff"
          fontSize={8}
          fontWeight={700}
          textAnchor="middle"
        >
          {label}
        </text>
      )}

      {/* Center readout: big value with the "kcal" unit to its right. Both live
          in one <text> so textAnchor="middle" centers the pair as a unit. */}
      <text x={CX} y={CY + 1} fill="#ffffff" textAnchor="middle">
        <tspan fontSize={valueSize} fontWeight={700}>
          {valueText}
        </tspan>
        <tspan fontSize={9} fontWeight={700} dx={5} letterSpacing={1}>
          kcal
        </tspan>
      </text>

      {/* Deficit/surplus label in the bottom gap of the dial */}
      {!hideLabel && (
        <text
          x={CX}
          y={CY + 78}
          fill="rgba(255,255,255,0.7)"
          fontSize={12}
          textAnchor="middle"
        >
          {label}
        </text>
      )}
    </svg>
  );
}
