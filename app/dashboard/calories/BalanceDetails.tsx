"use client";

// Body of the calorie-balance popup (the gauge's expand icon): what's left
// to eat, the breakdown behind it with each formula one tap away, the day's
// effect on body weight, and the weight log.

import { useMemo, useState, type FormEvent } from "react";
import { useI18n } from "@/lib/i18n/provider";
import { useDayLog, MIN_WEIGHT_G, MAX_WEIGHT_G } from "@/lib/day-log/provider";
import { shiftDateKey } from "@/lib/day-log/date-key";
import { useEnergyBudget, type EnergyBudget } from "@/lib/energy/use-energy-budget";
import { MIN_INTAKE_KCAL, weightChangeKg } from "@/lib/health-formulas";
import { FormulaRow, ProfilePrompt, signedKcal } from "./EnergyParts";

export function BalanceDetails({ dateKey, isToday }: { dateKey: string; isToday: boolean }) {
  const { dict, locale } = useI18n();
  const t = dict.energy;
  const b = useEnergyBudget(dateKey);
  const kcal = (n: number) => `${Math.round(n).toLocaleString(locale)} ${t.kcal}`;
  const over = b.left < 0;
  const effectG = Math.round(b.weightEffectKg * 1000);

  return (
    <div className="flex w-full flex-col gap-4">
      <ProfilePrompt missing={b.missing} />

      {/* What's left to eat: the number the day is steered by. */}
      <div className="flex flex-col items-center gap-0.5 text-center">
        <span className="text-xs font-medium uppercase tracking-wide text-sidebar-foreground/60">
          {over ? t.over : t.left}
        </span>
        <span className={`text-3xl font-bold tabular-nums ${over ? "text-destructive" : ""}`}>
          {kcal(Math.abs(b.left))}
        </span>
        <span className="text-xs text-sidebar-foreground/60">{t.fullDayHint}</span>
      </div>

      <ul className="flex flex-col gap-1.5">
        <FormulaRow
          label={t.baseBurn}
          value={kcal(b.baseBurn)}
          info={
            b.bmr !== null && b.activityFactor !== null
              ? t.baseBurnInfo
                  .replace("{bmr}", b.bmr.toLocaleString(locale))
                  .replace("{factor}", b.activityFactor.toLocaleString(locale))
              : t.baseBurnFallback.replace("{kcal}", b.baseBurn.toLocaleString(locale))
          }
        />
        <FormulaRow label={t.workouts} value={`+${kcal(b.workouts)}`} info={t.workoutsInfo} />
        <FormulaRow label={t.food} value={kcal(b.eaten)} />
        <li role="separator" className="my-1 border-t border-sidebar-foreground/10" />
        <FormulaRow label={t.net} value={`${signedKcal(b.net, locale)} ${t.kcal}`} info={t.netInfo} />
        <FormulaRow label={t.goal} value={`${signedKcal(b.adjustment, locale)} ${t.kcal}`} info={goalInfo(b, t, locale)} />
        <FormulaRow
          label={t.target}
          value={kcal(b.target)}
          info={[
            t.targetInfo.replace("{adjustment}", signedKcal(b.adjustment, locale)),
            limitNote(b, t, locale),
          ]
            .filter(Boolean)
            .join(" ")}
        />
        <FormulaRow
          strong
          label={over ? t.over : t.left}
          value={kcal(Math.abs(b.left))}
          valueClassName={over ? "text-destructive" : ""}
          info={t.leftInfo}
        />
        <li role="separator" className="my-1 border-t border-sidebar-foreground/10" />
        <FormulaRow
          label={t.weightEffect}
          value={t.weightEffectValue.replace("{grams}", signedKcal(effectG, locale))}
          info={t.weightEffectInfo}
        />
      </ul>

      <WeightPanel dateKey={dateKey} isToday={isToday} budget={b} />

      <p className="text-xs leading-relaxed text-sidebar-foreground/60">{t.disclaimer}</p>
    </div>
  );
}

type EnergyDict = ReturnType<typeof useI18n>["dict"]["energy"];

