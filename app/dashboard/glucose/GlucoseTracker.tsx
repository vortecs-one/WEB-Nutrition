"use client";

// Glucose monitor: big current-reading card with trend arrow + status color,
// a patient switcher (LibreLinkUp main/remote readings), and a history chart
// with target band and high/low threshold lines (modeled on the classic
// Nightscout dark chart). Data comes from the configured source: LibreLinkUp
// (same data as the LibreLink app) or Nightscout.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Settings2, AlertTriangle, Activity, Users, Maximize2 } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  ReferenceLine,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { useI18n } from "@/lib/i18n/provider";
import { fetchGlucoseData, setLibrePatient } from "@/lib/glucose/actions";
import {
  type GlucoseData,
  type GlucoseSettings,
  type GlucoseStatus,
  formatGlucose,
  glucoseStatus,
  minutesAgo,
  mgdlToMmol,
  trendArrow,
  unitLabel,
  STALE_MINUTES,
} from "@/lib/glucose/types";
import { Modal } from "@/components/ui/modal";
import GlucoseSettingsForm from "./GlucoseSettingsForm";

const RANGES = [3, 6, 12, 24] as const;
type RangeHours = (typeof RANGES)[number];

const REFRESH_MS = 60_000;

// Status → card accent classes (background + text pairs kept together for
// contrast, per design guidelines).
const statusCard: Record<GlucoseStatus, string> = {
  "in-range": "bg-chart-2 text-white",
  high: "bg-amber-500 text-amber-950",
  low: "bg-amber-500 text-amber-950",
  urgent: "bg-destructive text-destructive-foreground",
};

