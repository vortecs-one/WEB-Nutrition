"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useI18n } from "@/lib/i18n/provider";
import type { HumanData } from "@/lib/thruxion-api";
import { saveBodyProfile } from "@/lib/body-profile/actions";
import {
  DEFAULT_ACTIVITY_LEVEL,
  isHeightCm,
  type BodyProfile,
} from "@/lib/body-profile/types";
import { useDayLog, MIN_WEIGHT_G, MAX_WEIGHT_G } from "@/lib/day-log/provider";
import { localDateKey } from "@/lib/day-log/date-key";
import { useBodyProfile } from "@/lib/energy/use-energy-budget";
import {
  ACTIVITY_FACTORS,
  MIN_INTAKE_KCAL,
  WEEKLY_RATES_KG,
  ageOn,
  baseBurn,
  bmi,
  bmiCategory,
  bmrMifflin,
  foodTarget,
  healthyWeightRange,
  macroTargets,
  waterGoalMl,
  type ActivityLevel,
  type Sex,
  type WeightGoal,
} from "@/lib/health-formulas";

// Reusable field label + input wrapper for consistent mobile-first styling.
function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-foreground">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

const inputClass =
  "w-full rounded-xl border border-border bg-background px-4 min-h-12 text-base outline-none focus:ring-2 focus:ring-ring";

const cardClass = "bg-card text-card-foreground rounded-2xl border border-border shadow-sm p-5";

type Status = "idle" | "saving" | "saved" | "error" | "invalid";

