"use client";

import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
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
import { DAILY_VALUE, percentOfDailyValue } from "@/lib/health-formulas";
import { DailyHealthStats } from "./DailyHealthStats";

// Daily nutrient composition for one date key (the day selected in the
// Calories view's navigator). Two views of the same data:
// - CompositionList: compact rows on the dashboard card.
// - CompositionDetails: donut + detailed rows in the card's popup.

// Macro rows are always shown, even at 0 g, so the card keeps its layout.
const MACRO_KEYS = new Set(["carbs", "protein", "fat"]);

// Map each chart key to its CSS variable color so we can draw dot swatches
const COLOR_MAP: Record<string, string> = {
  protein:   "var(--chart-1)",
  carbs:     "var(--chart-2)",
  fat:       "var(--chart-3)",
  vitamin:   "var(--chart-4)",
  creatine:  "var(--chart-5)",
  omega3:    "var(--chart-6)",
  otherSupp: "var(--chart-7)",
};

function useDailyComposition(dateKey: string) {
  const { dict } = useI18n();
  const t = dict.nutritionUser;
  const { dayData } = useDayLog();

  const { meals, supplements } = useMemo(
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
    return {
      protein: sum("protein"),
      carbs: sum("carbs"),
      fat: sum("fat"),
      saturatedFat: sum("saturatedFat"),
      sugars: sum("sugars"),
      fiber: sum("fiber"),
      sodium: sum("sodium"),
    };
  }, [meals]);

  // Nutrients without a natural "share of composition" %, shown against
  // standard 2000-kcal-diet daily value reference amounts instead.
  // Total sugars has no official daily value, so it's shown gram-only.
  // Always listed — 0 when nothing logged — so the card keeps its layout.
  const extraNutrients = useMemo(() => {
    const saturatedFat = nutrientTotals.saturatedFat ?? 0;
    const sugars = nutrientTotals.sugars ?? 0;
    const fiber = nutrientTotals.fiber ?? 0;
    const sodium = nutrientTotals.sodium ?? 0;
    const rows: ExtraNutrient[] = [
      { key: "saturatedFat", label: t.satFat, value: saturatedFat, unit: t.unitG, pct: percentOfDailyValue(saturatedFat, DAILY_VALUE.saturatedFat) },
      { key: "sugars", label: t.sugars, value: sugars, unit: t.unitG, pct: null },
      { key: "fiber", label: t.fiber, value: fiber, unit: t.unitG, pct: percentOfDailyValue(fiber, DAILY_VALUE.fiber) },
      { key: "sodium", label: t.sodium, value: sodium, unit: t.unitMg, pct: percentOfDailyValue(sodium, DAILY_VALUE.sodium) },
    ];
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
      // Macros always stay listed (0 g on an empty day); supplements only when logged.
    ].filter((d) => d.value > 0 || MACRO_KEYS.has(d.key));
  }, [meals, supplements, t]);

  const total = useMemo(() => data.reduce((s, d) => s + d.value, 0), [data]);

  // Grams for the macro rows (supplements have none — they show a %).
  const gramsFor = (key: string) =>
    key === "protein" ? nutrientTotals.protein ?? 0 :
    key === "carbs"   ? nutrientTotals.carbs ?? 0 :
    key === "fat"     ? nutrientTotals.fat ?? 0 :
    null;

  return { t, data, total, extraNutrients, gramsFor };
}

type CompositionSlice = { key: string; label: string; value: number; fill: string };
type ExtraNutrient = { key: string; label: string; value: number; unit: string; pct: number | null };

// Macro row — compact list shows the gram quantity; details show grams
// alongside the percentage. The donut itself (slices, center label, tooltip)
// stays percentage-based regardless — only this text row changes.
function MacroRow({
  slice,
  grams,
  total,
  unitG,
  detailed,
}: {
  slice: CompositionSlice;
  grams: number | null;
  total: number;
  unitG: string;
  detailed: boolean;
}) {
  const pct = total > 0 ? Math.round((slice.value / total) * 100) : 0;
  return (
    <li className="flex items-center gap-2 text-[11px] sm:text-sm">
      <span className="min-w-0 flex-1 truncate text-sidebar-foreground/70">
        {slice.label}
      </span>
      {detailed && grams != null && (
        <span className="shrink-0 tabular-nums text-sidebar-foreground/50 text-[11px]">
          {grams}{unitG}
        </span>
      )}
      <span className="shrink-0 font-bold tabular-nums min-w-10 text-right" style={{ color: COLOR_MAP[slice.key] ?? "inherit" }}>
        {detailed ? `${pct}%` : grams != null ? `${grams}${unitG}` : `${pct}%`}
      </span>
    </li>
  );
}

// Extra-nutrient row — compact list shows the quantity; details show grams
// alongside the percentage (blank when no daily value is defined, e.g.
// sugars, since its gram figure is already the light span beside it).
function ExtraRow({ nutrient: n, detailed }: { nutrient: ExtraNutrient; detailed: boolean }) {
  return (
    <li className="flex items-center gap-2 text-[11px] sm:text-sm">
      <span className="min-w-0 flex-1 truncate text-sidebar-foreground/70">
        {n.label}
      </span>
      {detailed && (
        <span className="shrink-0 tabular-nums text-sidebar-foreground/50 text-[11px]">
          {n.value}{n.unit}
        </span>
      )}
      <span className="shrink-0 font-semibold tabular-nums min-w-10 text-right text-sidebar-foreground/70">
        {detailed ? (n.pct != null ? `${n.pct}%` : "") : `${n.value}${n.unit}`}
      </span>
    </li>
  );
}