export default function GlucoseTracker({
  initialSettings,
}: {
  initialSettings: GlucoseSettings | null;
}) {
  const { dict } = useI18n();
  const t = dict.glucose;

  const [settings, setSettings] = useState<GlucoseSettings | null>(initialSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [showChart, setShowChart] = useState(false);
  const [rangeHours, setRangeHours] = useState<RangeHours>(12);
  const [data, setData] = useState<GlucoseData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(initialSettings));
  // Re-render every 30s so "X min ago" stays current between polls.
  const [, setClockTick] = useState(0);

  const [switchingPatient, setSwitchingPatient] = useState(false);

  const rangeRef = useRef<RangeHours>(rangeHours);
  rangeRef.current = rangeHours;

  const load = useCallback(async (hours: number) => {
    const result = await fetchGlucoseData(hours);
    // Ignore stale responses if the user switched ranges mid-flight.
    if (rangeRef.current !== hours) return;
    if (result.ok) {
      setData(result.data);
      setSettings(result.data.settings);
      setError(null);
    } else if (result.error === "not-configured") {
      setSettings(null);
    } else {
      setError(result.error);
    }
    setLoading(false);
  }, []);

  // Switch the LibreLinkUp patient (main sensor wearer vs. followed patients)
  // and reload data for the newly selected connection.
  const handleSwitchPatient = useCallback(
    async (patientId: string) => {
      if (switchingPatient) return;
      setSwitchingPatient(true);
      const result = await setLibrePatient(patientId);
      if (result.ok) {
        setLoading(true);
        await load(rangeRef.current);
      } else {
        setError("patient-switch");
      }
      setSwitchingPatient(false);
    },
    [load, switchingPatient],
  );

  // Initial load + polling (only while the tab is visible).
  useEffect(() => {
    if (!settings) return;
    setLoading(true);
    load(rangeHours);

    const interval = setInterval(() => {
      if (document.visibilityState === "visible") load(rangeRef.current);
    }, REFRESH_MS);
    const clock = setInterval(() => setClockTick((n) => n + 1), 30_000);

    const onVisible = () => {
      if (document.visibilityState === "visible") load(rangeRef.current);
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(interval);
      clearInterval(clock);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeHours, load, Boolean(settings)]);

  const unit = settings?.unit ?? "mgdl";
  const current = data?.current ?? null;
  const currentStatus: GlucoseStatus =
    current && settings ? glucoseStatus(current.sgv, settings) : "in-range";
  const currentMins = current ? minutesAgo(current.date) : null;
  const isStale = currentMins !== null && currentMins > STALE_MINUTES;

  const statusLabel: Record<GlucoseStatus, string> = {
    "in-range": t.statusInRange,
    high: t.statusHigh,
    low: t.statusLow,
    urgent: t.statusUrgent,
  };

  // Convert readings for the chart (respecting the display unit).
  const chartData = useMemo(() => {
    if (!data) return [];
    return data.readings.map((r) => ({
      date: r.date,
      value: unit === "mmol" ? mgdlToMmol(r.sgv) : r.sgv,
    }));
  }, [data, unit]);

  const cv = (mgdl: number) => (unit === "mmol" ? mgdlToMmol(mgdl) : mgdl);
  const yDomain: [number, number] = unit === "mmol" ? [2, 20] : [40, 350];
  const yTicks =
    unit === "mmol" ? [4, 8, 12, 16, 20] : [50, 100, 150, 200, 250, 300, 350];

  const timeFormatter = (ms: number) =>
    new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  // Not configured → onboarding card + settings form.
  if (!settings) {
    return (
      <div className="mx-auto w-full max-w-2xl space-y-5">
        <section className="bg-sidebar text-sidebar-foreground rounded-3xl shadow-sm p-6 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-sidebar-accent">
            <Activity className="h-6 w-6" aria-hidden="true" />
          </span>
          <h1 className="mt-3 text-lg font-semibold text-balance">{t.setupTitleGeneric}</h1>
          <p className="mt-1 text-sm text-sidebar-foreground/70 text-pretty">
            {t.setupBodyGeneric}
          </p>
        </section>
        <GlucoseSettingsForm
          settings={null}
          onSaved={(s) => {
            setSettings(s);
            setShowSettings(false);
          }}
        />
      </div>
    );
  }

  // Range selector (3h/6h/12h/24h) — reused in the compact card and the
  // expanded detail popup; both drive the same `rangeHours` state.
  const rangeSelector = (
    <div
      role="group"
      aria-label={t.chartTitle}
      className="flex rounded-full bg-sidebar-accent p-1"
    >
      {/* LibreLinkUp's graph endpoint only returns ~12h of history. */}
      {RANGES.filter(
        (h) => settings.source !== "librelinkup" || h <= 12,
      ).map((h) => (
        <button
          key={h}
          type="button"
          onClick={() => setRangeHours(h)}
          aria-pressed={rangeHours === h}
          className={`rounded-full px-3 py-1 text-xs font-medium transition ${
            rangeHours === h
              ? "bg-sidebar text-sidebar-foreground shadow-sm"
              : "text-sidebar-foreground/60 hover:text-sidebar-foreground"
          }`}
        >
          {h === 3 ? t.range3h : h === 6 ? t.range6h : h === 12 ? t.range12h : t.range24h}
        </button>
      ))}
    </div>
  );

  // Chart body — fills whatever height its wrapper provides, so the same JSX
  // renders in the compact card (h-64/72) and the expanded popup (h-[60vh]).
  const chartContent =
    loading && chartData.length === 0 ? (
      <div className="flex h-full items-center justify-center text-sm text-sidebar-foreground/60">
        {t.loading}
      </div>
    ) : chartData.length === 0 ? (
      <div className="flex h-full items-center justify-center text-sm text-sidebar-foreground/60">
        {t.noData}
      </div>
    ) : (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <XAxis
            dataKey="date"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={timeFormatter}
            tick={{ fontSize: 11, fill: "currentColor", opacity: 0.6 }}
            tickLine={false}
            axisLine={{ stroke: "currentColor", opacity: 0.2 }}
            minTickGap={40}
          />
          <YAxis
            domain={yDomain}
            ticks={yTicks}
            width={36}
            tick={{ fontSize: 11, fill: "currentColor", opacity: 0.6 }}
            tickLine={false}
            axisLine={false}
          />
          {/* Green target band */}
          <ReferenceArea
            y1={cv(settings.targetLow)}
            y2={cv(settings.targetHigh)}
            fill="var(--color-chart-2)"
            fillOpacity={0.15}
            stroke="none"
          />
          {/* High threshold (orange dashed) */}
          <ReferenceLine
            y={cv(settings.highThreshold)}
            stroke="#f59e0b"
            strokeDasharray="6 4"
            strokeWidth={1.5}
          />
          {/* Low threshold (red dashed) */}
          <ReferenceLine
            y={cv(settings.lowThreshold)}
            stroke="#ef4444"
            strokeDasharray="6 4"
            strokeWidth={1.5}
          />
          <Tooltip
            formatter={(value) => [`${value} ${unitLabel(unit)}`, ""]}
            labelFormatter={(ms) => timeFormatter(ms as number)}
            contentStyle={{
              background: "var(--color-sidebar)",
              border: "1px solid var(--color-sidebar-border)",
              borderRadius: "0.75rem",
              fontSize: "12px",
            }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="currentColor"
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    );

  return (
    <div className="mx-auto w-full max-w-4xl space-y-3">
      {/* Merged card: current reading (colored pill) + settings + history chart,
          all in a single surface so the whole glucose view is one card. */}
      <section className="bg-sidebar text-sidebar-foreground rounded-3xl shadow-sm p-3 sm:p-5">
        {/* Header: reading pill + meta on the left, actions on the right */}
        <div className="flex items-start justify-between gap-2" aria-live="polite">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            {/* Reading pill — keeps the status color (in-range/high/low/urgent) */}
            <div
              className={`flex shrink-0 flex-col items-center rounded-2xl px-3 py-2 transition-colors ${statusCard[currentStatus]}`}
            >
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl sm:text-3xl font-bold tabular-nums leading-tight">
                  {current ? formatGlucose(current.sgv, unit) : "--"}
                </span>
                {current && (
                  <span className="text-lg sm:text-2xl font-semibold" aria-label={current.direction}>
                    {trendArrow(current.direction)}
                  </span>
                )}
              </div>
              <div className="text-[10px] sm:text-xs opacity-90">{unitLabel(unit)}</div>
            </div>
            {/* Meta: patient, status, freshness */}
            <div className="min-w-0">
              <div className="truncate text-xs sm:text-sm font-medium text-sidebar-foreground/80">
                {settings.source === "librelinkup" && data?.patientName
                  ? data.patientName
                  : t.currentReading}
              </div>
              {current && (
                <>
                  <div className="text-[10px] sm:text-xs font-semibold uppercase tracking-wide">
                    {statusLabel[currentStatus]}
                  </div>
                  <div className="text-[10px] sm:text-xs text-sidebar-foreground/60">
                    {currentMins === 0
                      ? t.justNow
                      : t.lastUpdated.replace("{min}", String(currentMins))}
                  </div>
                </>
              )}
            </div>
          </div>
          {/* Actions: settings + expand chart */}
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              onClick={() => setShowSettings((v) => !v)}
              aria-label={t.settings}
              aria-expanded={showSettings}
              className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full hover:bg-sidebar-accent active:scale-95 transition"
            >
              <Settings2 className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setShowChart(true)}
              aria-label={t.chartTitle}
              className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full hover:bg-sidebar-accent active:scale-95 transition"
            >
              <Maximize2 className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {isStale && (
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-sidebar-accent/60 px-3 py-2 text-xs sm:text-sm">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{t.staleWarning}</span>
          </div>
        )}

        <div className="mt-3 flex">{rangeSelector}</div>
        <div className="mt-3 h-64 sm:h-72 w-full">{chartContent}</div>
      </section>

      {/* Patient switcher (LibreLinkUp: main sensor + followed patients) */}
      {settings.source === "librelinkup" && (data?.patients?.length ?? 0) > 1 && (
        <section className="bg-sidebar text-sidebar-foreground rounded-3xl shadow-sm p-4">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 shrink-0 text-sidebar-foreground/60" aria-hidden="true" />
            <span className="text-xs font-medium text-sidebar-foreground/70">
              {t.patientLabel}
            </span>
          </div>
          <div
            role="group"
            aria-label={t.patientLabel}
            className="mt-2 flex flex-wrap gap-2"
          >
            {data!.patients.map((p) => {
              const selected = p.patientId === settings.librePatientId;
              return (
                <button
                  key={p.patientId}
                  type="button"
                  onClick={() => handleSwitchPatient(p.patientId)}
                  disabled={switchingPatient || selected}
                  aria-pressed={selected}
                  className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition active:scale-95 disabled:pointer-events-none ${
                    selected
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-sidebar-accent text-sidebar-foreground/80 hover:text-sidebar-foreground"
                  } ${switchingPatient && !selected ? "opacity-50" : ""}`}
                >
                  <span>{p.name || t.patientLabel}</span>
                  {p.currentMgdl !== null && (
                    <span className="tabular-nums text-xs opacity-80">
                      {formatGlucose(p.currentMgdl, unit)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Error banner (fetch problems while configured) */}
      {error && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-2xl bg-destructive/10 text-destructive px-4 py-3 text-sm"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            {error === "invalid-credentials"
              ? t.libreInvalidCredentials
              : error === "terms"
                ? t.libreTermsPending
                : error === "patient-switch"
                  ? t.patientSwitchError
                  : error === "no-connections"
                    ? t.libreNoConnections
                    : error === "unauthorized"
                      ? settings.source === "librelinkup"
                        ? t.libreInvalidCredentials
                        : t.errorUnauthorized
                      : t.errorUnreachable}
          </span>
        </div>
      )}

      {/* Medical disclaimer */}
      <p className="px-2 text-xs text-muted-foreground text-pretty">{t.disclaimer}</p>

      {/* Settings modal */}
      <Modal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        title={t.settings}
      >
        <GlucoseSettingsForm
          settings={settings}
          onSaved={(s) => {
            setSettings(s);
            setShowSettings(false);
            setLoading(true);
            load(rangeRef.current);
          }}
        />
      </Modal>

      {/* History detail popup — larger chart for a detailed view */}
      <Modal
        isOpen={showChart}
        onClose={() => setShowChart(false)}
        title={t.chartTitle}
        size="lg"
      >
        <div className="mb-3 flex justify-end">{rangeSelector}</div>
        <div className="h-[60vh] w-full">{chartContent}</div>
      </Modal>
    </div>
  );
}
