"use client";

// Semicircular calorie-balance gauge (speedometer style).
// Left = surplus (red), center = 0, right = deficit (green).
// Pure SVG so it scales crisply and needs no chart dependency.

type Props = {
  /** Net value to point at: burned - consumed. Positive = deficit. */
  value: number;
  /** Symmetric range of the dial, e.g. 800 means -800..+800. */
  range: number;
  /** Optional goal marker value (e.g. target deficit). */
  goal?: number;
  /** Big centered label above the number. */
  label: string;
  /** Optional small "Goal" caption rendered near the marker. */
  goalLabel?: string;
};

const CX = 150;
const CY = 128;
const R = 112;

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

// Map a clamped value in [-range, range] to an angle in [180, 0].
function valueToAngle(value: number, range: number) {
  const clamped = Math.max(-range, Math.min(range, value));
  const fraction = (clamped + range) / (2 * range); // 0..1
  return 180 - fraction * 180; // 180 (left) .. 0 (right)
}

export default function CalorieGauge({
  value,
  range,
  goal,
  label,
  goalLabel,
}: Props) {
  const start = polar(180);
  const end = polar(0);

  // Tick marks every step degrees along the arc.
  const ticks = Array.from({ length: 41 }, (_, i) => {
    const angle = 180 - (i / 40) * 180;
    const major = i % 5 === 0;
    const outer = polar(angle, R + 2);
    const inner = polar(angle, major ? R - 14 : R - 8);
    return { angle, major, outer, inner };
  });

  const needleAngle = valueToAngle(value, range);
  const needleTip = polar(needleAngle, R - 18);

  const goalAngle = goal != null ? valueToAngle(goal, range) : null;
  // The dot sits on the arc edge; the label sits clearly outside the arc.
  const goalPos   = goalAngle != null ? polar(goalAngle, R + 6)  : null;
  // Place label further out and offset it slightly along the arc direction
  // so it clears the dot and the outer tick marks.
  const goalCap   = goalAngle != null ? polar(goalAngle, R + 26) : null;
  // Anchor the text to whichever side of the dial the goal marker is on.
  const goalAnchor =
    goalAngle != null
      ? goalAngle > 90
        ? "end"
        : goalAngle < 90
        ? "start"
        : "middle"
      : "middle";

  return (
    <svg
      viewBox="0 0 300 195"
      className="w-full max-w-sm mx-auto"
      role="img"
      aria-label={`${label}: ${value}`}
    >
      <defs>
        {/*
          Left side = surplus (consumed > burned) → teal/green from the brand palette.
          Right side = deficit (burned > consumed)  → amber/red from the brand palette.
          Matches the stat cards: Consumed (teal) left, Burned (amber→red) right.
        */}
        <linearGradient id="gaugeArc" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="#09c0db" />
          <stop offset="40%"  stopColor="#22c55e" />
          <stop offset="60%"  stopColor="#ffbe00" />
          <stop offset="80%"  stopColor="#ff9700" />
          <stop offset="100%" stopColor="#ef4444" />
        </linearGradient>
      </defs>

      {/* Colored arc */}
      <path
        d={`M ${start.x} ${start.y} A ${R} ${R} 0 0 1 ${end.x} ${end.y}`}
        fill="none"
        stroke="url(#gaugeArc)"
        strokeWidth={14}
        strokeLinecap="round"
      />

      {/* Tick marks */}
      {ticks.map((t, i) => (
        <line
          key={i}
          x1={t.inner.x}
          y1={t.inner.y}
          x2={t.outer.x}
          y2={t.outer.y}
          stroke="rgba(255,255,255,0.35)"
          strokeWidth={t.major ? 2 : 1}
        />
      ))}

      {/* Scale labels at -range, -range/2, 0, +range/2, +range */}
      {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
        const angle = 180 - fraction * 180;
        const pos = polar(angle, R - 26);
        const val = Math.round(-range + fraction * 2 * range);
        return (
          <text
            key={fraction}
            x={pos.x}
            y={pos.y}
            fill="rgba(255,255,255,0.55)"
            fontSize={9}
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {val === 0 ? "0" : val > 0 ? `+${val}` : val}
          </text>
        );
      })}

      {/* Goal marker */}
      {goalPos && goalCap && (
        <>
          <circle
            cx={goalPos.x}
            cy={goalPos.y}
            r={7}
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
        </>
      )}

      {/* Needle */}
      <line
        x1={CX}
        y1={CY}
        x2={needleTip.x}
        y2={needleTip.y}
        stroke="#ffffff"
        strokeWidth={4}
        strokeLinecap="round"
      />
      <circle cx={CX} cy={CY} r={6} fill="#ffffff" />

      {/* Label + value, placed below the pivot so the needle never overlaps */}
      <text
        x={CX}
        y={CY + 24}
        fill="rgba(255,255,255,0.7)"
        fontSize={13}
        textAnchor="middle"
      >
        {label}
      </text>
      <text
        x={CX}
        y={CY + 58}
        fill="#ffffff"
        fontSize={40}
        fontWeight={700}
        textAnchor="middle"
      >
        {Math.abs(value)}
      </text>
    </svg>
  );
}