function goalInfo(b: EnergyBudget, t: EnergyDict, locale: string): string {
  const goal = b.profile?.goal ?? "maintain";
  const rate = (b.profile?.weeklyRateKg ?? 0).toLocaleString(locale);
  const text = goal === "lose" ? t.goalLose : goal === "gain" ? t.goalGain : t.goalMaintain;
  return [text.replaceAll("{rate}", rate), limitNote(b, t, locale)].filter(Boolean).join(" ");
}

function limitNote(b: EnergyBudget, t: EnergyDict, locale: string): string {
  if (b.limitedBy === "adjustmentCap") return t.limitedCap;
  if (b.limitedBy === "minIntake" && b.profile?.sex) {
    return t.limitedMin.replace("{kcal}", MIN_INTAKE_KCAL[b.profile.sex].toLocaleString(locale));
  }
  return "";
}

// --- Weight log ----------------------------------------------------------------------

function WeightPanel({ dateKey, isToday, budget }: { dateKey: string; isToday: boolean; budget: EnergyBudget }) {
  const { dict, locale } = useI18n();
  const t = dict.energy;
  const { dayData, weighIns, setWeight, consumedFor, burnedFor } = useDayLog();
  const dayWeight = dateKey ? dayData(dateKey).weight : undefined;
  const [saved, setSaved] = useState(false);

  const formatDate = (key: string) =>
    new Date(`${key}T12:00:00`).toLocaleDateString(locale, { day: "numeric", month: "short" });

  // Weigh-ins in the 30 days up to the selected day.
  const recent = useMemo(
    () => weighIns.filter((w) => w.dateKey <= dateKey && w.dateKey > shiftDateKey(dateKey, -30)),
    [weighIns, dateKey],
  );

  // Last 7 days: the change the logged balance predicts vs the scale. Only
  // days with food logged count (an empty day isn't a 2000 kcal deficit).
  const week = useMemo(() => {
    if (!budget.complete || !dateKey) return null;
    const end = weighIns.findLast((w) => w.dateKey <= dateKey);
    const start = weighIns.findLast((w) => w.dateKey <= shiftDateKey(dateKey, -6));
    if (!end || !start || end.dateKey === start.dateKey) return null;
    let net = 0;
    let days = 0;
    for (let key = start.dateKey; key < end.dateKey; key = shiftDateKey(key, 1)) {
      const eaten = consumedFor(key);
      if (eaten === 0) continue;
      net += eaten - budget.baseBurn - burnedFor(key);
      days++;
    }
    if (days === 0) return null;
    return { expected: weightChangeKg(net), real: end.kg - start.kg };
  }, [budget.complete, budget.baseBurn, dateKey, weighIns, consumedFor, burnedFor]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const kg = Number(new FormData(event.currentTarget).get("kg"));
    const grams = Math.round(kg * 1000);
    if (!Number.isFinite(kg) || grams < MIN_WEIGHT_G || grams > MAX_WEIGHT_G) return;
    setWeight(dateKey, kg);
    setSaved(true);
  }

  const signedKg = (kg: number) =>
    `${kg > 0.005 ? "+" : kg < -0.005 ? "−" : ""}${Math.abs(kg).toLocaleString(locale, { maximumFractionDigits: 2 })} kg`;

  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-sidebar-accent p-3" aria-labelledby="weight-panel-title">
      <h3 id="weight-panel-title" className="text-sm font-semibold">
        {t.weightTitle}
      </h3>

      <form key={`${dateKey}-${dayWeight?.grams ?? ""}`} onSubmit={handleSubmit} className="flex items-end gap-2">
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-sidebar-foreground/60">
          {isToday ? t.weighInToday : t.weighInDay}
          <input
            name="kg"
            type="number"
            inputMode="decimal"
            step={0.1}
            min={MIN_WEIGHT_G / 1000}
            max={MAX_WEIGHT_G / 1000}
            required
            defaultValue={dayWeight ? dayWeight.grams / 1000 : budget.weightKg ?? ""}
            onChange={() => setSaved(false)}
            className="w-full rounded-lg border border-sidebar-foreground/15 bg-transparent px-3 py-2 text-sm text-sidebar-foreground outline-none focus:border-highlight"
          />
        </label>
        <button
          type="submit"
          className="rounded-lg bg-highlight px-4 py-2 text-sm font-medium text-highlight-foreground hover:opacity-90"
        >
          {t.save}
        </button>
      </form>

      <p className="text-xs text-sidebar-foreground/60" role="status">
        {budget.weightKg !== null && budget.weighInDate
          ? t.lastWeighIn
              .replace("{kg}", budget.weightKg.toLocaleString(locale))
              .replace("{date}", formatDate(budget.weighInDate))
          : t.noWeighIns}
        {saved && " ✓"}
      </p>

      {recent.length >= 2 && (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-sidebar-foreground/60">{t.last30}</span>
          <WeightSparkline points={recent} formatDate={formatDate} locale={locale} />
        </div>
      )}

      {budget.complete && (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-sidebar-foreground/60">{t.last7}</span>
          {week ? (
            <dl className="grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-sidebar-foreground/5 px-2.5 py-1.5">
                <dt className="text-xs text-sidebar-foreground/60">{t.expected}</dt>
                <dd className="text-sm font-semibold tabular-nums">{signedKg(week.expected)}</dd>
              </div>
              <div className="rounded-lg bg-sidebar-foreground/5 px-2.5 py-1.5">
                <dt className="text-xs text-sidebar-foreground/60">{t.real}</dt>
                <dd className="text-sm font-semibold tabular-nums">{signedKg(week.real)}</dd>
              </div>
            </dl>
          ) : (
            <p className="text-xs text-sidebar-foreground/60">{t.needWeighIns}</p>
          )}
        </div>
      )}
    </section>
  );
}

