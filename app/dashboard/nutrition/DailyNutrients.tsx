"use client";

import { useMemo } from "react";
import { useI18n } from "@/lib/i18n/provider";
import { useDayLog } from "@/lib/day-log/provider";

// Daily nutrient totals card. Sums the extra nutrient fields recorded on the
// meals logged for `dateKey` and renders them as a compact grid. Shared by the
// dashboard (calorie balance) view so the breakdown lives next to the gauge.
export default function DailyNutrients({ dateKey }: { dateKey: string }) {
  const { dict } = useI18n();
  const t = dict.nutritionUser;
  const { dayData } = useDayLog();

  const meals = useMemo(
    () => (dateKey ? dayData(dateKey).meals : []),
    [dayData, dateKey],
  );

  const nutrients = useMemo(() => {
    const sum = (key: keyof (typeof meals)[number]) => {
      let any = false;
      let total = 0;
      for (const m of meals) {
        const v = m[key];
        if (typeof v === "number") {
          any = true;
          total += v;
        }
      }
      return any ? total : null;
    };
    return [
      { label: t.macroProtein, value: sum("protein"), unit: t.unitG },
      { label: t.macroCarbs, value: sum("carbs"), unit: t.unitG },
      { label: t.macroFat, value: sum("fat"), unit: t.unitG },
      { label: t.satFat, value: sum("saturatedFat"), unit: t.unitG },
      { label: t.sugars, value: sum("sugars"), unit: t.unitG },
      { label: t.fiber, value: sum("fiber"), unit: t.unitG },
      { label: t.sodium, value: sum("sodium"), unit: t.unitMg },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meals, t]);

  const hasNutrients = nutrients.some((n) => n.value != null);

  return (
    <section className="bg-card text-card-foreground rounded-3xl border border-border shadow-sm p-5">
      <h2 className="text-lg font-semibold">{t.dailyNutrients}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t.dailyNutrientsHint}</p>
      {hasNutrients ? (
        <dl className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {nutrients
            .filter((n) => n.value != null)
            .map((n) => (
              <div key={n.label} className="rounded-2xl bg-muted p-3 text-center">
                <dt className="text-[11px] font-medium text-muted-foreground">{n.label}</dt>
                <dd className="mt-1 text-base font-bold tabular-nums">
                  {Math.round(n.value as number)}
                  <span className="ml-0.5 text-xs font-medium text-muted-foreground">{n.unit}</span>
                </dd>
              </div>
            ))}
        </dl>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">{t.noDailyNutrients}</p>
      )}
    </section>
  );
}
