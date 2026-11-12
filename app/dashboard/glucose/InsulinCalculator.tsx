"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AlertTriangle, Check, ChevronDown, Info, Pencil, RotateCcw } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { useI18n } from "@/lib/i18n/provider";
import {
  type GlucoseSettings,
  type GlucoseStatus,
  type GlucoseUnit,
  doseParamsFor,
  formatGlucose,
  glucoseStatus,
  unitLabel,
} from "@/lib/glucose/types";
import NumberField from "./NumberField";
import {
  type SheetParams,
  MGDL_PER_MMOL,
  SHEET_MAX_CARB_STEPS,
  SHEET_MAX_CORRECTION_STEPS,
  bolusDose,
  carbsToReach,
  mgdlToMmol,
  roundDownHalf,
  sheetCarbSteps,
  sheetCorrectionSteps,
  sheetDose,
  toMgdl,
} from "@/lib/health-formulas";

const parse = (s: string) => {
  const n = Number.parseFloat(s.replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};

// Same palette as the glucose pill and the companion card.
const GLUCOSE_CARD: Record<GlucoseStatus, string> = {
  "in-range": "bg-lime-400 text-lime-950",
  high: "bg-amber-500 text-amber-950",
  low: "bg-amber-500 text-amber-950",
  urgent: "bg-destructive text-white",
};

const fromMgdl = (mgdl: number, unit: GlucoseUnit) =>
  unit === "mmol" ? String(mgdlToMmol(mgdl)) : String(Math.round(mgdl));

type Props = {
  isOpen: boolean;
  onClose: () => void;
  currentMgdl: number | null;
  isStale: boolean;
  settings: GlucoseSettings;
};

export default function InsulinCalculator({
  isOpen,
  onClose,
  currentMgdl,
  isStale,
  settings,
}: Props) {
  const { dict } = useI18n();
  const t = dict.glucose.calculator;
  const unit = settings.unit;
  const ids = useId();

  // Glucose-valued fields are kept as typed strings in the unit they were
  // entered in, so decimals like "5." survive while typing in mmol/L.
  const [fieldUnit, setFieldUnit] = useState<GlucoseUnit>(unit);
  const [carbs, setCarbs] = useState("0");
  const [iob, setIob] = useState("0");
  const [manualGlucose, setManualGlucose] = useState("");
  // A glucose typed over the sensor reading, used only for this result. It is
  // never saved and is dropped as soon as the popup closes.
  const [overrideGlucose, setOverrideGlucose] = useState<string | null>(null);
  const [editingGlucose, setEditingGlucose] = useState(false);
  const overrideInputRef = useRef<HTMLInputElement>(null);

  if (fieldUnit !== unit) {
    const convert = (s: string) => {
      const n = parse(s);
      return Number.isNaN(n) ? s : fromMgdl(toMgdl(n, fieldUnit), unit);
    };
    setFieldUnit(unit);
    setManualGlucose(convert(manualGlucose));
    if (overrideGlucose !== null) setOverrideGlucose(convert(overrideGlucose));
  }

  if (!isOpen && (overrideGlucose !== null || editingGlucose)) {
    setOverrideGlucose(null);
    setEditingGlucose(false);
  }

  // Ratio, sensitivity and range are saved per glucose sensor and edited in
  // the Glucose popup. The sheet starts correcting at the top of the range,
  // so that value is also the formula's target.
  const saved = doseParamsFor(settings);
  const sensorName =
    settings.source === "librelinkup"
      ? dict.glucose.libreAppName
      : settings.source === "carelink"
        ? dict.glucose.careLinkAppName
        : dict.glucose.sourceNightscout;

  const overrideMgdl = overrideGlucose !== null ? toMgdl(parse(overrideGlucose), unit) : NaN;
  const hasOverride = Number.isFinite(overrideMgdl) && overrideMgdl > 0;
  const glucoseMgdl = hasOverride ? overrideMgdl : (currentMgdl ?? toMgdl(parse(manualGlucose), unit));
  const carbsG = Math.max(0, parse(carbs) || 0);
  const ratioG = saved.ratio;
  const params: SheetParams = { isf: saved.isf, low: saved.low, high: saved.high };
  const iobU = Math.max(0, parse(iob) || 0);

  const startEditingGlucose = () => {
    if (currentMgdl === null) return;
    setOverrideGlucose((prev) => prev ?? fromMgdl(currentMgdl, unit));
    setEditingGlucose(true);
    requestAnimationFrame(() => overrideInputRef.current?.focus());
  };
  const finishEditingGlucose = () => {
    // An empty or invalid entry falls back to the sensor reading.
    if (!hasOverride) setOverrideGlucose(null);
    setEditingGlucose(false);
  };
  const resetGlucose = () => {
    setOverrideGlucose(null);
    setEditingGlucose(false);
  };

  const paramsValid = ratioG > 0 && params.isf > 0 && params.low > 0 && params.high >= params.low;
  const hasGlucose = Number.isFinite(glucoseMgdl) && glucoseMgdl > 0;
  const ready = paramsValid && hasGlucose;

  const isHypo = ready && glucoseMgdl < settings.lowThreshold;

  // Only a sensor reading (or an edit of it) tints the card; a typed value
  // with no reading keeps the neutral card and its labelled field.
  const tinted = hasGlucose && (currentMgdl !== null || hasOverride);
  const status = glucoseStatus(glucoseMgdl, settings);

  // Whole-unit dose from the care team's table.
  const carbSteps = ready ? sheetCarbSteps(carbsG, ratioG) : 0;
  const steps = ready ? sheetCorrectionSteps(glucoseMgdl, params) : 0;
  const sheetUnits = ready ? sheetDose(carbSteps, steps) : 0;
  const correction = sheetUnits - carbSteps;

  const iobApplied = Math.min(iobU, sheetUnits);
  const total = isHypo ? 0 : roundDownHalf(Math.max(0, sheetUnits - iobU));

  // Exact bolus from the same inputs, for comparison only. Its target is the
  // top of the range, where the table starts correcting.
  const reference =
    ready && !isHypo
      ? bolusDose({ carbsG, ratioG, glucoseMgdl, targetMgdl: params.high, isfMgdl: params.isf, iobU })
      : null;

  const carbsNeeded = isHypo ? carbsToReach(glucoseMgdl, params.low, ratioG, params.isf) : 0;

  const fmtU = (n: number, digits = 1) =>
    `${n > 0 ? "+" : ""}${(Math.round(n * 10 ** digits) / 10 ** digits).toFixed(digits)} ${t.units}`;
  const glucoseUnit = unitLabel(unit);
  const lockLabels = { edit: t.edit, done: t.done };
  const glucoseStep = unit === "mmol" ? "0.1" : "1";

  const sectionTitle =
    "flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-sidebar-foreground/70 before:h-3 before:w-1 before:shrink-0 before:rounded-full before:bg-highlight before:content-['']";

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t.title}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <section
              aria-labelledby={`${ids}-current`}
              className={`flex min-w-0 flex-col justify-between gap-3 rounded-2xl p-3 transition-colors sm:p-4 ${
                tinted ? GLUCOSE_CARD[status] : "bg-sidebar-accent"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <h3
                  id={`${ids}-current`}
                  className={`${sectionTitle} ${tinted ? "text-current before:bg-current" : ""}`}
                >
                  {t.currentGlucose}
                </h3>
                {currentMgdl !== null && !editingGlucose && (
                  <button
                    type="button"
                    onClick={startEditingGlucose}
                    aria-label={t.editGlucose}
                    title={t.editGlucose}
                    className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full opacity-70 transition hover:bg-black/10 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>
              {currentMgdl !== null ? (
                <div className="flex flex-col gap-2">
                  {editingGlucose ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        ref={overrideInputRef}
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step={glucoseStep}
                        value={overrideGlucose ?? ""}
                        onChange={(e) => setOverrideGlucose(e.target.value)}
                        onFocus={(e) => e.target.select()}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") finishEditingGlucose();
                        }}
                        aria-label={t.editGlucose}
                        className="w-full min-w-0 rounded-lg bg-black/10 px-2 py-1 text-3xl font-semibold tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-current sm:text-4xl"
                      />
                      <span className="shrink-0 text-sm opacity-70 sm:text-base">{glucoseUnit}</span>
                      <button
                        type="button"
                        onClick={finishEditingGlucose}
                        aria-label={t.done}
                        title={t.done}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition hover:bg-black/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
                      >
                        <Check className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  ) : (
                    <p className="flex items-baseline gap-1.5 text-3xl font-semibold tabular-nums sm:text-4xl">
                      {formatGlucose(hasOverride ? overrideMgdl : currentMgdl, unit)}
                      <span className="text-sm font-normal opacity-70 sm:text-base">{glucoseUnit}</span>
                    </p>
                  )}
                  {hasOverride && !editingGlucose ? (
                    <div className="flex flex-col items-start gap-1 text-xs sm:text-sm">
                      <p className="flex items-start gap-1.5">
                        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                        {t.glucoseEdited}
                      </p>
                      <button
                        type="button"
                        onClick={resetGlucose}
                        className="flex items-center gap-1.5 rounded-md font-semibold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
                      >
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                        {t.glucoseReset}
                      </button>
                    </div>
                  ) : (
                    isStale &&
                    !editingGlucose && (
                      <p className="flex items-start gap-1.5 text-xs sm:text-sm">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                        {t.staleWarning}
                      </p>
                    )
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <p className="text-xs text-sidebar-foreground/70 sm:text-sm">{t.noReading}</p>
                  <NumberField
                    id={`${ids}-manual`}
                    label={t.manualGlucose}
                    suffix={glucoseUnit}
                    value={manualGlucose}
                    onChange={setManualGlucose}
                    step={glucoseStep}
                  />
                </div>
              )}
            </section>

            <div className="flex min-w-0 flex-col justify-between gap-3 rounded-2xl border border-highlight/25 bg-highlight/10 p-3 transition-colors focus-within:border-highlight focus-within:ring-2 focus-within:ring-highlight/40 sm:p-4">
              <label htmlFor={`${ids}-carbs`} className={sectionTitle}>
                {t.carbsToEat}
              </label>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-baseline gap-1.5">
                  <input
                    id={`${ids}-carbs`}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="1"
                    value={carbs}
                    onChange={(e) => setCarbs(e.target.value)}
                    onFocus={(e) => e.target.select()}
                    aria-describedby={`${ids}-carbs-hint`}
                    className="w-full min-w-0 bg-transparent text-3xl font-semibold tabular-nums outline-none sm:text-4xl"
                  />
                  <span className="shrink-0 text-sm text-sidebar-foreground/70 sm:text-base">{t.grams}</span>
                </div>
                <p id={`${ids}-carbs-hint`} className="text-xs text-sidebar-foreground/60">
                  {t.carbsHint}
                </p>
              </div>
            </div>
          </div>
        </div>

        <section
          aria-labelledby={`${ids}-result`}
          aria-live="polite"
          className="flex flex-col gap-2"
        >
          <h3 id={`${ids}-result`} className={`${sectionTitle} px-1`}>
            {t.resultTitle}
          </h3>

          {!ready ? (
            <p className="rounded-2xl bg-sidebar-accent p-4 text-sm text-sidebar-foreground/70">
              {hasGlucose ? t.invalid : t.noReading}
            </p>
          ) : isHypo ? (
            <div
              role="alert"
              className="flex flex-col gap-2 rounded-2xl bg-destructive/15 p-4 text-destructive"
            >
              <p className="flex items-center gap-2 font-semibold">
                <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden="true" />
                {t.hypoTitle}
              </p>
              <p className="text-sm leading-relaxed">{t.hypoRule}</p>
              <p className="text-sm">
                {t.carbsNeeded}:{" "}
                <span className="font-semibold tabular-nums">
                  {carbsNeeded} {t.grams}
                </span>
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <div className="flex min-w-0 flex-col justify-between gap-3 rounded-2xl bg-primary p-3 text-primary-foreground sm:p-4">
                  <span className="text-xs font-semibold uppercase tracking-wide opacity-80">
                    {t.totalDose}
                  </span>
                  <span className="flex items-baseline gap-1 text-4xl font-semibold tabular-nums leading-none sm:text-5xl">
                    {total.toFixed(1)}
                    <span className="text-base font-medium sm:text-lg">{t.units}</span>
                  </span>
                </div>

                <dl className="flex min-w-0 flex-col justify-center divide-y divide-highlight/20 rounded-2xl border border-highlight/20 bg-sidebar-accent px-3 sm:px-4">
                  <ResultRow label={t.carbDose} value={fmtU(carbSteps)} />
                  <ResultRow label={t.correctionDose} value={fmtU(correction)} />
                  {iobApplied > 0 && <ResultRow label={t.iobDeduction} value={fmtU(-iobApplied)} />}
                  {reference && (
                    <ResultRow
                      label={t.formulaReference}
                      value={`${reference.theoretical.toFixed(2)} ${t.units}`}
                      info={
                        // Worked formula, as on the care team's infographic:
                        // 40 g ÷ 10 = 4.00 U · (220 − 120) ÷ 80 = 1.25 U
                        <>
                          <p className="tabular-nums">
                            {`${carbsG} ${t.grams} ÷ ${ratioG} = ${reference.carb.toFixed(2)} ${t.units}`}
                            {" · "}
                            {`(${formatGlucose(glucoseMgdl, unit)} − ${formatGlucose(params.high, unit)}) ÷ ${formatGlucose(params.isf, unit)} = ${reference.correction.toFixed(2)} ${t.units}`}
                          </p>
                          <p>{t.formulaReferenceHint}</p>
                        </>
                      }
                    />
                  )}
                </dl>
              </div>

              {correction < 0 && (
                <p className="px-1 text-xs text-sidebar-foreground/70">
                  <span className="font-semibold">{t.lowTitle}.</span>{" "}
                  {t.belowTargetNote.replace("{units}", Math.abs(correction).toFixed(2))}
                </p>
              )}

              {carbsG > 0 && carbsG % ratioG > 1e-9 && (
                <p className="px-1 text-xs text-sidebar-foreground/60">
                  {t.carbsRounded.replace("{grams}", String(carbSteps * ratioG))}
                </p>
              )}

              {total === 0 && (
                <p className="px-1 text-sm text-sidebar-foreground/70">{t.noInsulinNeeded}</p>
              )}
            </>
          )}
        </section>

        {paramsValid && (
          <DoseTable
            ratio={ratioG}
            params={params}
            lowThreshold={settings.lowThreshold}
            unit={unit}
            activeSteps={ready && !isHypo ? Math.min(steps, SHEET_MAX_CORRECTION_STEPS) : null}
            activeCarbSteps={ready && !isHypo ? Math.min(carbSteps, SHEET_MAX_CARB_STEPS) : null}
          />
        )}

        <section className="flex min-w-0 flex-col gap-3 rounded-2xl border border-highlight/25 bg-sidebar-accent/40 p-3 sm:p-4">
          <NumberField
            lockable={lockLabels}
            id={`${ids}-iob`}
            label={t.iob}
            hint={t.iobHint}
            suffix={t.units}
            value={iob}
            onChange={setIob}
            step="0.5"
          />
          <p className="text-xs text-sidebar-foreground/60">
            {t.paramsMovedNote.replace("{sensor}", sensorName)}
          </p>
        </section>

        <p className="flex items-start gap-2 text-xs leading-relaxed text-sidebar-foreground/60">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {t.disclaimer}
        </p>
      </div>
    </Modal>
  );
}

// Row zone colors, matching the glucose chart's palette.
const ZONE_IN = "var(--color-lime-500)"; // in range or below it
const ZONE_HIGH = "#f59e0b"; // above range
const ZONE_VERY_HIGH = "#ef4444"; // top correction rows

function zoneColor(steps: number) {
  if (steps <= 0) return ZONE_IN;
  return steps >= 5 ? ZONE_VERY_HIGH : ZONE_HIGH;
}

function DoseTable({
  ratio,
  params,
  lowThreshold,
  unit,
  activeSteps,
  activeCarbSteps,
}: {
  ratio: number;
  params: SheetParams;
  lowThreshold: number;
  unit: GlucoseUnit;
  activeSteps: number | null;
  activeCarbSteps: number | null;
}) {
  const { dict } = useI18n();
  const t = dict.glucose.calculator;
  const fmt = (mgdl: number) => formatGlucose(mgdl, unit);
  const step = unit === "mmol" ? 0.1 * MGDL_PER_MMOL : 1;
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeCellRef = useRef<HTMLTableCellElement>(null);
  const [showUnitsInfo, setShowUnitsInfo] = useState(false);

  const rows: { steps: number; label: string }[] = [];
  if (params.low - step > lowThreshold) {
    rows.push({ steps: -1, label: `${fmt(lowThreshold + step)}–${fmt(params.low - step)}` });
  }
  rows.push({ steps: 0, label: `${fmt(params.low)}–${fmt(params.high)}` });
  for (let k = 1; k < SHEET_MAX_CORRECTION_STEPS; k++) {
    const from = params.high + (k - 1) * params.isf + step;
    const to = params.high + k * params.isf;
    rows.push({ steps: k, label: `${fmt(from)}–${fmt(to)}` });
  }
  rows.push({
    steps: SHEET_MAX_CORRECTION_STEPS,
    label: `${fmt(params.high + (SHEET_MAX_CORRECTION_STEPS - 1) * params.isf + step)}+`,
  });

  const columns = Array.from({ length: SHEET_MAX_CARB_STEPS + 1 }, (_, c) => c);
  const maxDose = sheetDose(SHEET_MAX_CARB_STEPS, SHEET_MAX_CORRECTION_STEPS);

  // Keep the highlighted cell visible: the 16 carb columns overflow sideways.
  // Only the table's own container scrolls, never the popup.
  useEffect(() => {
    const box = scrollRef.current;
    const cell = activeCellRef.current;
    if (!box || !cell) return;
    box.scrollTo({
      left: cell.offsetLeft - box.clientWidth / 2 + cell.offsetWidth / 2,
      behavior: "smooth",
    });
  }, [activeSteps, activeCarbSteps]);

  const legend = [
    { color: ZONE_IN, label: t.zoneInRange },
    { color: ZONE_HIGH, label: t.zoneHigh },
    { color: ZONE_VERY_HIGH, label: t.zoneVeryHigh },
  ];

  return (
    <details open className="group rounded-2xl border border-highlight/20 bg-sidebar-accent">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl p-3 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-highlight sm:p-4 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2 before:h-3 before:w-1 before:rounded-full before:bg-highlight before:content-['']">
          {t.tableTitle}
        </span>
        <ChevronDown
          className="h-4 w-4 shrink-0 text-highlight transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div className="flex flex-col gap-3 px-3 pb-3 sm:px-4 sm:pb-4">
        <p className="text-xs leading-relaxed text-sidebar-foreground/60">{t.tableHint}</p>
        <div className="overflow-hidden rounded-xl border border-sidebar-border bg-sidebar">
        {/* Pinned "Carbs" band: sits outside the scrolling area so it stays
            centered while the columns scroll under it. The left block matches
            the glucose column's fixed width (w-36) and continues its header. */}
        <div className="flex bg-highlight text-sm font-bold text-white">
          <div aria-hidden="true" className="w-36 shrink-0 border-r border-sidebar-border" />
          <div className="min-w-0 flex-1 px-3 py-2 text-center">
            {t.tableCarbsAxis.replace("{unit}", t.grams)}
          </div>
        </div>
        {/* Horizontal scroll only — all rows fit, so no nested vertical scroll. */}
        <div ref={scrollRef} className="overflow-x-auto overscroll-x-contain">
          <table className="w-full border-separate border-spacing-0 text-center text-xs tabular-nums sm:text-sm">
            <caption className="sr-only">{t.tableTitle}</caption>
            <thead>
              <tr>
                <th
                  scope="col"
                  className="sticky left-0 z-20 w-36 min-w-36 max-w-36 border-b border-r border-sidebar-border bg-highlight px-2 py-1 text-left align-bottom text-xs font-bold leading-tight text-white shadow-[4px_0_6px_-4px_rgba(0,0,0,0.5)]"
                >
                  {/* Units note behind an info icon, left of the label. Hover
                      shows it via title; tap toggles the bubble. */}
                  <span className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setShowUnitsInfo((v) => !v)}
                      onBlur={() => setShowUnitsInfo(false)}
                      aria-label={t.tableUnitsNote}
                      aria-expanded={showUnitsInfo}
                      title={t.tableUnitsNote}
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white/70 transition hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                    >
                      <Info className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <span>{t.tableGlucoseAxis.replace("{unit}", unitLabel(unit))}</span>
                  </span>
                  {showUnitsInfo && (
                    <span
                      role="tooltip"
                      className="absolute left-2 top-full z-30 mt-1 w-max max-w-[14rem] rounded-lg bg-sidebar px-2.5 py-1.5 text-xs font-medium text-sidebar-foreground shadow-lg ring-1 ring-sidebar-border"
                    >
                      {t.tableUnitsNote}
                    </span>
                  )}
                </th>
                {columns.map((c) => (
                  <th
                    key={c}
                    scope="col"
                    // Gram labels are part of the purple header block (a shade
                    // darker than the "Carbs" band); the active column inverts.
                    className={`min-w-9 border-b border-t border-b-sidebar-border border-t-white/20 px-1 py-1 align-bottom font-bold ${
                      c === activeCarbSteps ? "bg-white text-highlight" : "bg-highlight/80 text-white"
                    }`}
                  >
                    {Math.round(c * ratio * 10) / 10}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const rowActive = row.steps === activeSteps;
                return (
                  <tr key={row.steps}>
                    <th
                      scope="row"
                      className={`sticky left-0 z-10 w-36 min-w-36 max-w-36 whitespace-nowrap border-b border-r border-sidebar-border px-3 py-2 text-left font-medium shadow-[4px_0_6px_-4px_rgba(0,0,0,0.5)] ${
                        rowActive ? "bg-sidebar-accent text-highlight" : "bg-sidebar text-sidebar-foreground/80"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span
                          aria-hidden="true"
                          className="h-4 w-1 shrink-0 rounded-full"
                          style={{ backgroundColor: zoneColor(row.steps) }}
                        />
                        {row.label}
                      </span>
                    </th>
                    {columns.map((c) => {
                      const dose = sheetDose(c, row.steps);
                      const active = rowActive && c === activeCarbSteps;
                      const crossed = rowActive || c === activeCarbSteps;
                      // Heat-map tint: stronger for bigger doses, none at 0.
                      const tint = dose > 0 ? Math.round(6 + (dose / maxDose) * 30) : 0;
                      return (
                        <td
                          key={c}
                          ref={active ? activeCellRef : undefined}
                          aria-current={active ? "true" : undefined}
                          className={`min-w-9 border-b border-sidebar-border px-1 py-2 ${
                            active
                              ? "relative z-[5] rounded-md bg-highlight font-bold text-highlight-foreground ring-2 ring-inset ring-white/70"
                              : dose === 0
                                ? "text-sidebar-foreground/35"
                                : "text-sidebar-foreground"
                          } ${crossed && !active ? "font-semibold" : ""}`}
                          style={
                            active
                              ? undefined
                              : {
                                  backgroundColor: `color-mix(in oklab, var(--highlight) ${
                                    tint + (crossed ? 10 : 0)
                                  }%, transparent)`,
                                }
                          }
                        >
                          {dose}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </div>
        <div className="flex flex-nowrap items-center gap-x-4 whitespace-nowrap text-[11px] text-sidebar-foreground/60">
          {legend.map((z) => (
            <span key={z.label} className="flex items-center gap-1.5">
              <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: z.color }} />
              {z.label}
            </span>
          ))}
        </div>
      </div>
    </details>
  );
}

function ResultRow({
  label,
  value,
  info,
}: {
  label: string;
  value: string;
  info?: React.ReactNode;
}) {
  const [showInfo, setShowInfo] = useState(false);
  const infoId = useId();

  return (
    <div className="py-2.5">
      <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <dt className="flex items-center gap-1 text-xs text-sidebar-foreground/70 sm:text-sm">
          {label}
          {info && (
            <button
              type="button"
              onClick={() => setShowInfo((v) => !v)}
              aria-label={label}
              aria-expanded={showInfo}
              aria-controls={infoId}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-sidebar-foreground/60 transition hover:bg-highlight/15 hover:text-highlight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-highlight"
            >
              <Info className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </dt>
        <dd className="text-base font-semibold tabular-nums">{value}</dd>
      </div>
      {info && showInfo && (
        <div id={infoId} className="mt-2 flex flex-col gap-1 text-xs text-sidebar-foreground/60">
          {info}
        </div>
      )}
    </div>
  );
}
