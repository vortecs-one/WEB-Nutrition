"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { Maximize2 } from "lucide-react";
import { Cell, Label, Pie, PieChart } from "recharts";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Modal } from "@/components/ui/modal";
import { useI18n } from "@/lib/i18n/provider";
import { useDayLog } from "@/lib/day-log/provider";

// Light-gray palette for this card. All descendants are styled with the
// `sidebar-*` tokens, so overriding the CSS variables in one place recolors
// the background, every text opacity, borders, hover states and the donut
// center label at once — no per-element class changes needed.
const LIGHT_GRAY_CARD: CSSProperties = {
  "--sidebar": "#c8c9c7",
  "--sidebar-foreground": "#1f2937",
  "--sidebar-accent": "#d1d5db",
  "--foreground": "#1f2937",
  "--muted-foreground": "#6b7280",
} as CSSProperties;

// Restores the app's dark palette for the detail modal, which lives inside
// this card in the DOM and would otherwise inherit the light-gray override.
const DARK_MODAL_RESET: CSSProperties = {
  "--sidebar": "#121419",
  "--sidebar-foreground": "#f5f6f7",
  "--sidebar-accent": "#24272e",
  "--foreground": "#f5f6f7",
  "--muted-foreground": "#a2a6b0",
} as CSSProperties;

