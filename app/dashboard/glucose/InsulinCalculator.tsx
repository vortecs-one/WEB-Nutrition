"use client";

import { useId, useState } from "react";
import { AlertTriangle, ChevronDown, Info } from "lucide-react";
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
  const glucoseStep = unit === "mmol" ? "0.1" : "1";

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t.title}>
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:items-start">
          <section
            aria-labelledby={`${ids}-current`}
            className="flex flex-col gap-2 rounded-2xl bg-sidebar-accent p-4"
          >
          
          <h3
            id={`${ids}-current`}
            className="text-xs font-semibold uppercase tracking-wide text-sidebar-foreground/70"
          >
            {t.currentGlucose}
          </h3>
          {currentMgdl !== null ? (
            <p className="text-3xl font-semibold tabular-nums">
              {formatGlucose(currentMgdl, unit)}{" "}
              <span className="text-base font-normal text-sidebar-foreground/70">{glucoseUnit}</span>
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-sidebar-foreground/70">{t.noReading}</p>
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
          {currentMgdl !== null && isStale && (
            <p className="flex items-start gap-2 text-sm text-amber-500">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {t.staleWarning}
            </p>
          )}
          </section>

          <div className="flex flex-col">
            <NumberField
              id={`${ids}-carbs`}
          label={t.carbsToEat}
          hint={t.carbsHint}
          suffix={t.grams}
          value={carbs}
          onChange={setCarbs}
                        step="1"
              large
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:items-start">
          <section aria-labelledby={`${ids}-result`} aria-live="polite" className="flex flex-col gap-3">
          <h3
            id={`${ids}-result`}
            className="text-xs font-semibold uppercase tracking-wide text-sidebar-foreground/70"
          >
            {t.resultTitle}
          </h3>

          {!ready ? (
            <p className="rounded-2xl bg-sidebar-accent p-4 text-sm text-sidebar-foreground/70">
              {hasGlucose ? t.invalid : t.noReading}
            </p>
          ) : isHypo ? (
            <div role="alert" className="flex flex-col gap-2 rounded-2xl bg-destructive/15 p-4 text-destructive">
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
            <div className="flex flex-col gap-3">
              <div className="flex items-end justify-between gap-4 rounded-2xl bg-primary p-4 text-primary-foreground">
                <span className="text-sm font-medium">{t.totalDose}</span>
                <span className="text-4xl font-semibold tabular-nums leading-none">
                  {total.toFixed(1)}
                  <span className="ml-1 text-lg font-medium">{t.units}</span>
                </span>
              </div>

              <dl className="flex flex-col gap-2 rounded-2xl bg-sidebar-accent p-4 text-sm">
                <ResultRow label={t.carbDose} value={fmtU(carbSteps)} />
                <ResultRow label={t.correctionDose} value={fmtU(correction)} />
                {iobApplied > 0 && <ResultRow label={t.iobDeduction} value={fmtU(-iobApplied)} />}
              </dl>

              {carbsG > 0 && carbsG % ratioG > 1e-9 && (
                <p className="text-xs text-sidebar-foreground/60">
                  {t.carbsRounded.replace("{grams}", String(carbSteps * ratioG))}
                </p>
              )}

              {total === 0 && <p className="text-sm text-sidebar-foreground/70">{t.noInsulinNeeded}</p>}
            </div>
          )}
        </section>

          {paramsValid && (
            <div className="sm:col-span-2">
              <DoseTable
                ratio={ratioG}
                params={params}
                lowThreshold={settings.lowThreshold}
                unit={unit}
                activeSteps={ready && !isHypo ? Math.min(steps, MAX_CORRECTION_STEPS) : null}
                activeCarbSteps={ready && !isHypo ? Math.min(carbSteps, MAX_CARB_STEPS) : null}
              />
            </div>
          )}

          <fieldset className="flex flex-col gap-3 sm:col-start-2">
          <legend className="mb-3 text-xs font-semibold uppercase tracking-wide text-sidebar-foreground/70">
            {t.parameters}
          </legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <NumberField
              id={`${ids}-ratio`}
              label={t.ratio}
              hint={t.ratioHint}
              suffix={`${t.grams} ${t.perUnit}`}
              value={ratio}
              onChange={setRatio}
              step="0.5"
            />
            <NumberField
              id={`${ids}-isf`}
              label={t.sensitivity}
              hint={t.sensitivityHint}
              suffix={`${glucoseUnit} ${t.perUnit}`}
              value={sensitivity}
              onChange={setSensitivity}
              step={glucoseStep}
            />
            <NumberField
              id={`${ids}-low`}
              label={t.rangeLow}
              suffix={glucoseUnit}
              value={rangeLow}
              onChange={setRangeLow}
              step={glucoseStep}
            />
            <NumberField
              id={`${ids}-high`}
              label={t.rangeHigh}
              suffix={glucoseUnit}
              value={rangeHigh}
              onChange={setRangeHigh}
              step={glucoseStep}
            />
            <NumberField
              id={`${ids}-iob`}
              label={t.iob}
              hint={t.iobHint}
              suffix={t.units}
              value={iob}
              onChange={setIob}
              step="0.5"
            />
          </div>
          <p className="text-xs text-sidebar-foreground/60">{t.sessionNote}</p>
          </fieldset>
        </div>

        <p className="flex items-start gap-2 text-xs leading-relaxed text-sidebar-foreground/60">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {t.disclaimer}
        </p>
      </div>
    </Modal>
  );
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

  return (
    <details className="group rounded-2xl bg-sidebar-accent">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 text-sm font-medium [&::-webkit-details-marker]:hidden">
        {t.tableTitle}
        <ChevronDown
          className="h-4 w-4 shrink-0 text-sidebar-foreground/60 transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div className="flex flex-col gap-3 px-4 pb-4">
        <p className="text-xs leading-relaxed text-sidebar-foreground/60">{t.tableHint}</p>
        <div className="overflow-x-auto rounded-xl border border-sidebar-border">
          <table className="w-full border-collapse text-center text-xs tabular-nums">
            <caption className="sr-only">{t.tableTitle}</caption>
            <thead>
              <tr className="bg-sidebar">
                <th scope="col" className="sticky left-0 bg-sidebar px-2 py-1.5 text-left font-semibold">
                  {unitLabel(unit)} / {t.grams}
                </th>
                {columns.map((c) => (
                  <th
                    key={c}
                    scope="col"
                    className={`px-1.5 py-1.5 font-semibold ${
                      c === activeCarbSteps ? "text-primary" : "text-sidebar-foreground/70"
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
                  <tr key={row.steps} className="border-t border-sidebar-border">
                    <th
                      scope="row"
                      className={`sticky left-0 whitespace-nowrap px-2 py-1.5 text-left font-medium ${
                        rowActive ? "bg-sidebar text-primary" : "bg-sidebar text-sidebar-foreground/70"
                      }`}
                    >
                      {row.label}
                    </th>
                    {columns.map((c) => {
                      const active = rowActive && c === activeCarbSteps;
                      const crossed = rowActive || c === activeCarbSteps;
                      return (
                        <td
                          key={c}
                          aria-current={active ? "true" : undefined}
                          className={`px-1.5 py-1.5 ${
                            active
                              ? "bg-primary font-semibold text-primary-foreground"
                              : crossed
                                ? "bg-primary/10"
                                : ""
                          }`}
                        >
                          {tableDose(c, row.steps)}
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
    </details>
  );
}

function ResultRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-sidebar-foreground/70">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
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
}: {
  id: string;
  label: string;
  hint?: string;
  suffix: string;
  value: string;
  onChange: (v: string) => void;
  step: string;
  large?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <div className="flex items-center gap-2 rounded-xl bg-sidebar-accent px-3 focus-within:ring-2 focus-within:ring-primary">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min="0"
          step={step}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={(e) => e.target.select()}
          aria-describedby={hint ? `${id}-hint` : undefined}
          className={`w-full min-w-0 bg-transparent py-2.5 tabular-nums outline-none ${
            large ? "text-2xl font-semibold" : "text-base"
          }`}
        />
        <span className="shrink-0 text-sm text-sidebar-foreground/60">{suffix}</span>
      </div>
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-sidebar-foreground/60">
          {hint}
        </p>
      )}
    </div>
  );
}
