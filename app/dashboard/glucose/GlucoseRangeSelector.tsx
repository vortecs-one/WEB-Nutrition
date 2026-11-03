"use client";

// Time-range selector for the glucose chart (3 h / 6 h / 12 h / 24 h): a
// segmented control whose purple thumb slides to the chosen option — the same
// purple as the unit switch in the reading pill and the calculator button.

export default function GlucoseRangeSelector({
  ranges,
  value,
  onChange,
  labels,
  ariaLabel,
}: {
  /** Options in display order, in hours. */
  ranges: readonly number[];
  value: number;
  onChange: (hours: number) => void;
  labels: Record<number, string>;
  ariaLabel: string;
}) {
  const index = Math.max(0, ranges.indexOf(value));

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="relative inline-grid rounded-full bg-sidebar-accent p-1 ring-1 ring-inset ring-sidebar-border"
      style={{ gridTemplateColumns: `repeat(${ranges.length}, minmax(0, 1fr))` }}
    >
      {/* The thumb is one segment wide (the track's inner width split evenly)
          and moves by whole multiples of its own width. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-1 left-1 rounded-full bg-purple-600 shadow-lg shadow-purple-600/30 transition-transform duration-300 ease-out motion-reduce:transition-none"
        style={{
          width: `calc((100% - 0.5rem) / ${ranges.length})`,
          transform: `translateX(${index * 100}%)`,
        }}
      />
      {ranges.map((h) => (
        <button
          key={h}
          type="button"
          onClick={() => onChange(h)}
          aria-pressed={value === h}
          className={`relative z-10 min-h-9 rounded-full px-4 text-xs font-semibold tabular-nums transition-colors sm:px-5 sm:text-sm ${
            value === h
              ? "text-white"
              : "text-sidebar-foreground/60 hover:text-sidebar-foreground"
          }`}
        >
          {labels[h]}
        </button>
      ))}
    </div>
  );
}