// Accepts an ISO date key so the Calories view can drive it by the
// date selected in the navigator. If no dateKey is supplied it falls
// back to today's date.
export default function NutritionChart({ dateKey }: { dateKey: string }) {
  const { dict } = useI18n();
  const t = dict.nutritionUser;
  const { dayData } = useDayLog();
  const [showDetail, setShowDetail] = useState(false);

  const { meals, activities, supplements } = useMemo(
    () => dayData(dateKey),
    [dayData, dateKey],
  );

  // Nutrient totals — summed from logged meals.
  const nutrientTotals = useMemo(() => {
    const sum = (key: keyof (typeof meals)[number]) => {
      let any = false;
      let total = 0;
      for (const m of meals) {
        const v = m[key];
        if (typeof v === "number") { any = true; total += v; }
      }
      return any ? Math.round(total) : null;
    };
    const totalCalories = meals.length > 0
      ? Math.round(meals.reduce((s, m) => s + m.calories, 0))
      : null;
    const totalBurned = activities.length > 0
      ? Math.round(activities.reduce((s, a) => s + a.calories, 0))
      : null;
    return {
      calories: totalCalories,
      burned: totalBurned,
      protein: sum("protein"),
      carbs: sum("carbs"),
      fat: sum("fat"),
      saturatedFat: sum("saturatedFat"),
      sugars: sum("sugars"),
      fiber: sum("fiber"),
      sodium: sum("sodium"),
    };
  }, [meals, activities]);

  // Nutrients without a natural "share of composition" %, shown against
  // standard 2000-kcal-diet daily value reference amounts instead.
  // Total sugars has no official daily value, so it's shown gram-only.
  const extraNutrients = useMemo(() => {
    const DAILY_VALUE = { saturatedFat: 20, fiber: 28, sodium: 2300 };
    const rows: { key: string; label: string; value: number; unit: string; pct: number | null }[] = [];
    if (nutrientTotals.saturatedFat != null) {
      rows.push({ key: "saturatedFat", label: t.satFat, value: nutrientTotals.saturatedFat, unit: t.unitG, pct: Math.round((nutrientTotals.saturatedFat / DAILY_VALUE.saturatedFat) * 100) });
    }
    if (nutrientTotals.sugars != null) {
      rows.push({ key: "sugars", label: t.sugars, value: nutrientTotals.sugars, unit: t.unitG, pct: null });
    }
    if (nutrientTotals.fiber != null) {
      rows.push({ key: "fiber", label: t.fiber, value: nutrientTotals.fiber, unit: t.unitG, pct: Math.round((nutrientTotals.fiber / DAILY_VALUE.fiber) * 100) });
    }
    if (nutrientTotals.sodium != null) {
      rows.push({ key: "sodium", label: t.sodium, value: nutrientTotals.sodium, unit: t.unitMg, pct: Math.round((nutrientTotals.sodium / DAILY_VALUE.sodium) * 100) });
    }
    return rows;
  }, [nutrientTotals, t]);

  const data = useMemo(() => {
    const protein = meals.reduce((s, m) => s + (m.protein ?? 0), 0);
    const carbs = meals.reduce((s, m) => s + (m.carbs ?? 0), 0);
    const fat = meals.reduce((s, m) => s + (m.fat ?? 0), 0);

    const countSupp = (type: string) =>
      supplements.filter((s) => s.type === type).length;
    const vitamins = countSupp("vitamin");
    const creatine = countSupp("creatine");
    const omega3 = countSupp("omega3");
    const otherSupp = countSupp("protein") + countSupp("other");

    return [
      { key: "carbs",     label: t.macroCarbs,      value: carbs,     fill: "var(--color-carbs)" },
      { key: "protein",   label: t.macroProtein,   value: protein,   fill: "var(--color-protein)" },
      { key: "fat",       label: t.macroFat,        value: fat,       fill: "var(--color-fat)" },
      { key: "vitamin",   label: t.chartVitamin,    value: vitamins,  fill: "var(--color-vitamin)" },
      { key: "creatine",  label: t.chartCreatine,   value: creatine,  fill: "var(--color-creatine)" },
      { key: "omega3",    label: t.chartOmega,      value: omega3,    fill: "var(--color-omega3)" },
      { key: "otherSupp", label: t.chartOtherSupp,  value: otherSupp, fill: "var(--color-otherSupp)" },
    ].filter((d) => d.value > 0);
  }, [meals, supplements, t]);

  const total = useMemo(() => data.reduce((s, d) => s + d.value, 0), [data]);

  const top = useMemo(
    () =>
      data.reduce(
        (best, d) => (d.value > best.value ? d : best),
        data[0] ?? { label: "", value: 0 },
      ),
    [data],
  );
  const topPct = total > 0 ? Math.round((top.value / total) * 100) : 0;

  const chartConfig = {
    protein:   { label: t.macroProtein,  color: "var(--chart-1)" },
    carbs:     { label: t.macroCarbs,    color: "var(--chart-2)" },
    fat:       { label: t.macroFat,      color: "var(--chart-3)" },
    vitamin:   { label: t.chartVitamin,  color: "var(--chart-4)" },
    creatine:  { label: t.chartCreatine, color: "var(--chart-5)" },
    omega3:    { label: t.chartOmega,    color: "var(--chart-6)" },
    otherSupp: { label: t.chartOtherSupp,color: "var(--chart-7)" },
  } satisfies ChartConfig;

  // Map each chart key to its CSS variable color so we can draw dot swatches
  const colorMap: Record<string, string> = {
    protein:   "var(--chart-1)",
    carbs:     "var(--chart-2)",
    fat:       "var(--chart-3)",
    vitamin:   "var(--chart-4)",
    creatine:  "var(--chart-5)",
    omega3:    "var(--chart-6)",
    otherSupp: "var(--chart-7)",
  };

  const hasData = total > 0 || extraNutrients.length > 0;

  // Donut chart, reused at two sizes (compact card vs. detail popup) — only
  // the container's size classes differ, the chart itself is identical.
  const renderDonut = (containerClassName: string) => (
    <ChartContainer config={chartConfig} className={containerClassName}>
      <PieChart>
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              nameKey="key"
              formatter={(value, name) => {
                const pct = Math.round((Number(value) / total) * 100);
                const label =
                  chartConfig[name as keyof typeof chartConfig]?.label ??
                  name;
                return `${label}: ${pct}%`;
              }}
            />
          }
        />
        <Pie
          data={data}
          dataKey="value"
          nameKey="key"
          innerRadius="56%"
          outerRadius="82%"
          paddingAngle={2}
          strokeWidth={0}
          isAnimationActive={false}
        >
          {data.map((d) => (
            <Cell key={d.key} fill={d.fill} />
          ))}
          <Label
            content={({ viewBox }) => {
              if (!viewBox || !("cx" in viewBox)) return null;
              const { cx, cy } = viewBox as { cx: number; cy: number };
              return (
                <text x={cx} y={cy} textAnchor="middle">
                  <tspan
                    x={cx}
                    y={cy - 4}
                    className="fill-foreground text-xl sm:text-2xl font-bold"
                  >
                    {topPct}%
                  </tspan>
                  <tspan
                    x={cx}
                    y={cy + 13}
                    className="fill-muted-foreground text-[9px] sm:text-[11px]"
                  >
                    {top.label}
                  </tspan>
                </text>
              );
            }}
          />
        </Pie>
      </PieChart>
    </ChartContainer>
  );

  // Calorie summary rows — identical in the card and the detail popup.
  const calorieRows = (
    <>
      {nutrientTotals.calories != null && (
        <li className="flex items-center gap-2 text-[11px] sm:text-sm mb-0.5">
          <span className="min-w-0 flex-1 truncate font-semibold text-sidebar-foreground">
            {t.caloriesConsumed}
          </span>
          <span className="shrink-0 tabular-nums font-bold text-sidebar-foreground">
            {nutrientTotals.calories} {t.kcal}
          </span>
        </li>
      )}
      {nutrientTotals.burned != null && (
        <li className="flex items-center gap-2 text-[11px] sm:text-sm">
          <span className="min-w-0 flex-1 truncate font-semibold text-sidebar-foreground">
            {t.caloriesBurned}
          </span>
          <span className="shrink-0 tabular-nums font-bold" style={{ color: "var(--chart-3)" }}>
            -{nutrientTotals.burned} {t.kcal}
          </span>
        </li>
      )}
      {(nutrientTotals.calories != null || nutrientTotals.burned != null) && data.length > 0 && (
        <li role="separator" className="my-0.5 border-t border-sidebar-foreground/10" />
      )}
    </>
  );

  // Macro row — dashboard card shows percentage only; detail popup adds grams.
  const renderMacroRow = (d: (typeof data)[number], detailed: boolean) => {
    const pct = Math.round((d.value / total) * 100);
    const grams =
      d.key === "protein" ? nutrientTotals.protein :
      d.key === "carbs"   ? nutrientTotals.carbs :
      d.key === "fat"     ? nutrientTotals.fat :
      null;
    return (
      <li key={d.key} className="flex items-center gap-2 text-[11px] sm:text-sm">
        <span className="min-w-0 flex-1 truncate text-sidebar-foreground/70">
          {d.label}
        </span>
        {detailed && grams != null && (
          <span className="shrink-0 tabular-nums text-sidebar-foreground/50 text-[11px]">
            {grams}{t.unitG}
          </span>
        )}
        <span className="shrink-0 font-bold tabular-nums w-10 text-right" style={{ color: colorMap[d.key] ?? "inherit" }}>
          {pct}%
        </span>
      </li>
    );
  };

  // Extra-nutrient row — percentage only on the card, except sugars (no daily
  // value defined, so no percentage) which keeps its gram value there instead.
  const renderExtraRow = (n: (typeof extraNutrients)[number], detailed: boolean) => (
    <li key={n.key} className="flex items-center gap-2 text-[11px] sm:text-sm">
      <span className="min-w-0 flex-1 truncate text-sidebar-foreground/70">
        {n.label}
      </span>
      {(detailed || n.pct == null) && (
        <span className="shrink-0 tabular-nums text-sidebar-foreground/50 text-[11px]">
          {n.value}{n.unit}
        </span>
      )}
      <span className="shrink-0 font-semibold tabular-nums w-10 text-right text-sidebar-foreground/70">
        {n.pct != null ? `${n.pct}%` : ""}
      </span>
    </li>
  );

  // Shared title typography. Alignment/width differ per placement: left on the
  // mobile header row, centered for the desktop stack and the empty state.
  const titleClasses =
    "text-xs font-semibold tracking-wide text-sidebar-foreground " +
    "uppercase whitespace-nowrap";

  return (
    <section
      style={LIGHT_GRAY_CARD}
      className="h-full bg-sidebar text-sidebar-foreground rounded-3xl shadow-sm px-4 py-3 md:p-5 flex flex-col gap-2 md:gap-3"
    >
      {/* Header — on mobile the title sits on the left of this row; on desktop
          only the expand icon shows here (the title lives in the stack below).
          ml-auto keeps the icon right in both cases. */}
      {hasData && (
        <div className="flex items-center">
          <h2 className={`md:hidden ${titleClasses}`}>{t.composition}</h2>
          <button
            type="button"
            onClick={() => setShowDetail(true)}
            aria-label={t.viewDetails}
            className="ml-auto -mr-1 flex h-8 w-8 items-center justify-center rounded-full hover:bg-sidebar-accent active:scale-95 transition"
          >
            <Maximize2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {!hasData ? (
        <>
          <h2 className={`w-full text-center ${titleClasses}`}>{t.composition}</h2>
          <p className="py-6 text-center text-sm text-sidebar-foreground/50">
            {t.noComposition}
          </p>
        </>
      ) : (
        // @container on this wrapper (not the section) so the modal below —
        // which is position:fixed — isn't captured by container-type.
        // Mobile: donut (left) + macro list (right); the title is up in the
        // header row. Desktop (md+): vertical stack — donut, title, list.
        <div className="@container">
          <div className="flex flex-row items-center gap-4 md:flex-col md:gap-3">
            {/* Donut chart — left half on mobile (flex-1, squared, so it grows
                with the card), fixed size on the desktop stack. */}
            {total > 0 && renderDonut("aspect-square min-w-0 flex-1 md:h-36 md:w-36 md:flex-none")}

            {/* Desktop title — between donut and list; hidden below md */}
            <h2 className={`hidden md:block w-full text-center ${titleClasses}`}>{t.composition}</h2>

            {/* Macro rows — with color dot swatches. Dashboard card: percentage only.
                Consumed/burned totals (calorieRows) are shown only in the detail
                popup, not on the compact card. On mobile this fills the space to
                the right of the donut; on desktop it spans the full width. */}
            <ul className="flex min-w-0 flex-1 flex-col gap-1 sm:gap-1.5 md:w-full md:flex-none">
              {data.map((d) => renderMacroRow(d, false))}

              {/* Divider before extra nutrients */}
              {extraNutrients.length > 0 && (
                <li role="separator" className="my-1 border-t border-sidebar-foreground/10" />
              )}

              {extraNutrients.map((n) => renderExtraRow(n, false))}
            </ul>
          </div>
        </div>
      )}

      {/* Detail popup — same data, with quantities shown alongside percentages.
          The wrapper resets the palette back to dark so the popup keeps the
          app's standard modal look; display:contents means no layout box, so
          it adds no flex gap to the card. */}
      <div style={{ ...DARK_MODAL_RESET, display: "contents" }}>
      <Modal
        isOpen={showDetail}
        onClose={() => setShowDetail(false)}
        title={t.composition}
        size="md"
      >
        <p className="text-sm text-sidebar-foreground/60 -mt-2 mb-4">
          {t.compositionSubtitle}
        </p>
        <div className="flex flex-col items-center gap-4">
          {total > 0 && renderDonut("aspect-square h-56 w-56 sm:h-64 sm:w-64 shrink-0")}

          <ul className="flex w-full flex-col gap-1.5 sm:gap-2">
            {calorieRows}
            {data.map((d) => renderMacroRow(d, true))}

            {extraNutrients.length > 0 && (
              <li role="separator" className="my-1 border-t border-sidebar-foreground/10" />
            )}

            {extraNutrients.map((n) => renderExtraRow(n, true))}
          </ul>
        </div>
      </Modal>
      </div>
    </section>
  );
}
