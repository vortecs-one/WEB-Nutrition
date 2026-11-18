"use client";

import { useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import useSWRInfinite from "swr/infinite";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { useI18n } from "@/lib/i18n/provider";
import { localDateKey } from "@/lib/day-log/date-key";
import {
  addMeasurement,
  editMeasurement,
  fetchMeasurementHistory,
  fetchMeasurementSummary,
  removeMeasurement,
} from "@/lib/body-measurements/actions";
import {
  MEASUREMENTS_KEY,
  MEASUREMENT_RANGES,
  bmiCategory,
  bmiOf,
  isMeasurementHeight,
  isMeasurementWeight,
  isMeasurementsKey,
  type MeasurementPage,
  type MeasurementPoint,
  type MeasurementRange,
} from "@/lib/body-measurements/types";

const inputClass =
  "w-full rounded-xl border border-border bg-background px-4 min-h-12 text-base outline-none focus:ring-2 focus:ring-ring";
const smallInputClass =
  "w-24 rounded-lg border border-border bg-background px-2 min-h-11 text-sm tabular-nums outline-none focus:ring-2 focus:ring-ring";
const cardClass = "bg-card text-card-foreground rounded-2xl border border-border shadow-sm p-5";

const parseOptional = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));

export default function MeasurementHistory() {
  const { dict, locale } = useI18n();
  const t = dict.profile;
  const { mutate: globalMutate } = useSWRConfig();

  const [range, setRange] = useState<MeasurementRange>("90d");
  const summary = useSWR([MEASUREMENTS_KEY, "summary"], () => fetchMeasurementSummary());
  const history = useSWRInfinite<MeasurementPage | null>(
    (index, prev) => (prev && !prev.hasMore ? null : [MEASUREMENTS_KEY, "history", range, index + 1]),
    (key) => fetchMeasurementHistory(key[2] as MeasurementRange, key[3] as number),
  );

  const pages = history.data ?? [];
  const unavailable = pages.length > 0 && pages[0] === null;
  const points = [...new Map(pages.flatMap((p) => p?.points ?? []).map((p) => [p.id, p])).values()].sort((a, b) =>
    b.dateKey.localeCompare(a.dateKey),
  );
  const hasMore = pages.at(-1)?.hasMore ?? false;

  const [form, setForm] = useState({ dateKey: localDateKey(new Date()), height: "", weight: "" });
  const [status, setStatus] = useState<"idle" | "saving" | "error" | "invalid">("idle");
  const [editing, setEditing] = useState<{ id: number; height: string; weight: string } | null>(null);

  const refreshAll = () => globalMutate(isMeasurementsKey);

  const formatDate = (dateKey: string) =>
    new Date(`${dateKey}T12:00:00Z`).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
  const formatShort = (dateKey: string) =>
    new Date(`${dateKey}T12:00:00Z`).toLocaleDateString(locale, { day: "numeric", month: "short" });

  const weightSeries = points
    .filter((p) => p.weightKg !== null)
    .map((p) => ({ dateKey: p.dateKey, kg: p.weightKg }))
    .reverse();
  const chartConfig = { kg: { label: t.weight, color: "var(--primary)" } } satisfies ChartConfig;

  const rangeLabel: Record<MeasurementRange, string> = {
    "30d": t.range30d,
    "90d": t.range90d,
    "1y": t.range1y,
    all: t.rangeAll,
  };

  const validValues = (heightCm: number | null, weightKg: number | null) =>
    (heightCm !== null || weightKg !== null) &&
    (heightCm === null || isMeasurementHeight(heightCm)) &&
    (weightKg === null || isMeasurementWeight(weightKg));

  const onAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const heightCm = parseOptional(form.height);
    const weightKg = parseOptional(form.weight);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.dateKey) || !validValues(heightCm, weightKg)) {
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
    await refreshAll();
  };

  const onSaveEdit = async () => {
    if (!editing) return;
    const heightCm = parseOptional(editing.height);
    const weightKg = parseOptional(editing.weight);
    if (!validValues(heightCm, weightKg)) {
      setStatus("invalid");
      return;
    }
    setStatus("saving");
    const result = await editMeasurement(editing.id, { heightCm, weightKg });
    if (!result.ok) {
      setStatus(result.error === "invalid" ? "invalid" : "error");
      return;
    }
    setEditing(null);
    setStatus("idle");
    await refreshAll();
  };

  const onRemove = async (point: MeasurementPoint) => {
    const result = await removeMeasurement(point.id);
    if (!result.ok) {
      setStatus("error");
      return;
    }
    await refreshAll();
  };

  const formatValues = (p: MeasurementPoint) =>
    [
      p.weightKg !== null ? `${p.weightKg.toLocaleString(locale)} kg` : null,
      p.heightCm !== null ? `${p.heightCm.toLocaleString(locale)} cm` : null,
    ]
      .filter(Boolean)
      .join(" · ");

  return (
    <section className={cardClass} aria-labelledby="measurement-history-title">
      <h2 id="measurement-history-title" className="font-medium text-sm">
        {t.historyTitle}
      </h2>
      <p className="mb-4 text-xs text-muted-foreground">{t.historySubtitle}</p>

      <MeasurementSummaryCards summary={summary.data ?? null} formatDate={formatDate} />

      <div role="radiogroup" aria-label={t.historyRange} className="mb-4 flex flex-wrap gap-2">
        {MEASUREMENT_RANGES.map((r) => (
          <button
            key={r}
            type="button"
            role="radio"
            aria-checked={range === r}
            onClick={() => setRange(r)}
            className={`min-h-9 rounded-full border px-3 text-xs font-medium transition ${
              range === r
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {rangeLabel[r]}
          </button>
        ))}
      </div>

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
            min={20}
            max={400}
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

      {history.isLoading ? (
        <p className="text-sm text-muted-foreground">{dict.common.loading}</p>
      ) : history.error || unavailable ? (
        <p className="text-sm text-muted-foreground">{t.historyUnavailable}</p>
      ) : points.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.historyEmpty}</p>
      ) : (
        <>
          <ul className="flex flex-col divide-y divide-border">
            {points.map((p) =>
              editing?.id === p.id ? (
                <li key={p.id} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="text-sm text-muted-foreground">{formatDate(p.dateKey)}</span>
                  <div className="ml-auto flex flex-wrap items-center gap-2">
                    <input
                      type="number"
                      inputMode="decimal"
                      step={0.1}
                      aria-label={t.weight}
                      placeholder="kg"
                      className={smallInputClass}
                      value={editing.weight}
                      onChange={(e) => setEditing({ ...editing, weight: e.target.value })}
                    />
                    <input
                      type="number"
                      inputMode="decimal"
                      step={0.1}
                      aria-label={t.height}
                      placeholder="cm"
                      className={smallInputClass}
                      value={editing.height}
                      onChange={(e) => setEditing({ ...editing, height: e.target.value })}
                    />
                    <button
                      type="button"
                      onClick={onSaveEdit}
                      disabled={status === "saving"}
                      className="min-h-11 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                    >
                      {t.historySave}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(null)}
                      className="min-h-11 rounded-lg px-3 text-sm text-muted-foreground hover:text-foreground"
                    >
                      {t.historyCancel}
                    </button>
                  </div>
                </li>
              ) : (
                <li key={p.id} className="flex items-center gap-2 py-2">
                  <span className="text-sm text-muted-foreground">{formatDate(p.dateKey)}</span>
                  <span className="ml-auto text-sm font-semibold tabular-nums">{formatValues(p)}</span>
                  <button
                    type="button"
                    onClick={() =>
                      setEditing({
                        id: p.id,
                        height: p.heightCm?.toString() ?? "",
                        weight: p.weightKg?.toString() ?? "",
                      })
                    }
                    aria-label={`${t.historyEdit} ${formatDate(p.dateKey)}`}
                    className="min-h-11 shrink-0 rounded-lg px-2 text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    {t.historyEdit.split(" ")[0]}
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemove(p)}
                    aria-label={`${t.historyRemove} ${formatDate(p.dateKey)}`}
                    className="flex size-11 shrink-0 items-center justify-center rounded-full text-lg leading-none text-muted-foreground hover:text-destructive"
                  >
                    ×
                  </button>
                </li>
              ),
            )}
          </ul>
          {hasMore && (
            <button
              type="button"
              onClick={() => history.setSize(history.size + 1)}
              disabled={history.isValidating}
              className="mt-3 min-h-11 w-full rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-60"
            >
              {t.historyLoadMore}
            </button>
          )}
        </>
      )}
    </section>
  );
}

function MeasurementSummaryCards({
  summary,
  formatDate,
}: {
  summary: Awaited<ReturnType<typeof fetchMeasurementSummary>>;
  formatDate: (dateKey: string) => string;
}) {
  const { dict, locale } = useI18n();
  const t = dict.profile;
  if (!summary || (summary.heightCm === null && summary.weightKg === null)) return null;

  const bmi = bmiOf(summary.weightKg, summary.heightCm);
  const bmiLabel = bmi
    ? { under: t.bmiUnderweight, normal: t.bmiHealthy, over: t.bmiOverweight, obese: t.bmiObese }[bmiCategory(bmi)]
    : null;
  const formatDelta = (d: number | null) =>
    d === null ? t.deltaNone : `${d > 0 ? "+" : ""}${d.toLocaleString(locale)} kg`;

  return (
    <dl className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div className="flex flex-col gap-1 rounded-xl border border-border p-3">
        <dt className="text-xs text-muted-foreground">{t.latestWeight}</dt>
        <dd className="text-lg font-semibold tabular-nums">
          {summary.weightKg !== null ? `${summary.weightKg.toLocaleString(locale)} kg` : "—"}
        </dd>
        {summary.weightDateKey && (
          <dd className="text-xs text-muted-foreground">
            {t.measuredOn.replace("{date}", formatDate(summary.weightDateKey))}
          </dd>
        )}
      </div>
      <div className="flex flex-col gap-1 rounded-xl border border-border p-3">
        <dt className="text-xs text-muted-foreground">{t.latestHeight}</dt>
        <dd className="text-lg font-semibold tabular-nums">
          {summary.heightCm !== null ? `${summary.heightCm.toLocaleString(locale)} cm` : "—"}
        </dd>
        {bmi !== null && (
          <dd className="text-xs text-muted-foreground">
            {t.bmi} {bmi.toLocaleString(locale)} · {bmiLabel}
          </dd>
        )}
      </div>
      <div className="flex flex-col gap-1 rounded-xl border border-border p-3">
        <dt className="text-xs text-muted-foreground">{t.delta7d}</dt>
        <dd className="text-sm font-semibold tabular-nums">{formatDelta(summary.weightDelta7d)}</dd>
        <dt className="text-xs text-muted-foreground">{t.delta30d}</dt>
        <dd className="text-sm font-semibold tabular-nums">{formatDelta(summary.weightDelta30d)}</dd>
      </div>
    </dl>
  );
}
