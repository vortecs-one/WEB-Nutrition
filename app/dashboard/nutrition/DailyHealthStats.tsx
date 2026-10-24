"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { Droplet, Flame, Gauge, Moon, Scale, Utensils } from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";
import {
  BURNED_GOAL,
  CONSUMED_GOAL,
  MAX_SLEEP_MIN,
  SLEEP_GOAL_MIN,
  WATER_GOAL_ML,
  useDayLog,
  type StressLevel,
} from "@/lib/day-log/provider";

function formatSleep(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

function Tile({
  icon,
  label,
  children,
  className = "",
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-2 rounded-2xl bg-sidebar-accent p-3 ${className}`}>
      <div className="flex items-center gap-1.5 text-xs font-medium text-sidebar-foreground/60">
        <span aria-hidden="true" className="text-highlight">
          {icon}
        </span>
        {label}
      </div>
      {children}
    </div>
  );
}

function Progress({ value, goal, label }: { value: number; goal: number; label: string }) {
  const pct = Math.min(100, Math.round((value / goal) * 100));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={goal}
      aria-valuenow={Math.min(value, goal)}
      className="h-1.5 w-full overflow-hidden rounded-full bg-sidebar-foreground/10"
    >
      <div className="h-full rounded-full bg-highlight transition-[width]" style={{ width: `${pct}%` }} />
    </div>
  );
}

function GoalStat({
  value,
  goal,
  unit,
  label,
  ofGoal,
}: {
  value: number;
  goal: number;
  unit: string;
  label: string;
  ofGoal: string;
}) {
  return (
    <>
      <p className="flex flex-wrap items-baseline gap-x-1">
        <span className="text-xl font-semibold tabular-nums">{value.toLocaleString()}</span>
        <span className="text-xs text-sidebar-foreground/60">
          {unit} {ofGoal.replace("{goal}", goal.toLocaleString())}
        </span>
      </p>
      <Progress value={value} goal={goal} label={label} />
    </>
  );
}

// Health tiles for the day selected in the Calories view's navigator, shown
// in the Daily composition popup. Macros aren't repeated here — the
// composition details above them already list them.
export function DailyHealthStats({
  dateKey: key,
  isToday,
}: {
  dateKey: string;
  /** Picks today's wording ("today") over the past-day one ("that day"). */
  isToday: boolean;
}) {
  const { dict } = useI18n();
  const t = dict.healthStats;
  const { consumedFor, burnedFor, waterFor, sleepFor, setSleep, stressFor, setStress } = useDayLog();
  const [editingSleep, setEditingSleep] = useState(false);

  const consumed = consumedFor(key);
  const burned = burnedFor(key);
  const water = waterFor(key);
  const sleep = sleepFor(key);
  const stress = stressFor(key);

  const net = consumed - burned;
  const stressHint = isToday ? t.stressHint : t.stressHintDay;

  function handleSleepSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const hours = Number(form.get("hours"));
    const minutes = Number(form.get("minutes"));
    const total = Math.round(hours) * 60 + Math.round(minutes);
    if (!Number.isFinite(total) || total < 0 || total > MAX_SLEEP_MIN) return;
    setSleep(key, total);
    setEditingSleep(false);
  }

  return (
    <section className="flex flex-col gap-3" aria-labelledby="health-stats-title">
      <h3 id="health-stats-title" className="text-sm font-semibold">
        {isToday ? t.title : t.titleDay}
      </h3>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Tile icon={<Utensils className="h-4 w-4" />} label={t.consumed}>
          <GoalStat value={consumed} goal={CONSUMED_GOAL} unit="kcal" label={t.consumed} ofGoal={t.ofGoal} />
        </Tile>

        <Tile icon={<Flame className="h-4 w-4" />} label={t.burned}>
          <GoalStat value={burned} goal={BURNED_GOAL} unit="kcal" label={t.burned} ofGoal={t.ofGoal} />
        </Tile>

        <Tile icon={<Scale className="h-4 w-4" />} label={t.net}>
          <p className="flex items-baseline gap-1">
            <span className="text-xl font-semibold tabular-nums">
              {net > 0 ? "+" : ""}
              {net.toLocaleString()}
            </span>
            <span className="text-xs text-sidebar-foreground/60">kcal</span>
          </p>
        </Tile>

        <Tile icon={<Droplet className="h-4 w-4" />} label={t.hydration}>
          <GoalStat value={water} goal={WATER_GOAL_ML} unit="ml" label={t.hydration} ofGoal={t.ofGoal} />
        </Tile>

        {/* Spans two columns so the five tiles fill both the 2- and 3-column grids. */}
        <Tile icon={<Moon className="h-4 w-4" />} label={t.sleep} className="col-span-2">
          {editingSleep ? (
            <form onSubmit={handleSleepSubmit} className="flex flex-col gap-2">
              <div className="flex gap-2">
                <label className="flex min-w-0 flex-1 flex-col gap-0.5 text-xs text-sidebar-foreground/60">
                  {t.hours}
                  <input
                    name="hours"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={24}
                    step={1}
                    required
                    defaultValue={sleep !== null ? Math.floor(sleep / 60) : 8}
                    className="w-full rounded-lg border border-sidebar-foreground/15 bg-transparent px-2 py-1 text-sm text-sidebar-foreground outline-none focus:border-highlight"
                  />
                </label>
                <label className="flex min-w-0 flex-1 flex-col gap-0.5 text-xs text-sidebar-foreground/60">
                  {t.minutes}
                  <input
                    name="minutes"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={59}
                    step={5}
                    required
                    defaultValue={sleep !== null ? sleep % 60 : 0}
                    className="w-full rounded-lg border border-sidebar-foreground/15 bg-transparent px-2 py-1 text-sm text-sidebar-foreground outline-none focus:border-highlight"
                  />
                </label>
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 rounded-lg bg-highlight px-2 py-1 text-xs font-medium text-highlight-foreground hover:opacity-90"
                >
                  {t.save}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingSleep(false)}
                  className="flex-1 rounded-lg px-2 py-1 text-xs text-sidebar-foreground/70 hover:bg-sidebar-foreground/10"
                >
                  {t.cancel}
                </button>
              </div>
            </form>
          ) : (
            <>
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-xl font-semibold tabular-nums">
                  {sleep !== null ? formatSleep(sleep) : <span className="text-sm font-normal text-sidebar-foreground/60">{t.empty}</span>}
                </p>
                <button
                  type="button"
                  onClick={() => setEditingSleep(true)}
                  className="text-xs font-medium text-highlight underline-offset-4 hover:underline"
                >
                  {t.edit}
                </button>
              </div>
              <Progress value={sleep ?? 0} goal={SLEEP_GOAL_MIN} label={t.sleep} />
            </>
          )}
        </Tile>

        <Tile icon={<Gauge className="h-4 w-4" />} label={t.stress} className="col-span-2 sm:col-span-3">
          <fieldset className="flex flex-col gap-2">
            <legend className="sr-only">{stressHint}</legend>
            <p className="text-xs text-sidebar-foreground/60" aria-hidden="true">
              {stressHint}
            </p>
            <div className="grid grid-cols-5 gap-1">
              {t.stressLevels.map((label, index) => {
                const level = (index + 1) as StressLevel;
                const selected = stress === level;
                return (
                  <button
                    key={label}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setStress(key, level)}
                    className={`flex flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 text-xs transition ${
                      selected
                        ? "bg-highlight font-medium text-highlight-foreground"
                        : "bg-sidebar-foreground/5 text-sidebar-foreground/70 hover:bg-sidebar-foreground/10"
                    }`}
                  >
                    <span className="tabular-nums">{level}</span>
                    <span className="truncate">{label}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>
        </Tile>
      </div>

      <p className="text-xs leading-relaxed text-sidebar-foreground/60">{t.disclaimer}</p>
    </section>
  );
}
