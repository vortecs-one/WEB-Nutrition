"use client";

// Glucose monitor: big current-reading card with trend arrow + status color,
// a patient switcher (LibreLinkUp main/remote readings), and a history chart
// with target band and high/low threshold lines (modeled on the classic
// Nightscout dark chart). Data comes from the configured source: LibreLinkUp
// (same data as the LibreLink app) or Nightscout.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Activity,
  Users,
  Cpu,
  BellRing,
  Settings2,
  Info,
  Maximize2,
  ArrowUp,
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  ChevronsUp,
  ChevronsDown,
  type LucideIcon,
} from "lucide-react";
import {
  AreaChart,
  Area,
  CartesianGrid,
  LabelList,
  XAxis,
  YAxis,
  ReferenceLine,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { useI18n } from "@/lib/i18n/provider";
import { fetchGlucoseData, setGlucoseUnit, setLibrePatient } from "@/lib/glucose/actions";
import {
  type GlucoseData,
  type GlucoseSettings,
  type GlucoseStatus,
  type GlucoseUnit,
  type TrendDirection,
  formatGlucose,
  glucoseStatus,
  minutesAgo,
  mgdlToMmol,
  unitLabel,
  STALE_MINUTES,
  sensorExpiresAt,
  sensorIsWarmingUp,
  sensorNeedsAttention,
  sensorRemainingFraction,
  sensorRemainingMs,
  sensorWarmUpEndsAt,
  splitDuration,
} from "@/lib/glucose/types";
import { Modal } from "@/components/ui/modal";
import { Toast } from "@/components/ui/toast";
import GlucoseSettingsForm from "./GlucoseSettingsForm";

const RANGES = [3, 6, 12, 24] as const;
type RangeHours = (typeof RANGES)[number];

const REFRESH_MS = 60_000;

// Trend direction → lucide arrow icon. Double arrows use chevrons, 45° trends
// use the diagonal arrows, flat uses a straight right arrow. Non-computable /
// none directions render no icon.
const TREND_ICON: Record<TrendDirection, LucideIcon | null> = {
  DoubleUp: ChevronsUp,
  SingleUp: ArrowUp,
  FortyFiveUp: ArrowUpRight,
  Flat: ArrowRight,
  FortyFiveDown: ArrowDownRight,
  SingleDown: ArrowDown,
  DoubleDown: ChevronsDown,
  "NOT COMPUTABLE": null,
  "RATE OUT OF RANGE": null,
  NONE: null,
};

// Status → card accent classes (background + text pairs kept together for
// contrast, per design guidelines).
const statusCard: Record<GlucoseStatus, string> = {
  "in-range": "bg-chart-2 text-white",
  high: "bg-amber-500 text-amber-950",
  low: "bg-amber-500 text-amber-950",
  urgent: "bg-destructive text-destructive-foreground",
};

// SVG counterpart of statusCard, for the chart's endpoint badge — Tailwind
// classes can't paint SVG fills, so keep the two in sync by hand.
// `ink` is chosen against the fill's luminance rather than read from a theme
// token: the app defines no --destructive-foreground or amber scale.
const statusBadge: Record<GlucoseStatus, { fill: string; ink: string }> = {
  "in-range": { fill: "var(--color-chart-2)", ink: "#ffffff" },
  high: { fill: "var(--color-amber-500)", ink: "#451a03" },
  low: { fill: "var(--color-amber-500)", ink: "#451a03" },
  urgent: { fill: "var(--color-destructive)", ink: "#ffffff" },
};

export default function GlucoseTracker({
  initialSettings,
}: {
  initialSettings: GlucoseSettings | null;
}) {
  const { dict, locale } = useI18n();
  const t = dict.glucose;

  const [settings, setSettings] = useState<GlucoseSettings | null>(initialSettings);
  const [showChart, setShowChart] = useState(false);
  // Connection form inside the settings panel — collapsed until the gear is used.
  const [showConnection, setShowConnection] = useState(false);
  // Toast explaining where the target range / alarms come from.
  const [showRangesInfo, setShowRangesInfo] = useState(false);
  const [rangeHours, setRangeHours] = useState<RangeHours>(12);
  const [data, setData] = useState<GlucoseData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(initialSettings));
  // Re-render every 30s so "X min ago" stays current between polls.
  const [, setClockTick] = useState(0);

  const [switchingPatient, setSwitchingPatient] = useState(false);
  const [savingUnit, setSavingUnit] = useState(false);

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

  // Switch the display unit. Applied optimistically so the chart and readout
  // reformat instantly, then persisted; a failed save rolls the toggle back.
  const handleUnitChange = useCallback(
    async (next: GlucoseUnit) => {
      if (savingUnit) return;
      let previous: GlucoseUnit = "mgdl";
      setSettings((s) => {
        if (!s || s.unit === next) return s;
        previous = s.unit;
        return { ...s, unit: next };
      });
      setSavingUnit(true);
      const result = await setGlucoseUnit(next);
      if (!result.ok) {
        setSettings((s) => (s ? { ...s, unit: previous } : s));
        setError("unit-change");
      }
      setSavingUnit(false);
    },
    [savingUnit],
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
  const TrendIcon = current ? TREND_ICON[current.direction] : null;

  const statusLabel: Record<GlucoseStatus, string> = {
    "in-range": t.statusInRange,
    high: t.statusHigh,
    low: t.statusLow,
    urgent: t.statusUrgent,
  };

  // Sensor lifecycle (LibreLinkUp only; null hides the whole panel). These
  // recompute on every render, and the 30s clock tick keeps them ticking down
  // between polls just like the "X min ago" label.
  const sensor = data?.sensor ?? null;
  // Target range + alarms as configured in the patient's LibreLink app; shown
  // for reference only, never applied to glucoseStatus().
  const libreThresholds = data?.libreThresholds ?? null;
  const sensorRemaining = sensor ? sensorRemainingMs(sensor) : 0;
  const sensorExpired = sensor !== null && sensorRemaining <= 0;
  const sensorWarmUp = sensor !== null && sensorIsWarmingUp(sensor);
  const sensorLeft = splitDuration(sensorRemaining);
  const sensorPct = sensor ? Math.round(sensorRemainingFraction(sensor) * 100) : 0;

  const formatDateTime = (ms: number) =>
    new Date(ms).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
  const formatTime = (ms: number) =>
    new Date(ms).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });

  // Remaining-life copy: days+hours normally, hours+minutes on the last day.
  const sensorRemainingLabel = sensorExpired
    ? t.sensorExpired
    : sensorLeft.days > 0
      ? t.sensorRemainingDays
          .replace("{d}", String(sensorLeft.days))
          .replace("{h}", String(sensorLeft.hours))
      : t.sensorRemainingHours
          .replace("{h}", String(sensorLeft.hours))
          .replace("{m}", String(sensorLeft.minutes));

  // Bar color tracks urgency: healthy → running out → expired/critical.
  const sensorBarClass = sensorExpired
    ? "bg-destructive"
    : sensorPct <= 10
      ? "bg-destructive"
      : sensorPct <= 25
        ? "bg-amber-500"
        : "bg-chart-2";

  // Compact-card warning: only once a sensor change is actually due, so the
  // card stays quiet for most of the sensor's 14-day life. Distinct from
  // `isStale` above, which is about reading freshness rather than sensor age.
  const sensorWarn = sensor !== null && sensorNeedsAttention(sensor);
  const sensorWarnLabel = sensorExpired
    ? t.sensorExpired
    : `${t.sensorTitle}: ${sensorRemainingLabel}`;

  // Label/value rows inside the two side-by-side detail panels. They stack
  // (label over value) while the panel is narrow — which is the case at two
  // columns on a phone, where "Activado" + a full timestamp can't share a
  // line — and go back to label + right-aligned value once it has room.
  // Keyed off the panel's own width via @container, not the viewport, so it
  // stays correct however the panels are laid out.
  const infoRow =
    "flex flex-col gap-0.5 text-[11px] sm:text-sm @[15rem]:flex-row @[15rem]:items-center @[15rem]:gap-2";
  const infoLabel = "min-w-0 truncate text-sidebar-foreground/70 @[15rem]:flex-1";
  const infoValue = "shrink-0 tabular-nums font-medium";

  // Convert readings for the chart (respecting the display unit).
  const chartData = useMemo(() => {
    if (!data) return [];
    return data.readings.map((r) => ({
      date: r.date,
      value: unit === "mmol" ? mgdlToMmol(r.sgv) : r.sgv,
    }));
  }, [data, unit]);

  const cv = (mgdl: number) => (unit === "mmol" ? mgdlToMmol(mgdl) : mgdl);

  // Y scale: anchored to a familiar baseline so the curve's shape stays
  // comparable between sessions, but only as tall as the data needs — a fixed
  // 40-350 window leaves a third of the plot permanently empty.
  const yScale = useMemo(() => {
    const anchorLow = unit === "mmol" ? 2.5 : 40;
    const anchorHigh = unit === "mmol" ? 14 : 250;
    const step = unit === "mmol" ? 2 : 50;
    const pad = unit === "mmol" ? 0.5 : 10;

    const values = chartData.map((d) => d.value);
    const dataMin = values.length ? Math.min(...values) : anchorLow;
    const dataMax = values.length ? Math.max(...values) : anchorHigh;

    // Snap outward to whole steps so the ticks stay round numbers.
    const min = Math.min(anchorLow, Math.floor((dataMin - pad) / step) * step);
    const max = Math.max(anchorHigh, Math.ceil((dataMax + pad) / step) * step);

    const ticks: number[] = [];
    for (let v = Math.ceil(min / step) * step; v <= max; v += step) ticks.push(v);

    return { domain: [min, max] as [number, number], ticks };
  }, [chartData, unit]);

  const timeFormatter = (ms: number) =>
    new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  // Vertical zone gradient: green where the curve is inside the target range,
  // red outside it. Shared by both charts, which have different y-domains — so
  // the stops are computed per-domain and each chart gets its own gradient ids
  // (identical ids would cross-contaminate, since both mount at once).
  const zoneStopsFor = (min: number, max: number, opacity: number) => {
    const offset = (mgdl: number) => {
      const v = (max - cv(mgdl)) / (max - min);
      return Math.round(Math.min(1, Math.max(0, v)) * 1000) / 1000;
    };
    const offHigh = offset(settings?.targetHigh ?? 180);
    const offLow = offset(settings?.targetLow ?? 70);
    return (
      <>
        <stop offset={0} stopColor="#ef4444" stopOpacity={opacity} />
        <stop offset={offHigh} stopColor="#ef4444" stopOpacity={opacity} />
        <stop offset={offHigh} stopColor="var(--color-lime-500)" stopOpacity={opacity} />
        <stop offset={offLow} stopColor="var(--color-lime-500)" stopOpacity={opacity} />
        <stop offset={offLow} stopColor="#ef4444" stopOpacity={opacity} />
        <stop offset={1} stopColor="#ef4444" stopOpacity={opacity} />
      </>
    );
  };

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
        <GlucoseSettingsForm settings={null} onSaved={(s) => setSettings(s)} />
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

  // Current-reading pill — big value + unit + trend arrow, tinted by status.
  // Shared by the compact card header and the detail view header.
  const readingPill = (
    <div
      className={`flex shrink-0 items-center gap-2 rounded-2xl px-3 py-2 transition-colors ${statusCard[currentStatus]}`}
    >
      <div className="flex flex-col items-center leading-none">
        <span className="text-2xl sm:text-3xl font-bold tabular-nums leading-none">
          {current ? formatGlucose(current.sgv, unit) : "--"}
        </span>
        <span className="mt-0.5 text-xs sm:text-sm font-bold opacity-90">{unitLabel(unit)}</span>
      </div>
      {TrendIcon && (
        <TrendIcon
          className="h-8 w-8 sm:h-10 sm:w-10 shrink-0"
          strokeWidth={2.75}
          role="img"
          aria-label={current?.direction}
        />
      )}
    </div>
  );

  // Display-unit toggle — sits beside the range selector above the detail
  // chart, styled to match it.
  const unitSelector = (
    <div
      role="group"
      aria-label={t.unit}
      className="flex rounded-full bg-sidebar-accent p-1"
    >
      {(["mgdl", "mmol"] as const).map((u) => (
        <button
          key={u}
          type="button"
          onClick={() => handleUnitChange(u)}
          aria-pressed={unit === u}
          disabled={savingUnit}
          className={`rounded-full px-3 py-1 text-xs font-medium transition disabled:opacity-60 ${
            unit === u
              ? "bg-sidebar text-sidebar-foreground shadow-sm"
              : "text-sidebar-foreground/60 hover:text-sidebar-foreground"
          }`}
        >
          {u === "mgdl" ? t.unitMgdl : t.unitMmol}
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
      <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 640, height: 320 }}>
        <AreaChart data={chartData} margin={{ top: 10, right: 32, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="glucose-detail-stroke" x1="0" y1="0" x2="0" y2="1">
              {zoneStopsFor(yScale.domain[0], yScale.domain[1], 1)}
            </linearGradient>
            <linearGradient id="glucose-detail-fill" x1="0" y1="0" x2="0" y2="1">
              {zoneStopsFor(yScale.domain[0], yScale.domain[1], 0.12)}
            </linearGradient>
          </defs>
          {/* Recessive hairline grid — horizontal only, solid (dashes here are
              reserved for the thresholds, which genuinely are thresholds). */}
          <CartesianGrid
            horizontal
            vertical={false}
            stroke="currentColor"
            strokeOpacity={0.08}
          />
          <XAxis
            dataKey="date"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={timeFormatter}
            tick={{ fontSize: 11, fill: "currentColor", opacity: 0.55 }}
            tickLine={false}
            axisLine={false}
            minTickGap={48}
          />
          <YAxis
            domain={yScale.domain}
            ticks={yScale.ticks}
            width={38}
            tick={{ fontSize: 11, fill: "currentColor", opacity: 0.55 }}
            tickLine={false}
            axisLine={false}
          />
          {/* Target range band */}
          <ReferenceArea
            y1={cv(settings.targetLow)}
            y2={cv(settings.targetHigh)}
            fill="var(--color-lime-500)"
            fillOpacity={0.08}
            stroke="none"
          />
          {/* High threshold (amber dashed) */}
          <ReferenceLine
            y={cv(settings.highThreshold)}
            stroke="#f59e0b"
            strokeDasharray="5 5"
            strokeOpacity={0.7}
            strokeWidth={1}
          />
          {/* Low threshold (red dashed) */}
          <ReferenceLine
            y={cv(settings.lowThreshold)}
            stroke="#ef4444"
            strokeDasharray="5 5"
            strokeOpacity={0.7}
            strokeWidth={1}
          />
          <Tooltip
            cursor={{ stroke: "currentColor", strokeOpacity: 0.25, strokeWidth: 1 }}
            formatter={(value) => [`${value} ${unitLabel(unit)}`, ""]}
            labelFormatter={(ms) => timeFormatter(ms as number)}
            contentStyle={{
              background: "var(--color-sidebar)",
              border: "1px solid var(--color-sidebar-border)",
              borderRadius: "0.75rem",
              fontSize: "12px",
            }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="url(#glucose-detail-stroke)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="url(#glucose-detail-fill)"
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--color-sidebar)" }}
            isAnimationActive={false}
          >
            {/* Only the latest point is labelled — the axis and tooltip carry
                the rest, and a value on every point would be unreadable. The
                badge is tinted by the same status as the reading pill above. */}
            <LabelList
              dataKey="value"
              content={(props) => {
                const { x, y, value, index } = props as {
                  x?: number; y?: number; value?: number; index?: number;
                };
                if (index !== chartData.length - 1) return null;
                if (typeof x !== "number" || typeof y !== "number") return null;
                const label = String(value);
                // Grow with the text so a 3-digit mg/dL value and a 4-character
                // mmol value ("25.3") both clear the edge.
                const r = Math.max(12, label.length * 3 + 6);
                const badge = statusBadge[currentStatus];
                return (
                  <g>
                    <circle
                      cx={x}
                      cy={y}
                      r={r}
                      fill={badge.fill}
                      stroke="var(--color-sidebar)"
                      strokeWidth={2}
                    />
                    <text
                      x={x}
                      y={y}
                      fill={badge.ink}
                      fontSize={11}
                      fontWeight={700}
                      textAnchor="middle"
                      dominantBaseline="central"
                    >
                      {label}
                    </text>
                  </g>
                );
              }}
            />
          </Area>
        </AreaChart>
      </ResponsiveContainer>
    );

  // Compact "mountain" chart for the card: a short panoramic area chart with a
  // tight y-domain so the curve fills the height, colored by zone via the same
  // vertical gradient as the detail chart. The detail popup keeps the full
  // chart (axes, grid, target band, threshold lines).
  const values = chartData.map((d) => d.value);
  const pad = unit === "mmol" ? 1 : 15;
  const vMin = values.length ? Math.min(...values) - pad : yScale.domain[0];
  const vMax = values.length ? Math.max(...values) + pad : yScale.domain[1];

  const compactChart =
    loading && chartData.length === 0 ? (
      <div className="flex h-full items-center justify-center text-sm text-sidebar-foreground/60">
        {t.loading}
      </div>
    ) : chartData.length === 0 ? (
      <div className="flex h-full items-center justify-center text-sm text-sidebar-foreground/60">
        {t.noData}
      </div>
    ) : (
      <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height: 128 }}>
        <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
          <defs>
            <linearGradient id="glucose-compact-stroke" x1="0" y1="0" x2="0" y2="1">
              {zoneStopsFor(vMin, vMax, 1)}
            </linearGradient>
            <linearGradient id="glucose-compact-fill" x1="0" y1="0" x2="0" y2="1">
              {zoneStopsFor(vMin, vMax, 0.25)}
            </linearGradient>
          </defs>
          <XAxis
            dataKey="date"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={timeFormatter}
            tick={{ fontSize: 10, fill: "currentColor", opacity: 0.5 }}
            tickLine={false}
            axisLine={false}
            minTickGap={60}
          />
          <YAxis domain={[vMin, vMax]} hide />
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
          <Area
            type="monotone"
            dataKey="value"
            stroke="url(#glucose-compact-stroke)"
            strokeWidth={2.5}
            fill="url(#glucose-compact-fill)"
            dot={false}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    );

  return (
    <div className="mx-auto w-full max-w-4xl space-y-3">
      {/* Merged card: current reading (colored pill) + settings + history chart,
          all in a single surface so the whole glucose view is one card. */}
      <section className="bg-sidebar text-sidebar-foreground rounded-3xl shadow-sm p-3 sm:p-5">
        {/* Header: reading pill + meta on the left, actions on the right */}
        <div className="flex items-start justify-between gap-2" aria-live="polite">
          <div className="flex min-w-0 items-start gap-2 sm:gap-3">
            {readingPill}
            {/* Meta: label + status on one line, then freshness (patient name
                lives in the detail view) */}
            <div className="min-w-0">
              <div className="truncate text-[11px] sm:text-xs font-semibold uppercase tracking-wide text-sidebar-foreground/80">
                {t.currentReading}
                {current ? `: ${statusLabel[currentStatus]}` : ""}
              </div>
              {current && (
                <div className="mt-0.5 text-[10px] sm:text-xs text-sidebar-foreground/60">
                  <div className="truncate">
                    {currentMins === 0
                      ? t.justNow
                      : t.lastUpdated.replace("{min}", String(currentMins))}
                  </div>
                  {isStale && (
                    <div className="mt-0.5 flex items-start gap-1 text-destructive">
                      <AlertTriangle className="mt-px h-3 w-3 shrink-0" aria-hidden="true" />
                      <span className="text-[9px] sm:text-[10px]">{t.staleWarning}</span>
                    </div>
                  )}
                </div>
              )}
              {/* Sensor change due — surfaced here so it's visible without
                  opening the detail view. Deliberately outside the `current`
                  branch: an expired sensor is exactly why readings stop, so
                  this has to show when there is no current value either. */}
              {sensorWarn && (
                <div
                  className={`mt-0.5 flex items-start gap-1 ${
                    sensorExpired ? "text-destructive" : "text-amber-500"
                  }`}
                >
                  <Cpu className="mt-px h-3 w-3 shrink-0" aria-hidden="true" />
                  <span className="text-[9px] sm:text-[10px]">{sensorWarnLabel}</span>
                </div>
              )}
            </div>
          </div>
          {/* Action: open the detail view (chart, sensor, settings) */}
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              onClick={() => setShowChart(true)}
              aria-label={t.title}
              className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full hover:bg-sidebar-accent active:scale-95 transition"
            >
              <Maximize2 className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Panoramic simplified chart — full detail + range selector in the expand popup */}
        <div className="mt-3 h-32 sm:h-40 w-full">{compactChart}</div>
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

      {/* Detail popup — full chart, sensor status and all glucose settings.
          This is the single entry point for the feature (there is no separate
          settings modal). */}
      <Modal
        isOpen={showChart}
        onClose={() => setShowChart(false)}
        title={t.title}
        size="lg"
      >
        {/* Current reading + who/when, then the chart controls. No aria-live
            here: the card header already announces this value, and a second
            live region would double-announce while the modal is open. */}
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2 sm:gap-3">
            {readingPill}
            <div className="min-w-0">
              <div className="truncate text-[11px] sm:text-xs font-semibold uppercase tracking-wide text-sidebar-foreground/80">
                {t.currentReading}
                {current ? `: ${statusLabel[currentStatus]}` : ""}
              </div>
              {current && (
                <div className="mt-0.5 text-[10px] sm:text-xs text-sidebar-foreground/60">
                  <div className="truncate">
                    {currentMins === 0
                      ? t.justNow
                      : t.lastUpdated.replace("{min}", String(currentMins))}
                  </div>
                  {isStale && (
                    <div className="mt-0.5 flex items-start gap-1 text-destructive">
                      <AlertTriangle className="mt-px h-3 w-3 shrink-0" aria-hidden="true" />
                      <span className="text-[9px] sm:text-[10px]">{t.staleWarning}</span>
                    </div>
                  )}
                </div>
              )}
              {settings.source === "librelinkup" && data?.patientName && (
                <div className="mt-0.5 flex items-center gap-1.5 text-[10px] sm:text-xs text-sidebar-foreground/60">
                  <Users className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">{data.patientName}</span>
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {unitSelector}
            {rangeSelector}
          </div>
        </div>
        {/* Wide/rectangular plot box — the aspect ratio includes the x-axis
            band, so the axis labels never spill into a nested scroll. */}
        <div className="aspect-[16/9] max-h-[360px] w-full">{chartContent}</div>

        {/* The two info panels sit side by side — settings left, sensor right.
            Visual order is set with `order-*`; the DOM keeps sensor first so
            screen readers still get the read-only status before the controls.
            Grid items stretch by default, so both cards share the row's height
            and their top and bottom edges line up regardless of content.
            Either panel spans the full row when the connection form is open
            (it needs the width) or when it would otherwise be alone. */}
        <div className="mt-4 grid grid-cols-2 gap-3">
        {/* Sensor panel — activation, expiry and remaining life. Only rendered
            when the source actually reported a sensor block (LibreLinkUp). */}
        {sensor && (
          <section
            className={`@container order-2 rounded-2xl bg-sidebar-accent/40 p-4 ${
              showConnection ? "col-span-2" : ""
            }`}
          >
            {/* h-8 matches the settings panel's header (whose height is set by
                its icon buttons) so both titles — and the content under them —
                line up across the two columns. */}
            <div className="flex h-8 items-center gap-2">
              <Cpu className="h-4 w-4 shrink-0 text-sidebar-foreground/60" aria-hidden="true" />
              <h3 className="text-xs font-semibold uppercase tracking-wide text-sidebar-foreground/70">
                {t.sensorTitle}
              </h3>
              {sensorWarmUp && (
                <span className="ml-auto rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-semibold text-amber-950">
                  {t.sensorWarmingUp}
                </span>
              )}
            </div>

            {/* Remaining life — headline + progress bar */}
            <div className="mt-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                <span
                  className={`text-sm font-semibold ${sensorExpired ? "text-destructive" : ""}`}
                >
                  {sensorRemainingLabel}
                </span>
                <span className="shrink-0 text-[10px] tabular-nums text-sidebar-foreground/60">
                  {sensorPct}%
                </span>
              </div>
              <div
                className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-sidebar-foreground/10"
                role="progressbar"
                aria-valuenow={sensorPct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={t.sensorLifeRemaining}
              >
                <div
                  className={`h-full rounded-full transition-all ${sensorBarClass}`}
                  style={{ width: `${sensorPct}%` }}
                />
              </div>
            </div>

            {/* Details */}
            <ul className="mt-3 flex flex-col gap-1.5">
              <li className={infoRow}>
                <span className={infoLabel}>
                  {t.sensorActivated}
                </span>
                <span className={infoValue}>
                  {formatDateTime(sensor.activatedAt)}
                </span>
              </li>
              <li className={infoRow}>
                <span className={infoLabel}>
                  {t.sensorExpires}
                </span>
                <span className={infoValue}>
                  {formatDateTime(sensorExpiresAt(sensor))}
                </span>
              </li>
              {sensor.serialNumber && (
                <li className={infoRow}>
                  <span className={infoLabel}>
                    {t.sensorSerial}
                  </span>
                  <span className="shrink-0 font-mono text-[11px]">{sensor.serialNumber}</span>
                </li>
              )}
            </ul>

            {sensorWarmUp && (
              <p className="mt-2 text-[11px] text-sidebar-foreground/60">
                {t.sensorWarmUpEnds.replace("{time}", formatTime(sensorWarmUpEndsAt(sensor)))}
              </p>
            )}
          </section>
        )}

        {/* Settings panel: the ranges/alarms read from the source, plus the
            connection form behind the gear. Always rendered — gating it on
            libreThresholds (null for Nightscout) would leave Nightscout users
            with no way to reach their settings at all. */}
        <section
          className={`@container order-1 flex flex-col rounded-2xl bg-sidebar-accent/40 p-4 ${
            showConnection || !sensor ? "col-span-2" : ""
          }`}
        >
          <div className="flex h-8 items-center gap-2">
            {libreThresholds && (
              <BellRing className="h-4 w-4 shrink-0 text-sidebar-foreground/60" aria-hidden="true" />
            )}
            <h3 className="text-xs font-semibold uppercase tracking-wide text-sidebar-foreground/70">
              {settings.source === "librelinkup" ? t.libreAppName : t.sourceNightscout}
            </h3>
            <button
              type="button"
              onClick={() => setShowConnection((v) => !v)}
              aria-label={t.settings}
              aria-expanded={showConnection}
              className="ml-auto -mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-sidebar-accent active:scale-95 transition"
            >
              <Settings2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {libreThresholds && (
            <ul className="mt-3 flex flex-col gap-1.5">
              {libreThresholds.targetLow !== null && libreThresholds.targetHigh !== null && (
                <li className={infoRow}>
                  <span className={infoLabel}>
                    {t.libreTargetRange}
                  </span>
                  <span className={infoValue}>
                    {formatGlucose(libreThresholds.targetLow, unit)}–
                    {formatGlucose(libreThresholds.targetHigh, unit)} {unitLabel(unit)}
                  </span>
                </li>
              )}
              {libreThresholds.highAlarm && (
                <li className={infoRow}>
                  <span className={infoLabel}>
                    {t.libreHighAlarm}
                  </span>
                  <span className={infoValue}>
                    {libreThresholds.highAlarm.enabled ? (
                      <>
                        {formatGlucose(libreThresholds.highAlarm.threshold, unit)} {unitLabel(unit)}
                      </>
                    ) : (
                      <span className="text-sidebar-foreground/50">{t.alarmOff}</span>
                    )}
                  </span>
                </li>
              )}
              {libreThresholds.lowAlarm && (
                <li className={infoRow}>
                  <span className={infoLabel}>
                    {t.libreLowAlarm}
                  </span>
                  <span className={infoValue}>
                    {libreThresholds.lowAlarm.enabled ? (
                      <>
                        {formatGlucose(libreThresholds.lowAlarm.threshold, unit)} {unitLabel(unit)}
                      </>
                    ) : (
                      <span className="text-sidebar-foreground/50">{t.alarmOff}</span>
                    )}
                  </span>
                </li>
              )}
            </ul>
          )}

          {/* Where these ranges come from — behind an icon rather than four
              lines of small print in a half-width column. mt-auto parks it in
              the panel's bottom-right corner once the panel is stretched to
              match its neighbour. */}
          {libreThresholds && (
            <div className="mt-auto flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowRangesInfo(true)}
                aria-label={t.moreInfo}
                className="-mr-1 -mb-1 flex h-7 w-7 items-center justify-center rounded-full text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-foreground active:scale-95 transition"
              >
                <Info className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          )}

          {/* Source connection form — revealed by the gear above */}
          {showConnection && (
            <div className="mt-3 border-t border-sidebar-foreground/10 pt-3">
              <GlucoseSettingsForm
                settings={settings}
                onSaved={(s) => {
                  setSettings(s);
                  setShowConnection(false);
                  setLoading(true);
                  load(rangeRef.current);
                }}
              />
            </div>
          )}
        </section>
        </div>
      </Modal>

      {/* Portals to <body>, so it clears the modal's stacking context */}
      <Toast
        open={showRangesInfo}
        message={t.libreSettingsHint}
        onClose={() => setShowRangesInfo(false)}
      />
    </div>
  );
}