// One series, so no legend: the caption above names it. 2px line, an 8px
// marker on the latest weigh-in, and a hover/focus tooltip per weigh-in
// through hit areas larger than the marks.
function WeightSparkline({
  points,
  formatDate,
  locale,
}: {
  points: { dateKey: string; kg: number }[];
  formatDate: (key: string) => string;
  locale: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const W = 280;
  const H = 56;
  const PAD = 6;
  const kgs = points.map((p) => p.kg);
  const min = Math.min(...kgs);
  const max = Math.max(...kgs);
  const span = Math.max(max - min, 0.5); // a flat line still reads as flat
  const first = new Date(`${points[0].dateKey}T12:00:00Z`).getTime();
  const last = new Date(`${points[points.length - 1].dateKey}T12:00:00Z`).getTime();
  const xy = points.map((p) => {
    const tx = last === first ? 0.5 : (new Date(`${p.dateKey}T12:00:00Z`).getTime() - first) / (last - first);
    const ty = (p.kg - (min + max) / 2) / span + 0.5;
    return { x: PAD + tx * (W - 2 * PAD), y: PAD + (1 - ty) * (H - 2 * PAD) };
  });
  const kg = (v: number) => `${v.toLocaleString(locale, { maximumFractionDigits: 1 })} kg`;
  const shown = active ?? points.length - 1;

  return (
    <div className="flex flex-col gap-1">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-14 w-full overflow-visible text-highlight"
        role="img"
        aria-label={`${formatDate(points[0].dateKey)}: ${kg(points[0].kg)} → ${formatDate(points[points.length - 1].dateKey)}: ${kg(points[points.length - 1].kg)}`}
        onMouseLeave={() => setActive(null)}
      >
        <polyline
          points={xy.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <circle cx={xy[shown].x} cy={xy[shown].y} r={4} fill="currentColor" stroke="var(--sidebar-accent)" strokeWidth={2} />
        {xy.map((p, i) => (
          <circle
            key={points[i].dateKey}
            cx={p.x}
            cy={p.y}
            r={12}
            fill="transparent"
            tabIndex={0}
            aria-label={`${formatDate(points[i].dateKey)}: ${kg(points[i].kg)}`}
            onMouseEnter={() => setActive(i)}
            onFocus={() => setActive(i)}
            onBlur={() => setActive(null)}
            className="outline-none"
          />
        ))}
      </svg>
      <p className="text-right text-xs tabular-nums text-sidebar-foreground/70" aria-hidden="true">
        {formatDate(points[shown].dateKey)} · {kg(points[shown].kg)}
      </p>
    </div>
  );
}