export default function ProfileForm({
  human,
  bodyProfile,
  inModal = false,
}: {
  human: HumanData | null;
  bodyProfile: BodyProfile | null;
  inModal?: boolean;
}) {
  const { data: session } = useSession();
  const { dict, locale } = useI18n();
  const t = dict.profile;
  const tn = dict.nutritionUser;
  const { weighIns, setWeight } = useDayLog();
  const { mutate: refreshBodyProfile } = useBodyProfile();

  const [form, setForm] = useState({
    sex: bodyProfile?.sex ?? "",
    birthDate: bodyProfile?.birthDate ?? "",
    height: bodyProfile?.heightCm != null ? String(bodyProfile.heightCm) : "",
    activityLevel: bodyProfile?.activityLevel ?? DEFAULT_ACTIVITY_LEVEL,
    goal: bodyProfile?.goal ?? ("maintain" as WeightGoal),
    weeklyRateKg: bodyProfile?.weeklyRateKg ?? 0.25,
  });
  // Weight shows the latest weigh-in until edited (the log loads after the page).
  const [weightInput, setWeightInput] = useState<string | null>(null);
  const latestKg = weighIns.at(-1)?.kg ?? null;
  const weight = weightInput ?? (latestKg !== null ? String(latestKg) : "");
  const [status, setStatus] = useState<Status>("idle");

  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setStatus("idle");
  };

  // Parsed values for the live numbers and for saving.
  const heightCm = form.height === "" ? null : Number(form.height);
  const weightKg = weight === "" ? null : Number(weight);
  const heightOk = heightCm === null || isHeightCm(heightCm);
  const weightOk =
    weightKg === null ||
    (Number.isFinite(weightKg) && weightKg * 1000 >= MIN_WEIGHT_G && weightKg * 1000 <= MAX_WEIGHT_G);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!heightOk || !weightOk) {
      setStatus("invalid");
      return;
    }
    setStatus("saving");
    const result = await saveBodyProfile({
      sex: (form.sex || null) as Sex | null,
      birthDate: form.birthDate || null,
      heightCm,
      activityLevel: form.activityLevel,
      goal: form.goal,
      weeklyRateKg: form.weeklyRateKg,
    });
    if (!result.ok) {
      setStatus(result.error === "invalid" ? "invalid" : "error");
      return;
    }
    // A changed weight becomes today's weigh-in (its history lives in the day log).
    if (weightKg !== null && weightKg !== latestKg) setWeight(localDateKey(new Date()), weightKg);
    setWeightInput(null);
    await refreshBodyProfile();
    setStatus("saved");
  };

  const firstName = human?.name ?? "";
  const lastName = human?.lastname ?? "";
  const email = human?.users?.[0]?.email ?? session?.user?.email ?? "";

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      {/* Section header (the popup shows the title in its own header) */}
      {!inModal && (
        <div className="bg-primary text-primary-foreground px-5 py-5 rounded-2xl shadow-sm">
          <h1 className="text-xl font-semibold text-balance">{t.title}</h1>
          <p className="text-sm text-primary-foreground/80 mt-0.5">{t.subtitle}</p>
        </div>
      )}

      {/* Personal data: read from the Thruxion account, not edited here. */}
      <section className={cardClass}>
        <h2 className="font-medium text-sm">{t.personalData}</h2>
        <p className="mb-4 text-xs text-muted-foreground">{t.managedByThruxion}</p>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            [t.firstName, firstName],
            [t.lastName, lastName],
            [t.email, email],
          ].map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="truncate text-sm font-medium">{value || "—"}</dd>
            </div>
          ))}
        </dl>
      </section>

      <form onSubmit={onSubmit} className="space-y-5">
        {/* Body data used by the calorie formulas */}
        <section className={cardClass}>
          <h2 className="font-medium text-sm mb-4">{t.bodyData}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label={t.sex} hint={bodyProfile?.fromThruxion.sex ? t.fromThruxion : undefined}>
              <select
                className={inputClass}
                value={form.sex}
                onChange={(e) => update("sex", e.target.value as Sex | "")}
              >
                <option value="">{t.select}</option>
                <option value="female">{t.female}</option>
                <option value="male">{t.male}</option>
              </select>
            </Field>
            <Field label={t.birthDate} hint={bodyProfile?.fromThruxion.birthDate ? t.fromThruxion : undefined}>
              <input
                type="date"
                className={inputClass}
                value={form.birthDate}
                onChange={(e) => update("birthDate", e.target.value)}
              />
            </Field>
            <Field label={t.height}>
              <input
                type="number"
                inputMode="numeric"
                min={100}
                max={250}
                step={1}
                className={inputClass}
                value={form.height}
                onChange={(e) => update("height", e.target.value)}
              />
            </Field>
            <Field label={t.weight} hint={t.weightHint}>
              <input
                type="number"
                inputMode="decimal"
                min={MIN_WEIGHT_G / 1000}
                max={MAX_WEIGHT_G / 1000}
                step={0.1}
                className={inputClass}
                value={weight}
                onChange={(e) => {
                  setWeightInput(e.target.value);
                  setStatus("idle");
                }}
              />
            </Field>
          </div>
        </section>

        {/* Activity and goal */}
        <section className={cardClass}>
          <h2 className="font-medium text-sm mb-4">{t.measurements}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label={t.activityLevel} hint={t.activityHint}>
              <select
                className={inputClass}
                value={form.activityLevel}
                onChange={(e) => update("activityLevel", e.target.value as ActivityLevel)}
              >
                {(Object.keys(ACTIVITY_FACTORS) as ActivityLevel[]).map((level) => (
                  <option key={level} value={level}>
                    {t[level]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t.goal}>
              <select
                className={inputClass}
                value={form.goal}
                onChange={(e) => update("goal", e.target.value as WeightGoal)}
              >
                <option value="lose">{t.loseWeight}</option>
                <option value="maintain">{t.maintain}</option>
                <option value="gain">{t.gainWeight}</option>
              </select>
            </Field>
            {form.goal !== "maintain" && (
              <Field label={t.weeklyRate}>
                <select
                  className={inputClass}
                  value={form.weeklyRateKg}
                  onChange={(e) => update("weeklyRateKg", Number(e.target.value))}
                >
                  {WEEKLY_RATES_KG.map((rate) => (
                    <option key={rate} value={rate}>
                      {t.rateOption.replace("{rate}", rate.toLocaleString(locale))}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </div>
        </section>

        <YourNumbers
          sex={(form.sex || null) as Sex | null}
          birthDate={form.birthDate || null}
          heightCm={heightOk ? heightCm : null}
          weightKg={weightOk ? weightKg : null}
          activityLevel={form.activityLevel}
          goal={form.goal}
          weeklyRateKg={form.weeklyRateKg}
          macroLabels={{ protein: tn.macroProtein, carbs: tn.macroCarbs, fat: tn.macroFat }}
        />

        <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center">
          <button
            type="submit"
            disabled={status === "saving"}
            className="rounded-xl bg-primary text-primary-foreground px-6 min-h-12 text-sm font-semibold hover:bg-primary/90 active:scale-[0.98] transition w-full sm:w-auto disabled:opacity-60"
          >
            {dict.common.save}
          </button>
          {status !== "idle" && status !== "saving" && (
            <div
              role="status"
              className={`flex items-center justify-center gap-1 text-sm sm:justify-start ${status === "saved" ? "text-primary" : "text-destructive"}`}
            >
              <span className="text-center sm:text-left">
                {status === "saved" ? t.saved : status === "error" ? t.saveError : t.invalid}
              </span>
              <button
                type="button"
                onClick={() => setStatus("idle")}
                aria-label={dict.common.close}
                className="flex size-11 shrink-0 items-center justify-center rounded-full text-lg leading-none opacity-70 hover:opacity-100"
              >
                ×
              </button>
            </div>
          )}
        </div>
      </form>
    </div>
  );
}

// Live results of the formulas for what's in the form, before saving.
function YourNumbers({
  sex,
  birthDate,
  heightCm,
  weightKg,
  activityLevel,
  goal,
  weeklyRateKg,
  macroLabels,
}: {
  sex: Sex | null;
  birthDate: string | null;
  heightCm: number | null;
  weightKg: number | null;
  activityLevel: ActivityLevel;
  goal: WeightGoal;
  weeklyRateKg: number;
  macroLabels: { protein: string; carbs: string; fat: string };
}) {
  const { dict, locale } = useI18n();
  const t = dict.profile;
  const te = dict.energy;
  const kcal = (n: number) => `${Math.round(n).toLocaleString(locale)} ${te.kcal}`;

  const ready = sex && birthDate && heightCm && weightKg;
  let rows: { label: string; value: string; note?: string }[] = [];
  if (ready) {
    const age = ageOn(birthDate, localDateKey(new Date()));
    const bmr = Math.round(bmrMifflin({ sex, weightKg, heightCm, age }));
    const base = Math.round(baseBurn(bmr, activityLevel));
    const target = foodTarget({ baseBurnKcal: base, goal, weeklyRateKg, sex });
    const macros = macroTargets({ targetKcal: target.kcal, weightKg, goal });
    const bmiValue = bmi(weightKg, heightCm);
    const category = bmiCategory(bmiValue);
    const range = healthyWeightRange(heightCm);
    const categoryLabel = {
      underweight: t.bmiUnderweight,
      healthy: t.bmiHealthy,
      overweight: t.bmiOverweight,
      obese: t.bmiObese,
    }[category];
    rows = [
      { label: t.bmr, value: kcal(bmr) },
      { label: t.baseBurn, value: kcal(base) },
      {
        label: t.target,
        value: kcal(target.kcal),
        note:
          target.limitedBy === "adjustmentCap"
            ? te.limitedCap
            : target.limitedBy === "minIntake"
              ? te.limitedMin.replace("{kcal}", MIN_INTAKE_KCAL[sex].toLocaleString(locale))
              : undefined,
      },
      {
        label: t.macros,
        value: `${macroLabels.protein} ${macros.protein} g · ${macroLabels.carbs} ${macros.carbs} g · ${macroLabels.fat} ${macros.fat} g`,
      },
      {
        label: t.bmi,
        value: `${bmiValue.toLocaleString(locale, { maximumFractionDigits: 1 })} · ${categoryLabel}`,
        note: t.healthyRange
          .replace("{min}", range.minKg.toLocaleString(locale))
          .replace("{max}", range.maxKg.toLocaleString(locale)),
      },
      { label: t.water, value: `${(waterGoalMl(weightKg) / 1000).toLocaleString(locale)} L` },
    ];
  }

  return (
    <section className={cardClass} aria-labelledby="your-numbers-title">
      <h2 id="your-numbers-title" className="font-medium text-sm mb-4">
        {t.yourNumbers}
      </h2>
      {ready ? (
        <dl className="flex flex-col divide-y divide-border">
          {rows.map((row) => (
            <div key={row.label} className="flex flex-col gap-0.5 py-2 first:pt-0 last:pb-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
              <dt className="text-sm text-muted-foreground">{row.label}</dt>
              <dd className="text-sm font-semibold tabular-nums sm:text-right">
                {row.value}
                {row.note && <span className="block text-xs font-normal text-muted-foreground">{row.note}</span>}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground">{t.numbersPending}</p>
      )}
      <p className="mt-4 text-xs text-muted-foreground">{te.disclaimer}</p>
    </section>
  );
}
