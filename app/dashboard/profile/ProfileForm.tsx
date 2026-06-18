"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useI18n } from "@/lib/i18n/provider";
import type { HumanData } from "@/lib/thruxion-api";

// Normalize an ISO timestamp (e.g. "1996-09-26T00:00:00.000Z") to the
// yyyy-mm-dd format expected by <input type="date">.
function toDateInput(value?: string): string {
  if (!value) return "";
  return value.slice(0, 10);
}

// Reusable field label + input wrapper for consistent mobile-first styling.
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-foreground">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  "w-full rounded-xl border border-border bg-background px-4 min-h-12 text-base outline-none focus:ring-2 focus:ring-ring";

export default function ProfileForm({ human }: { human: HumanData | null }) {
  const { data: session } = useSession();
  const { dict } = useI18n();
  const t = dict.profile;

  // Prefer the email from the human's linked account, falling back to session.
  const humanEmail = human?.users?.[0]?.email;

  // Local-only state, seeded from the human record fetched on the server.
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({
    firstName: human?.name ?? "",
    lastName: human?.lastname ?? "",
    email: humanEmail ?? session?.user?.email ?? "",
    phone: "",
    birthDate: toDateInput(human?.birthdate),
    gender: human?.gender ?? "",
    height: "",
    weight: "",
    activityLevel: "moderate",
    goal: "maintain",
    dailyCalorieGoal: "2000",
  });

  const update = (key: keyof typeof form) => (value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Persistence to the API can be wired here later.
    setSaved(true);
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      {/* Section header */}
      <div className="bg-primary text-primary-foreground px-5 py-5 rounded-2xl shadow-sm">
        <h1 className="text-xl font-semibold text-balance">{t.title}</h1>
        <p className="text-sm text-primary-foreground/80 mt-0.5">{t.subtitle}</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-5">
        {/* Personal data card */}
        <section className="bg-card text-card-foreground rounded-2xl border border-border shadow-sm p-5">
          <h2 className="font-medium text-sm mb-4">{t.personalData}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label={t.firstName}>
              <input
                className={inputClass}
                value={form.firstName}
                onChange={(e) => update("firstName")(e.target.value)}
              />
            </Field>
            <Field label={t.lastName}>
              <input
                className={inputClass}
                value={form.lastName}
                onChange={(e) => update("lastName")(e.target.value)}
              />
            </Field>
            <Field label={t.email}>
              <input
                type="email"
                className={inputClass}
                value={form.email}
                onChange={(e) => update("email")(e.target.value)}
              />
            </Field>
            <Field label={t.phone}>
              <input
                className={inputClass}
                value={form.phone}
                onChange={(e) => update("phone")(e.target.value)}
              />
            </Field>
            <Field label={t.birthDate}>
              <input
                type="date"
                className={inputClass}
                value={form.birthDate}
                onChange={(e) => update("birthDate")(e.target.value)}
              />
            </Field>
            <Field label={t.gender}>
              <input
                className={inputClass}
                value={form.gender}
                onChange={(e) => update("gender")(e.target.value)}
              />
            </Field>
          </div>
        </section>

        {/* Measurements & goals card */}
        <section className="bg-card text-card-foreground rounded-2xl border border-border shadow-sm p-5">
          <h2 className="font-medium text-sm mb-4">{t.measurements}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label={t.height}>
              <input
                type="number"
                inputMode="numeric"
                className={inputClass}
                value={form.height}
                onChange={(e) => update("height")(e.target.value)}
              />
            </Field>
            <Field label={t.weight}>
              <input
                type="number"
                inputMode="decimal"
                className={inputClass}
                value={form.weight}
                onChange={(e) => update("weight")(e.target.value)}
              />
            </Field>
            <Field label={t.activityLevel}>
              <select
                className={inputClass}
                value={form.activityLevel}
                onChange={(e) => update("activityLevel")(e.target.value)}
              >
                <option value="sedentary">{t.sedentary}</option>
                <option value="light">{t.light}</option>
                <option value="moderate">{t.moderate}</option>
                <option value="active">{t.active}</option>
                <option value="veryActive">{t.veryActive}</option>
              </select>
            </Field>
            <Field label={t.goal}>
              <select
                className={inputClass}
                value={form.goal}
                onChange={(e) => update("goal")(e.target.value)}
              >
                <option value="loseWeight">{t.loseWeight}</option>
                <option value="maintain">{t.maintain}</option>
                <option value="gainWeight">{t.gainWeight}</option>
              </select>
            </Field>
            <Field label={t.dailyCalorieGoal}>
              <input
                type="number"
                inputMode="numeric"
                className={inputClass}
                value={form.dailyCalorieGoal}
                onChange={(e) => update("dailyCalorieGoal")(e.target.value)}
              />
            </Field>
          </div>
        </section>

        <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center">
          <button
            type="submit"
            className="rounded-xl bg-primary text-primary-foreground px-6 min-h-12 text-sm font-semibold hover:bg-primary/90 active:scale-[0.98] transition w-full sm:w-auto"
          >
            {dict.common.save}
          </button>
          {saved && (
            <span className="text-sm text-primary text-center sm:text-left" role="status">
              {t.saved}
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
