"use client";

import { useId, useState } from "react";
import { AlertTriangle, Info } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { useI18n } from "@/lib/i18n/provider";
import {
  type GlucoseSettings,
  type GlucoseUnit,
  formatGlucose,
  unitLabel,
} from "@/lib/glucose/types";

const MGDL_PER_MMOL = 18.0182;

// Insulin pens/pumps commonly dose in half units. Rounding down errs on the
// side of less insulin, which is the safer failure mode.
const roundDownHalf = (u: number) => Math.floor(u * 2) / 2;

const parse = (s: string) => {
  const n = Number.parseFloat(s.replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};

const toMgdl = (value: number, unit: GlucoseUnit) =>
  unit === "mmol" ? value * MGDL_PER_MMOL : value;

const fromMgdl = (mgdl: number, unit: GlucoseUnit) =>
  unit === "mmol" ? String(Math.round((mgdl / MGDL_PER_MMOL) * 10) / 10) : String(Math.round(mgdl));

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
  const defaultTargetMgdl = Math.round((settings.targetLow + settings.targetHigh) / 2 / 5) * 5;
  const [fieldUnit, setFieldUnit] = useState<GlucoseUnit>(unit);
  const [carbs, setCarbs] = useState("0");
  const [ratio, setRatio] = useState("10");
  const [sensitivity, setSensitivity] = useState(fromMgdl(50, unit));
  const [target, setTarget] = useState(fromMgdl(defaultTargetMgdl, unit));
  const [iob, setIob] = useState("0");
  const [manualGlucose, setManualGlucose] = useState("");

  // Re-express glucose fields when the display unit toggles.
  if (fieldUnit !== unit) {
    const convert = (s: string) => {
      const n = parse(s);
      return Number.isNaN(n) ? s : fromMgdl(toMgdl(n, fieldUnit), unit);
    };
    setFieldUnit(unit);
    setSensitivity(convert(sensitivity));
    setTarget(convert(target));
    setManualGlucose(convert(manualGlucose));
  }

  const glucoseMgdl = currentMgdl ?? toMgdl(parse(manualGlucose), unit);
  const carbsG = Math.max(0, parse(carbs) || 0);
  const ratioG = parse(ratio);
  const isfMgdl = toMgdl(parse(sensitivity), unit);
  const targetMgdl = toMgdl(parse(target), unit);
  const iobU = Math.max(0, parse(iob) || 0);

  const paramsValid = ratioG > 0 && isfMgdl > 0 && targetMgdl > 0;
  const hasGlucose = Number.isFinite(glucoseMgdl) && glucoseMgdl > 0;
  const ready = paramsValid && hasGlucose;

  const isHypo = ready && glucoseMgdl < settings.lowThreshold;
  const carbDose = ready ? carbsG / ratioG : 0;
  const rawCorrection = ready ? (glucoseMgdl - targetMgdl) / isfMgdl : 0;
  // Insulin on board only offsets a positive correction; below target the
  // negative correction trims the meal dose instead.
  const correction = rawCorrection > 0 ? Math.max(0, rawCorrection - iobU) : rawCorrection;
  const iobApplied = rawCorrection > 0 ? Math.min(iobU, rawCorrection) : 0;
  const total = isHypo ? 0 : roundDownHalf(Math.max(0, carbDose + correction));

  // Grams that raise glucose back to target: deficit / (ISF / ICR).
  const carbsNeeded =
    ready && glucoseMgdl < targetMgdl ? Math.ceil(((targetMgdl - glucoseMgdl) * ratioG) / isfMgdl) : 0;
  const uncoveredCarbs = Math.max(0, carbsNeeded - carbsG);

  const fmtU = (n: number) => `${(Math.round(n * 10) / 10).toFixed(1)} ${t.units}`;
  const glucoseUnit = unitLabel(unit);
  const glucoseStep = unit === "mmol" ? "0.1" : "1";

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t.title}>
      <div className="flex flex-col gap-5">
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

        <fieldset className="flex flex-col gap-3">
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
              id={`${ids}-target`}
              label={t.target}
              suffix={glucoseUnit}
              value={target}
              onChange={setTarget}
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
              {carbsNeeded > 0 && (
                <p className="text-sm">
                  {t.carbsNeeded}:{" "}
                  <span className="font-semibold tabular-nums">
                    {Math.max(15, carbsNeeded)} {t.grams}
                  </span>
                </p>
              )}
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
                <ResultRow label={t.carbDose} value={fmtU(carbDose)} />
                <ResultRow label={t.correctionDose} value={fmtU(rawCorrection)} />
                {iobApplied > 0 && <ResultRow label={t.iobDeduction} value={`- ${fmtU(iobApplied)}`} />}
              </dl>

              {total === 0 && <p className="text-sm text-sidebar-foreground/70">{t.noInsulinNeeded}</p>}

              {uncoveredCarbs > 0 && (
                <div className="flex flex-col gap-1 rounded-2xl bg-amber-500/15 p-4 text-amber-500">
                  <p className="text-sm font-semibold">{t.lowTitle}</p>
                  <p className="text-sm">
                    {t.carbsNeeded}:{" "}
                    <span className="font-semibold tabular-nums">
                      {uncoveredCarbs} {t.grams}
                    </span>
                  </p>
                </div>
              )}
            </div>
          )}
        </section>

        <p className="flex items-start gap-2 text-xs leading-relaxed text-sidebar-foreground/60">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {t.disclaimer}
        </p>
      </div>
    </Modal>
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
