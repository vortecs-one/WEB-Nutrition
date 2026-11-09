"use client";

import { useState } from "react";
import useSWR from "swr";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { useI18n } from "@/lib/i18n/provider";
import { localDateKey } from "@/lib/day-log/date-key";
import { addMeasurement, fetchMeasurementHistory, removeMeasurement } from "@/lib/body-measurements/actions";
import {
  MEASUREMENTS_KEY,
  isMeasurementHeight,
  isMeasurementWeight,
  type MeasurementPoint,
} from "@/lib/body-measurements/types";

const inputClass =
  "w-full rounded-xl border border-border bg-background px-4 min-h-12 text-base outline-none focus:ring-2 focus:ring-ring";
const cardClass = "bg-card text-card-foreground rounded-2xl border border-border shadow-sm p-5";

export default function MeasurementHistory() {
  const { dict, locale } = useI18n();
  const t = dict.profile;
  const { data, error, isLoading, mutate } = useSWR(MEASUREMENTS_KEY, fetchMeasurementHistory);
  const points = data ?? [];

  const [form, setForm] = useState({ dateKey: localDateKey(new Date()), height: "", weight: "" });
  const [status, setStatus] = useState<"idle" | "saving" | "error" | "invalid">("idle");

  const formatDate = (dateKey: string) =>
    new Date(`${dateKey}T12:00:00Z`).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
  const formatShort = (dateKey: string) =>
    new Date(`${dateKey}T12:00:00Z`).toLocaleDateString(locale, { day: "numeric", month: "short" });

  const weightSeries = points.filter((p) => p.weightKg !== null).map((p) => ({ dateKey: p.dateKey, kg: p.weightKg }));
  const chartConfig = { kg: { label: t.weight, color: "var(--primary)" } } satisfies ChartConfig;

  const onAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const heightCm = form.height === "" ? null : Number(form.height);
    const weightKg = form.weight === "" ? null : Number(form.weight);
    const valid =
      /^\d{4}-\d{2}-\d{2}$/.test(form.dateKey) &&
      (heightCm !== null || weightKg !== null) &&
      (heightCm === null || isMeasurementHeight(heightCm)) &&
      (weightKg === null || isMeasurementWeight(weightKg));
    if (!valid) {
      setStatus("invalid");
      return;
    }
    setStatus("saving");
    const result = await addMeasurement({ dateKey: form.dateKey, heightCm, weightKg });
    if (!result.ok) {
      setStatus(result.error === "invalid" ? "invalid" : "error");
      return;
    }
    setForm((prev) => ({ ...prev, height: "", weight: "" }));
    setStatus("idle");
    await mutate();
  };

  const onRemove = async (point: MeasurementPoint) => {
    await mutate(
      async () => {
        const result = await removeMeasurement(point.id);
        if (!result.ok) throw new Error(result.error);
        return fetchMeasurementHistory();
      },
      {
        optimisticData: (current) => (current ?? []).filter((p) => p.id !== point.id),
        rollbackOnError: true,
        revalidate: false,
      },
    ).catch(() => setStatus("error"));
  };

  return (
    <section className={cardClass} aria-labelledby="measurement-history-title">
      <h2 id="measurement-history-title" className="font-medium text-sm">
        {t.historyTitle}
      </h2>
      <p className="mb-4 text-xs text-muted-foreground">{t.historySubtitle}</p>

      {weightSeries.length >= 2 && (
        <ChartContainer config={chartConfig} className="mb-5 aspect-auto h-48 w-full">
          <LineChart data={weightSeries} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="dateKey" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} tickFormatter={formatShort} />
            <YAxis width={36} tickLine={false} axisLine={false} domain={["dataMin - 1", "dataMax + 1"]} allowDecimals={false} />
            <ChartTooltip content={<ChartTooltipContent labelFormatter={(value) => formatDate(String(value))} />} />
            <Line dataKey="kg" type="monotone" stroke="var(--color-kg)" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ChartContainer>
      )}

      <form onSubmit={onAdd} className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-4 sm:items-end">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{t.historyDate}</span>
          <input
            type="date"
            max={localDateKey(new Date())}
            className={inputClass}
            value={form.dateKey}
            onChange={(e) => setForm((p) => ({ ...p, dateKey: e.target.value }))}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{t.height}</span>
          <input
            type="number"
            inputMode="decimal"
            min={100}
            max={250}
            step={0.1}
            className={inputClass}
            value={form.height}
            onChange={(e) => setForm((p) => ({ ...p, height: e.target.value }))}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{t.weight}</span>
          <input
            type="number"
            inputMode="decimal"
            step={0.1}
            className={inputClass}
            value={form.weight}
            onChange={(e) => setForm((p) => ({ ...p, weight: e.target.value }))}
          />
        </label>
        <button
          type="submit"
          disabled={status === "saving"}
          className="min-h-12 rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
        >
          {t.historyAdd}
        </button>
      </form>

      {(status === "invalid" || status === "error") && (
        <p role="status" className="mb-4 text-sm text-destructive">
          {status === "invalid" ? t.historyInvalid : t.saveError}
        </p>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">{dict.common.loading}</p>
      ) : error || data === null ? (
        <p className="text-sm text-muted-foreground">{t.historyUnavailable}</p>
      ) : points.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.historyEmpty}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {[...points].reverse().map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 py-2">
              <span className="text-sm text-muted-foreground">{formatDate(p.dateKey)}</span>
              <span className="ml-auto text-sm font-semibold tabular-nums">
                {[
                  p.weightKg !== null ? `${p.weightKg.toLocaleString(locale)} kg` : null,
                  p.heightCm !== null ? `${p.heightCm.toLocaleString(locale)} cm` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              <button
                type="button"
                onClick={() => onRemove(p)}
                aria-label={`${t.historyRemove} ${formatDate(p.dateKey)}`}
                className="flex size-11 shrink-0 items-center justify-center rounded-full text-lg leading-none text-muted-foreground hover:text-destructive"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
