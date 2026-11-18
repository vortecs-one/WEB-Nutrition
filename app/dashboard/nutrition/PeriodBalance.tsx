"use client";

import { Scale } from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";
import { useEnergyPeriod } from "@/lib/energy/use-energy-budget";

function signed(value: number) {
  return `${value > 0 ? "+" : ""}${value.toLocaleString()}`;
}

// Net balance for the last 7 or 30 days ending on the selected day, in the
// Composition popup's week and month views.
export function PeriodBalance({ dateKey, days }: { dateKey: string; days: 7 | 30 }) {
  const { dict } = useI18n();
  const t = dict.healthStats;
  const period = useEnergyPeriod(dateKey, days);

  return (
    <section className="flex flex-col gap-3" aria-labelledby="period-balance-title">
      <div className="flex min-w-0 flex-col gap-2 rounded-2xl bg-sidebar-accent p-3">
        <h3
          id="period-balance-title"
          className="flex items-center gap-1.5 text-xs font-medium text-sidebar-foreground/60"
        >
          <span aria-hidden="true" className="text-highlight">
            <Scale className="h-4 w-4" />
          </span>
          {days === 7 ? t.periodTitleWeek : t.periodTitleMonth}
        </h3>

        {period.avgNet === null ? (
          <p className="text-sm text-sidebar-foreground/60">{t.periodEmpty}</p>
        ) : (
          <>
            <p className="flex items-baseline gap-1">
              <span className="text-xl font-semibold tabular-nums">{signed(period.net)}</span>
              <span className="text-xs text-sidebar-foreground/60">kcal</span>
            </p>
            <p className="text-xs text-sidebar-foreground/60">
              {t.periodAvg.replace("{avg}", signed(period.avgNet))}
            </p>
            <p className="text-xs text-sidebar-foreground/60">
              {t.periodDetail
                .replace("{eaten}", period.eaten.toLocaleString())
                .replace("{burned}", period.burned.toLocaleString())}
            </p>
            <p className="text-xs text-sidebar-foreground/60">
              {t.periodLogged
                .replace("{logged}", String(period.loggedDays))
                .replace("{days}", String(period.days))}
            </p>
          </>
        )}
      </div>

      <p className="text-xs leading-relaxed text-sidebar-foreground/60">{t.periodNote}</p>
    </section>
  );
}