/** Compact rows: macros in grams, then sugars and sodium. */
export function CompositionList({ dateKey }: { dateKey: string }) {
  const { t, data, total, extraNutrients, gramsFor } = useDailyComposition(dateKey);

  // The compact list omits saturated fat and fiber; they're shown in the details only.
  const listNutrients = extraNutrients.filter(
    (n) => n.key !== "saturatedFat" && n.key !== "fiber",
  );

  return (
    <ul className="flex min-w-0 flex-col gap-1 sm:gap-1.5">
      {data.map((d) => (
        <MacroRow key={d.key} slice={d} grams={gramsFor(d.key)} total={total} unitG={t.unitG} detailed={false} />
      ))}

      {/* Divider before extra nutrients */}
      <li role="separator" className="border-t border-sidebar-foreground/10" />

      {listNutrients.map((n) => (
        <ExtraRow key={n.key} nutrient={n} detailed={false} />
      ))}
    </ul>
  );
}

/** Donut + every nutrient with grams and percentages. */
export function CompositionDetails({ dateKey }: { dateKey: string }) {
  const { t, data, total, extraNutrients, gramsFor } = useDailyComposition(dateKey);

  const top = data.reduce(
    (best, d) => (d.value > best.value ? d : best),
    data[0] ?? { label: "", value: 0 },
  );
  const topPct = total > 0 ? Math.round((top.value / total) * 100) : 0;
  const topLabel = total > 0 ? top.label : "";

  const chartConfig = {
    protein:   { label: t.macroProtein,  color: "var(--chart-1)" },
    carbs:     { label: t.macroCarbs,    color: "var(--chart-2)" },
    fat:       { label: t.macroFat,      color: "var(--chart-3)" },
    vitamin:   { label: t.chartVitamin,  color: "var(--chart-4)" },
    creatine:  { label: t.chartCreatine, color: "var(--chart-5)" },
    omega3:    { label: t.chartOmega,    color: "var(--chart-6)" },
    otherSupp: { label: t.chartOtherSupp,color: "var(--chart-7)" },
  } satisfies ChartConfig;

  // Nothing logged yet: a single muted ring stands in for the slices.
  const pieData =
    total > 0
      ? data
      : [{ key: "empty", label: "", value: 1, fill: "var(--sidebar-foreground)" }];

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6">
      <ChartContainer config={chartConfig} className="aspect-square h-48 w-48 shrink-0">
        <PieChart>
          {total > 0 && (
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
          )}
          <Pie
            data={pieData}
            dataKey="value"
            nameKey="key"
            innerRadius="56%"
            outerRadius="82%"
            paddingAngle={total > 0 ? 2 : 0}
            strokeWidth={0}
            isAnimationActive={false}
          >
            {pieData.map((d) => (
              <Cell key={d.key} fill={d.fill} fillOpacity={total > 0 ? 1 : 0.15} />
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
                      {topLabel}
                    </tspan>
                  </text>
                );
              }}
            />
          </Pie>
        </PieChart>
      </ChartContainer>

      <ul className="flex w-full min-w-0 flex-col gap-1.5 sm:gap-2">
        {data.map((d) => (
          <MacroRow key={d.key} slice={d} grams={gramsFor(d.key)} total={total} unitG={t.unitG} detailed />
        ))}

        <li role="separator" className="my-1 border-t border-sidebar-foreground/10" />

        {extraNutrients.map((n) => (
          <ExtraRow key={n.key} nutrient={n} detailed />
        ))}
      </ul>
    </div>
  );
}

// Dashboard card beside the calorie gauge: compact nutrient rows; tapping
// anywhere opens the popup with the donut, full details and the day's
// health tiles.
export default function DailyCompositionCard({
  dateKey,
  dateLabel,
}: {
  /** Day shown, from the Calories view's navigator. */
  dateKey: string;
  /** Readable date for the popup's subtitle; omitted for today. */
  dateLabel?: string;
}) {
  const { dict } = useI18n();
  const t = dict.nutritionUser;
  const [detailOpen, setDetailOpen] = useState(false);

  return (
    <section
      aria-labelledby="composition-card-title"
      className="relative h-full rounded-3xl bg-sidebar p-3 text-sidebar-foreground shadow-sm sm:p-5"
    >
      {/* Whole-card tap target, painted under the content (which ignores
          pointer events) so the nutrient list stays a real list instead of
          becoming part of the button's accessible name. */}
      <button
        type="button"
        onClick={() => setDetailOpen(true)}
        aria-label={t.viewDetails}
        className="absolute inset-0 rounded-3xl transition hover:bg-sidebar-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-highlight"
      />

      {/* Centered vertically for when the card stretches to the gauge's
          height beside it on desktop. */}
      <div className="pointer-events-none relative flex h-full flex-col justify-center gap-2">
        <div className="flex items-start justify-between gap-2">
          <h2
            id="composition-card-title"
            className="text-xs font-medium uppercase leading-tight tracking-wide text-sidebar-foreground/60"
          >
            {t.composition}
          </h2>
          <ChevronRight className="h-4 w-4 shrink-0 text-sidebar-foreground/60" aria-hidden="true" />
        </div>
        <CompositionList dateKey={dateKey} />
      </div>

      <Modal
        isOpen={detailOpen}
        onClose={() => setDetailOpen(false)}
        title={t.composition}
        size="md"
      >
        {dateLabel && (
          <p className="-mt-2 mb-4 text-sm text-sidebar-foreground/60">{dateLabel}</p>
        )}
        <div className="flex flex-col gap-6">
          <CompositionDetails dateKey={dateKey} />
          {dateKey && <DailyHealthStats dateKey={dateKey} isToday={!dateLabel} />}
        </div>
      </Modal>
    </section>
  );
}
