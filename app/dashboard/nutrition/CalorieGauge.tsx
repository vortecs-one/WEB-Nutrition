"use client";

// Tachometer-style calorie-balance gauge (car dashboard look).
// 270° dial: left end = -range (deficit), right end = +range (surplus).
// Neon-glow ring with a "redline" zone at the surplus extreme, red needle,
// and the big value centered like a digital speedometer.
// Pure SVG so it scales crisply and needs no chart dependency.

type Props = {
  /** Signed balance the needle points at and the center shows: consumed - burned.
   *  Negative = deficit (left), positive = surplus (right). */
  value: number;
  /** Symmetric range of the dial, e.g. 800 means -800..+800. */
  range: number;
  /** Optional goal marker value (e.g. target deficit). */
  goal?: number;
  /** Big centered label above the number. */
  label: string;
  /** Optional small "Goal" caption rendered near the marker. */
  goalLabel?: string;
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

const BLUE_CORE = "#3ee6ff";
const RED = "#ef4444";
const RED_CORE = "#ff5252";
const NEEDLE = "#ff3b5c";

export default function CalorieGauge({
  value,
  range,
  goal,
  label,
  goalLabel,
  hideLabel,
}: Props) {
  const blueArc = arcPath(0, RED_START, R);
  const redArc = arcPath(RED_START, 1, R);
  // Dashed band just inside the ring — the hatched "redline" strip.
  const redBand = arcPath(RED_START + 0.01, 0.99, R - 10);

  // 51 ticks: a major every 5th (each numbered division), 4 minors between.
  const ticks = Array.from({ length: 51 }, (_, i) => {
    const f = i / 50;
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

  // Dial numbers show the real net-kcal at each division (…, -200, 0, 200, …).
  const numbers = Array.from({ length: 11 }, (_, i) => {
    const f = i / 10;
    const pos = polar(fractionToAngle(f), 71);
    return {
      pos,
      inRed: f > RED_START,
      text: String(Math.round(-range + f * 2 * range)),
    };
  });

  const needleAngle = valueToAngle(value, range);
  const needleInner = polar(needleAngle, 50);
  const needleTip = polar(needleAngle, 93);

  const goalAngle = goal != null ? valueToAngle(goal, range) : null;
  // Badge floats just outside the glowing ring, label centered inside it.
  const goalBadge = goalAngle != null ? polar(goalAngle, R + 8) : null;

  // Shown signed: + for a surplus, - for a deficit.
  const valueText = `${value > 0 ? "+" : ""}${value}`;
  const valueSize = valueText.length >= 4 ? 32 : 40;

  return (
    <svg
      viewBox="28 0 244 264"
      className="w-full max-w-md mx-auto"
      role="img"
      aria-label={`${label}: ${value}`}
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

      {/* Dial numbers (value ÷ 100) */}
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

      {/* Goal marker — badge floating on the rim, label inside it */}
      {goalBadge && (
        <>
          <circle
            cx={goalBadge.x}
            cy={goalBadge.y}
            r={14}
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

      {/* Center readout: big value + unit, speedometer style */}
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
        kcal
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
