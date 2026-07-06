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

  // Extended nutrient totals — summed from logged meals.
  const extendedNutrients = useMemo(() => {
    const sum = (key: keyof (typeof meals)[number]) => {
      let any = false;
      let total = 0;
      for (const m of meals) {
        const v = m[key];
        if (typeof v === "number") { any = true; total += v; }
      }
      return any ? Math.round(total) : null;
    };
    return [
      { label: t.macroProtein, value: sum("protein"),      unit: t.unitG  },
      { label: t.macroCarbs,   value: sum("carbs"),        unit: t.unitG  },
      { label: t.macroFat,     value: sum("fat"),          unit: t.unitG  },
      { label: t.satFat,       value: sum("saturatedFat"), unit: t.unitG  },
      { label: t.sugars,       value: sum("sugars"),       unit: t.unitG  },
      { label: t.fiber,        value: sum("fiber"),        unit: t.unitG  },
      { label: t.sodium,       value: sum("sodium"),       unit: t.unitMg },
    ].filter((n) => n.value != null);
  }, [meals, t]);

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

  return (
    <section className="bg-sidebar text-sidebar-foreground rounded-3xl shadow-sm p-5">
      <h2 className="text-base font-semibold">{t.composition}</h2>
      <p className="text-xs text-sidebar-foreground/60 mt-0.5">
        {t.compositionSubtitle}
      </p>

      {total === 0 ? (
        <p className="py-10 text-center text-sm text-sidebar-foreground/50">
          {t.noComposition}
        </p>
      ) : (
        <div className="mt-4 flex flex-row items-center gap-4">
          {/* Legend — left */}
          <ul className="flex flex-1 flex-col gap-2.5">
            {data.map((d) => {
              const pct = Math.round((d.value / total) * 100);
              return (
                <li key={d.key} className="flex items-center gap-2 text-sm">
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: d.fill }}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate text-sidebar-foreground/70">
                    {d.label}
                  </span>
                  <span className="font-semibold tabular-nums">{pct}%</span>
                </li>
              );
            })}
          </ul>

          {/* Donut — right */}
          <ChartContainer
            config={chartConfig}
            className="aspect-square h-48 w-48 shrink-0"
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
                innerRadius={54}
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
        </div>
      )}

      {/* Extended nutrient grid — shown whenever at least one value is present */}
      {extendedNutrients.length > 0 && (
        <>
          <div className="mt-5 border-t border-sidebar-foreground/10" />
          <dl className="mt-4 grid grid-cols-4 gap-2">
            {extendedNutrients.map((n) => (
              <div
                key={n.label}
                className="rounded-2xl bg-sidebar-accent/40 p-2.5 text-center"
              >
                <dt className="text-[10px] font-medium text-sidebar-foreground/60 leading-tight">
                  {n.label}
                </dt>
                <dd className="mt-1 text-sm font-bold tabular-nums">
                  {n.value}
                  <span className="ml-0.5 text-[10px] font-medium text-sidebar-foreground/60">
                    {n.unit}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </section>
  );
}
