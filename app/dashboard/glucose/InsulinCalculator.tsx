"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AlertTriangle, Check, ChevronDown, Info, Pencil } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { useI18n } from "@/lib/i18n/provider";
import {
  type GlucoseSettings,
  type GlucoseUnit,
  formatGlucose,
  unitLabel,
} from "@/lib/glucose/types";

const MGDL_PER_MMOL = 18.0182;

// Defaults taken from the patient's dosing sheet (RATIO / SENSIBILIDAD /
// RANGO MENOR / RANGO MAYOR).
const DEFAULT_RATIO_G = 7;
const DEFAULT_ISF_MGDL = 35;
const DEFAULT_RANGE_LOW_MGDL = 100;
const DEFAULT_RANGE_HIGH_MGDL = 120;

// The sheet has 8 correction rows above the target range (121–155 … 366+)
// and 16 carb columns (0 … 15 × ratio).
const MAX_CORRECTION_STEPS = 8;
const MAX_CARB_STEPS = 15;

const roundDownHalf = (u: number) => Math.floor(u * 2) / 2;

const parse = (s: string) => {
  const n = Number.parseFloat(s.replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};

const toMgdl = (value: number, unit: GlucoseUnit) =>
  unit === "mmol" ? value * MGDL_PER_MMOL : value;

const fromMgdl = (mgdl: number, unit: GlucoseUnit) =>
  unit === "mmol" ? String(Math.round((mgdl / MGDL_PER_MMOL) * 10) / 10) : String(Math.round(mgdl));

type TableParams = { isf: number; low: number; high: number };

/** Row of the sheet the glucose falls in: -1 below range, 0 in range, 1+ above. */
function correctionSteps(glucose: number, { isf, low, high }: TableParams) {
  if (glucose > high) return Math.ceil((glucose - high) / isf);
  if (glucose < low) return -1;
  return 0;
}

/**
 * Units from the sheet. With carbs, each ratio-sized portion adds 1 U on top
 * of the row's correction. In the 0 g column the sheet is one unit more
 * conservative (pure correction without a meal).
 */
function tableDose(carbSteps: number, steps: number) {
  return carbSteps === 0 ? Math.max(0, steps - 1) : Math.max(0, carbSteps + steps);
}

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
  const [ratio, setRatio] = useState(String(DEFAULT_RATIO_G));
  const [sensitivity, setSensitivity] = useState(fromMgdl(DEFAULT_ISF_MGDL, unit));
  const [rangeLow, setRangeLow] = useState(fromMgdl(DEFAULT_RANGE_LOW_MGDL, unit));
  const [rangeHigh, setRangeHigh] = useState(fromMgdl(DEFAULT_RANGE_HIGH_MGDL, unit));
  const [iob, setIob] = useState("0");
  const [manualGlucose, setManualGlucose] = useState("");

  if (fieldUnit !== unit) {
    const convert = (s: string) => {
      const n = parse(s);
      return Number.isNaN(n) ? s : fromMgdl(toMgdl(n, fieldUnit), unit);
    };
    setFieldUnit(unit);
    setSensitivity(convert(sensitivity));
    setRangeLow(convert(rangeLow));
    setRangeHigh(convert(rangeHigh));
    setManualGlucose(convert(manualGlucose));
  }

  const glucoseMgdl = currentMgdl ?? toMgdl(parse(manualGlucose), unit);
  const carbsG = Math.max(0, parse(carbs) || 0);
  const ratioG = parse(ratio);
  const params: TableParams = {
    isf: toMgdl(parse(sensitivity), unit),
    low: toMgdl(parse(rangeLow), unit),
    high: toMgdl(parse(rangeHigh), unit),
  };
  const iobU = Math.max(0, parse(iob) || 0);

  const paramsValid = ratioG > 0 && params.isf > 0 && params.low > 0 && params.high >= params.low;
  const hasGlucose = Number.isFinite(glucoseMgdl) && glucoseMgdl > 0;
  const ready = paramsValid && hasGlucose;

  const isHypo = ready && glucoseMgdl < settings.lowThreshold;
  // Small epsilon so 14 / 7 doesn't floor to 1.999…
  const carbSteps = ready ? Math.floor(carbsG / ratioG + 1e-9) : 0;
  const steps = ready ? correctionSteps(glucoseMgdl, params) : 0;
  const sheetDose = ready ? tableDose(carbSteps, steps) : 0;
  const correction = sheetDose - carbSteps;
  const iobApplied = Math.min(iobU, sheetDose);
  const total = isHypo ? 0 : roundDownHalf(Math.max(0, sheetDose - iobU));

  const carbsNeeded = isHypo
    ? Math.max(15, Math.ceil(((params.low - glucoseMgdl) * ratioG) / params.isf))
    : 0;

  const fmtU = (n: number) => `${n > 0 ? "+" : ""}${(Math.round(n * 10) / 10).toFixed(1)} ${t.units}`;
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
              className="flex min-w-0 flex-col justify-between gap-3 rounded-2xl bg-sidebar-accent p-3 sm:p-4"
            >
              <h3 id={`${ids}-current`} className={sectionTitle}>
                {t.currentGlucose}
              </h3>
              {currentMgdl !== null ? (
                <div className="flex flex-col gap-2">
                  <p className="flex items-baseline gap-1.5 text-3xl font-semibold tabular-nums sm:text-4xl">
                    {formatGlucose(currentMgdl, unit)}
                    <span className="text-sm font-normal text-sidebar-foreground/70 sm:text-base">
                      {glucoseUnit}
                    </span>
                  </p>
                  {isStale && (
                    <p className="flex items-start gap-1.5 text-xs text-amber-500 sm:text-sm">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      {t.staleWarning}
                    </p>
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
            </div>
          </div>
          <p id={`${ids}-carbs-hint`} className="px-1 text-xs text-sidebar-foreground/60">
            {t.carbsHint}
          </p>
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
                </dl>
              </div>

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
            activeSteps={ready && !isHypo ? Math.min(steps, MAX_CORRECTION_STEPS) : null}
            activeCarbSteps={ready && !isHypo ? Math.min(carbSteps, MAX_CARB_STEPS) : null}
          />
        )}

        <fieldset className="flex min-w-0 flex-col gap-4 rounded-2xl border border-highlight/25 bg-sidebar-accent/40 p-3 sm:p-4">
          <legend className={`${sectionTitle} px-1`}>{t.parameters}</legend>
          <div className="grid grid-cols-2 items-start gap-3 sm:grid-cols-6 sm:gap-4">
            <NumberField
              lockable={lockLabels}
              id={`${ids}-low`}
              label={t.rangeLow}
              suffix={glucoseUnit}
              value={rangeLow}
              onChange={setRangeLow}
              step={glucoseStep}
              className="sm:col-span-3"
            />
            <NumberField
              lockable={lockLabels}
              id={`${ids}-high`}
              label={t.rangeHigh}
              suffix={glucoseUnit}
              value={rangeHigh}
              onChange={setRangeHigh}
              step={glucoseStep}
              className="sm:col-span-3"
            />
            <NumberField
              lockable={lockLabels}
              id={`${ids}-ratio`}
              label={t.ratio}
              hint={t.ratioHint}
              suffix={`${t.grams} ${t.perUnit}`}
              value={ratio}
              onChange={setRatio}
              step="0.5"
              compactHint
              className="sm:col-span-2"
            />
            <NumberField
              lockable={lockLabels}
              id={`${ids}-isf`}
              label={t.sensitivity}
              hint={t.sensitivityHint}
              suffix={`${glucoseUnit} ${t.perUnit}`}
              value={sensitivity}
              onChange={setSensitivity}
              step={glucoseStep}
              compactHint
              className="sm:col-span-2"
            />
            <NumberField
              lockable={lockLabels}
              id={`${ids}-iob`}
              label={t.iob}
              hint={t.iobHint}
              suffix={t.units}
              value={iob}
              onChange={setIob}
              step="0.5"
              compactHint
              className="col-span-2"
            />
          </div>
          <p className="text-xs text-sidebar-foreground/60">{t.sessionNote}</p>
        </fieldset>

        <p className="flex items-start gap-2 text-xs leading-relaxed text-sidebar-foreground/60">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {t.disclaimer}
        </p>
      </div>
    </Modal>
  );
}

// Row zone colors, matching the glucose chart's palette.
const ZONE_LOW = "#ef4444"; // below the target range
const ZONE_IN = "var(--color-lime-500)"; // in range
const ZONE_HIGH = "#f59e0b"; // above range
const ZONE_VERY_HIGH = "#ef4444"; // top correction rows

function zoneColor(steps: number) {
  if (steps < 0) return ZONE_LOW;
  if (steps === 0) return ZONE_IN;
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
  params: TableParams;
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

  const rows: { steps: number; label: string }[] = [];
  if (params.low - step > lowThreshold) {
    rows.push({ steps: -1, label: `${fmt(lowThreshold + step)}–${fmt(params.low - step)}` });
  }
  rows.push({ steps: 0, label: `${fmt(params.low)}–${fmt(params.high)}` });
  for (let k = 1; k < MAX_CORRECTION_STEPS; k++) {
    const from = params.high + (k - 1) * params.isf + step;
    const to = params.high + k * params.isf;
    rows.push({ steps: k, label: `${fmt(from)}–${fmt(to)}` });
  }
  rows.push({
    steps: MAX_CORRECTION_STEPS,
    label: `${fmt(params.high + (MAX_CORRECTION_STEPS - 1) * params.isf + step)}+`,
  });

  const columns = Array.from({ length: MAX_CARB_STEPS + 1 }, (_, c) => c);
  const maxDose = tableDose(MAX_CARB_STEPS, MAX_CORRECTION_STEPS);

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
    { color: ZONE_LOW, label: t.zoneLow },
    { color: ZONE_IN, label: t.zoneInRange },
    { color: ZONE_HIGH, label: t.zoneHigh },
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
        {/* Horizontal scroll only — all rows fit, so no nested vertical scroll. */}
        <div ref={scrollRef} className="overflow-x-auto overscroll-x-contain rounded-xl border border-sidebar-border bg-sidebar">
          <table className="w-full border-separate border-spacing-0 text-center text-xs tabular-nums sm:text-sm">
            <caption className="sr-only">{t.tableTitle}</caption>
            <thead>
              <tr>
                <th
                  scope="col"
                  className="sticky left-0 z-20 border-b border-r border-sidebar-border bg-sidebar px-3 py-2 text-left align-bottom font-normal shadow-[4px_0_6px_-4px_rgba(0,0,0,0.5)]"
                >
                  <span className="block text-[10px] leading-tight text-sidebar-foreground/60">
                    {t.tableCarbsAxis.replace("{unit}", t.grams)}
                  </span>
                  <span className="block text-[10px] font-semibold leading-tight text-highlight">
                    {t.tableGlucoseAxis.replace("{unit}", unitLabel(unit))}
                  </span>
                </th>
                {columns.map((c) => (
                  <th
                    key={c}
                    scope="col"
                    className={`min-w-9 border-b border-sidebar-border px-1 py-2 align-bottom font-semibold ${
                      c === activeCarbSteps ? "bg-highlight/20 text-highlight" : "text-sidebar-foreground/70"
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
                      className={`sticky left-0 z-10 whitespace-nowrap border-b border-r border-sidebar-border px-3 py-2 text-left font-medium shadow-[4px_0_6px_-4px_rgba(0,0,0,0.5)] ${
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
                      const dose = tableDose(c, row.steps);
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
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-sidebar-foreground/60">
          <span>{t.tableUnitsNote}</span>
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

function ResultRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
      <dt className="text-xs text-sidebar-foreground/70 sm:text-sm">{label}</dt>
      <dd className="text-base font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function NumberField({
  id,
  label,
  hint,
  suffix,
  value,
  onChange,
  step,
  large,
  compactHint,
  lockable,
  className = "",
}: {
  id: string;
  label: string;
  hint?: string;
  suffix: string;
  value: string;
  onChange: (v: string) => void;
  step: string;
  large?: boolean;
  compactHint?: boolean;
  /** Starts read-only with an edit button (labels for the edit/done buttons). */
  lockable?: { edit: string; done: string };
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  // Lockable fields start locked; the state resets whenever the popup reopens
  // because the modal unmounts its content when closed.
  const [editing, setEditing] = useState(false);
  const locked = !!lockable && !editing;

  const unlock = () => {
    setEditing(true);
    // Focus after React re-renders the input without readOnly.
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="truncate text-sm font-medium" title={label}>
        {label}
      </label>
      <div
        className={`flex items-center gap-2 rounded-xl border border-transparent px-3 transition-colors ${
          locked
            ? "bg-sidebar-accent/50"
            : "bg-sidebar-accent focus-within:border-highlight focus-within:ring-2 focus-within:ring-highlight/40"
        }`}
      >
        <input
          ref={inputRef}
          id={id}
          type="number"
          inputMode="decimal"
          min="0"
          step={step}
          value={value}
          readOnly={locked}
          onChange={(e) => onChange(e.target.value)}
          onFocus={(e) => {
            if (!locked) e.target.select();
          }}
          onKeyDown={(e) => {
            if (lockable && e.key === "Enter") setEditing(false);
          }}
          aria-describedby={hint ? `${id}-hint` : undefined}
          className={`w-full min-w-0 bg-transparent py-2.5 tabular-nums outline-none ${
            large ? "text-2xl font-semibold" : "text-base"
          } ${locked ? "cursor-default text-sidebar-foreground/70" : ""}`}
        />
        <span className="shrink-0 text-sm text-sidebar-foreground/60">{suffix}</span>
        {lockable && (
          <button
            type="button"
            onClick={locked ? unlock : () => setEditing(false)}
            aria-label={locked ? `${lockable.edit} ${label}` : lockable.done}
            title={locked ? lockable.edit : lockable.done}
            className="-mr-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sidebar-foreground/60 transition hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground"
          >
            {locked ? (
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Check className="h-4 w-4 text-highlight" aria-hidden="true" />
            )}
          </button>
        )}
      </div>
      {hint && (
        <p
          id={`${id}-hint`}
          className={`text-xs text-sidebar-foreground/60 ${compactHint ? "hidden sm:block" : ""}`}
        >
          {hint}
        </p>
      )}
    </div>
  );
}
