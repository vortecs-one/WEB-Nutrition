"use client";

import { useMemo } from "react";
import { Cell, Label, Pie, PieChart } from "recharts";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { useI18n } from "@/lib/i18n/provider";
import { useDayLog } from "@/lib/day-log/provider";

// Accepts an ISO date key so the Calories view can drive it by the
// date selected in the navigator. If no dateKey is supplied it falls
// back to today's date.
export default function NutritionChart({ dateKey }: { dateKey: string }) {
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
      { key: "protein",   label: t.macroProtein,   value: protein,   fill: "var(--color-protein)" },
      { key: "carbs",     label: t.macroCarbs,      value: carbs,     fill: "var(--color-carbs)" },
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

  return (
    <section className="bg-sidebar text-sidebar-foreground rounded-3xl shadow-sm p-4 sm:p-5 flex flex-col gap-3">
      {/* Header */}
      <div className="flex flex-col gap-0.5">
        <h2 className="text-sm font-semibold tracking-wide text-sidebar-foreground uppercase">
          {t.composition}
        </h2>
        <p className="text-[11px] text-sidebar-foreground/50 leading-tight">
          {t.compositionSubtitle}
        </p>
      </div>

      {total === 0 && extraNutrients.length === 0 ? (
        <p className="py-6 text-center text-sm text-sidebar-foreground/50">
          {t.noComposition}
        </p>
      ) : (
        <div className="flex flex-col items-center gap-3">
          {/* Donut chart — enlarged for better readability */}
          {total > 0 && (
            <ChartContainer
              config={chartConfig}
              className="aspect-square h-32 w-32 sm:h-40 sm:w-40 shrink-0"
            >
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
          )}

          {/* Macro rows — with color dot swatches */}
          <ul className="flex w-full flex-col gap-1 sm:gap-1.5">
            {data.map((d) => {
              const pct = Math.round((d.value / total) * 100);
              const grams =
                d.key === "protein" ? nutrientTotals.protein :
                d.key === "carbs"   ? nutrientTotals.carbs :
                d.key === "fat"     ? nutrientTotals.fat :
                null;
              return (
                <li key={d.key} className="flex items-center gap-2 text-[11px] sm:text-sm">
                  {/* Color swatch dot */}
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: colorMap[d.key] ?? d.fill }}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate text-sidebar-foreground/70">
                    {d.label}
                  </span>
                  {grams != null && (
                    <span className="tabular-nums text-sidebar-foreground/50 text-[11px]">
                      {grams}{t.unitG}
                    </span>
                  )}
                  <span className="font-bold tabular-nums w-10 text-right" style={{ color: colorMap[d.key] ?? "inherit" }}>
                    {pct}%
                  </span>
                </li>
              );
            })}

            {/* Divider before extra nutrients */}
            {extraNutrients.length > 0 && (
              <li role="separator" className="my-1 border-t border-sidebar-foreground/10" />
            )}

            {extraNutrients.map((n) => (
              <li key={n.key} className="flex items-center gap-2 text-[11px] sm:text-sm">
                {/* Plain spacer to align with rows that have a dot */}
                <span className="size-2 shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-sidebar-foreground/70">
                  {n.label}
                </span>
                <span className="tabular-nums text-sidebar-foreground/50 text-[11px]">
                  {n.value}{n.unit}
                </span>
                <span className="font-semibold tabular-nums w-10 text-right text-sidebar-foreground/70">
                  {n.pct != null ? `${n.pct}%` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
