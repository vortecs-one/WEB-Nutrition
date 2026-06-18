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

// Builds the daily nutrient composition from logged meals (macro grams) and
// supplements (servings). Each supplement serving counts as one unit on the
// same scale as macro grams, so supplements naturally appear as smaller slices.
export default function NutritionChart() {
  const { dict } = useI18n();
  const t = dict.nutritionUser;
  const { meals, supplements } = useDayLog();

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
      { key: "protein", label: t.macroProtein, value: protein, fill: "var(--color-protein)" },
      { key: "carbs", label: t.macroCarbs, value: carbs, fill: "var(--color-carbs)" },
      { key: "fat", label: t.macroFat, value: fat, fill: "var(--color-fat)" },
      { key: "vitamin", label: t.chartVitamin, value: vitamins, fill: "var(--color-vitamin)" },
      { key: "creatine", label: t.chartCreatine, value: creatine, fill: "var(--color-creatine)" },
      { key: "omega3", label: t.chartOmega, value: omega3, fill: "var(--color-omega3)" },
      { key: "otherSupp", label: t.chartOtherSupp, value: otherSupp, fill: "var(--color-otherSupp)" },
    ].filter((d) => d.value > 0);
  }, [meals, supplements, t]);

  const total = useMemo(() => data.reduce((s, d) => s + d.value, 0), [data]);

  // Dominant slice, shown in the donut center.
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
    protein: { label: t.macroProtein, color: "var(--chart-1)" },
    carbs: { label: t.macroCarbs, color: "var(--chart-2)" },
    fat: { label: t.macroFat, color: "var(--chart-3)" },
    vitamin: { label: t.chartVitamin, color: "var(--chart-4)" },
    creatine: { label: t.chartCreatine, color: "var(--chart-5)" },
    omega3: { label: t.chartOmega, color: "var(--chart-6)" },
    otherSupp: { label: t.chartOtherSupp, color: "var(--chart-7)" },
  } satisfies ChartConfig;

  return (
    <section className="bg-card text-card-foreground rounded-3xl border border-border shadow-sm p-5">
      <h2 className="text-lg font-semibold">{t.composition}</h2>
      <p className="text-sm text-muted-foreground mt-0.5">
        {t.compositionSubtitle}
      </p>

      {total === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          {t.noComposition}
        </p>
      ) : (
        <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row sm:gap-6">
          <ChartContainer
            config={chartConfig}
            className="mx-auto aspect-square h-52 w-52 shrink-0"
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
                innerRadius={58}
                strokeWidth={4}
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
                          className="fill-foreground text-3xl font-bold"
                        >
                          {topPct}%
                        </tspan>
                        <tspan
                          x={cx}
                          y={cy + 18}
                          className="fill-muted-foreground text-xs"
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

          {/* Legend with percentages */}
          <ul className="grid w-full grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-1">
            {data.map((d) => {
              const pct = Math.round((d.value / total) * 100);
              return (
                <li key={d.key} className="flex items-center gap-2 text-sm">
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: d.fill }}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">
                    {d.label}
                  </span>
                  <span className="font-semibold tabular-nums">{pct}%</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
