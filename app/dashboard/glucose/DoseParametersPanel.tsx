"use client";

import { useId, useState, useTransition } from "react";
import { Check } from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";
import { saveDoseParams } from "@/lib/glucose/actions";
import {
  type DoseParams,
  type GlucoseSettings,
  doseParamsFor,
  isValidDoseParams,
  unitLabel,
} from "@/lib/glucose/types";
import { mgdlToMmol, toMgdl } from "@/lib/health-formulas";
import NumberField from "./NumberField";

const parse = (s: string) => {
  const n = Number.parseFloat(s.replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};

const display = (mgdl: number, unit: GlucoseSettings["unit"]) =>
  unit === "mmol" ? String(mgdlToMmol(mgdl)) : String(Math.round(mgdl));

type Props = {
  settings: GlucoseSettings;
  /** Human name of the active sensor, shown in the title. */
  sensorName: string;
  onSaved: (settings: GlucoseSettings) => void;
};

/**
 * Insulin dosing parameters for the active glucose sensor. They live here
 * (not in the dose calculator) because they change with the sensor and pump
 * setup. Only the owner can edit them; watchers see them read-only.
 */
export default function DoseParametersPanel({ settings, sensorName, onSaved }: Props) {
  const { dict } = useI18n();
  const t = dict.glucose.calculator;
  const ids = useId();
  const unit = settings.unit;
  const isOwner = settings.role === "owner";
  const saved = doseParamsFor(settings);

  const initial = {
    low: display(saved.low, unit),
    high: display(saved.high, unit),
    ratio: String(saved.ratio),
    isf: display(saved.isf, unit),
  };
  const [low, setLow] = useState(initial.low);
  const [high, setHigh] = useState(initial.high);
  const [ratio, setRatio] = useState(initial.ratio);
  const [isf, setIsf] = useState(initial.isf);
  const [error, setError] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [, startTransition] = useTransition();

  const next: DoseParams = {
    low: toMgdl(parse(low), unit),
    high: toMgdl(parse(high), unit),
    ratio: parse(ratio),
    isf: toMgdl(parse(isf), unit),
  };
  const valid = isValidDoseParams(next);
  const dirty =
    low !== initial.low || high !== initial.high || ratio !== initial.ratio || isf !== initial.isf;

  const touch = (set: (v: string) => void) => (v: string) => {
    set(v);
    setError(false);
    setJustSaved(false);
  };

  // Confirming a field (check button or Enter) saves; invalid values keep the field open.
  const commit = () => {
    if (!valid) return false;
    if (!dirty) return true;
    startTransition(async () => {
      const result = await saveDoseParams(settings.source, next);
      if (result.ok) {
        setJustSaved(true);
        onSaved(result.settings);
      } else {
        setError(true);
      }
    });
    return true;
  };

  const glucoseUnit = unitLabel(unit);
  const glucoseStep = unit === "mmol" ? "0.1" : "1";
  const lockLabels = { edit: t.edit, done: t.done };
  const readOnly = !isOwner;

  return (
    <fieldset className="col-span-2 order-3 flex min-w-0 flex-col gap-4 rounded-2xl border border-highlight/25 bg-sidebar-accent/40 p-4">
      <legend className="flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-sidebar-foreground/70 before:h-3 before:w-1 before:shrink-0 before:rounded-full before:bg-highlight before:content-['']">
        {t.paramsFor.replace("{sensor}", sensorName)}
      </legend>

      <div className="grid grid-cols-2 items-start gap-3 sm:grid-cols-4 sm:gap-4">
        <NumberField
          id={`${ids}-low`}
          label={t.rangeLow}
          suffix={glucoseUnit}
          value={low}
          onChange={touch(setLow)}
          step={glucoseStep}
          lockable={lockLabels}
          readOnly={readOnly}
          onCommit={commit}
        />
        <NumberField
          id={`${ids}-high`}
          label={t.rangeHigh}
          suffix={glucoseUnit}
          value={high}
          onChange={touch(setHigh)}
          step={glucoseStep}
          lockable={lockLabels}
          readOnly={readOnly}
          onCommit={commit}
        />
        <NumberField
          id={`${ids}-ratio`}
          label={t.ratio}
          hint={t.ratioHint}
          suffix={`${t.grams} ${t.perUnit}`}
          value={ratio}
          onChange={touch(setRatio)}
          step="0.5"
          lockable={lockLabels}
          readOnly={readOnly}
          onCommit={commit}
          compactHint
        />
        <NumberField
          id={`${ids}-isf`}
          label={t.sensitivity}
          hint={t.sensitivityHint}
          suffix={`${glucoseUnit} ${t.perUnit}`}
          value={isf}
          onChange={touch(setIsf)}
          step={glucoseStep}
          lockable={lockLabels}
          readOnly={readOnly}
          onCommit={commit}
          compactHint
        />
      </div>

      {!valid && dirty && (
        <p role="alert" className="text-xs text-destructive">
          {t.invalid}
        </p>
      )}

      {isOwner ? (
        <span role="status" aria-live="polite" className="text-xs empty:hidden">
          {justSaved && !dirty && (
            <span className="flex items-center gap-1 text-highlight">
              <Check className="h-4 w-4" aria-hidden="true" />
              {t.saved}
            </span>
          )}
          {error && <span className="text-destructive">{t.saveError}</span>}
        </span>
      ) : (
        <p className="text-xs text-sidebar-foreground/60">{t.paramsOwnerOnly}</p>
      )}

      <p className="text-xs text-sidebar-foreground/60">{t.paramsSavedPerSensor}</p>
    </fieldset>
  );
}
