"use client";

import { useId, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Camera,
  Check,
  ExternalLink,
  Loader2,
  ScanText,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";
import {
  completeFoodProduct,
  registerFoodProduct,
  uploadFoodPhoto,
} from "@/lib/foods/actions";
import { extractFromProductPhotos } from "@/lib/foods/photo-extract";
import { readLabelWithAi, type LabelField } from "@/lib/foods/label-vision";
import { checkNutrition, deriveSaltSodium, type NutritionWarning } from "@/lib/foods/nutrition-checks";
import { preparePhoto } from "@/lib/foods/prepare-photo";
import type {
  ExtractSource,
  FoodPhotoKind,
  FoodProductPatch,
  FoodWriteFailure,
  NutrimentKey,
  NutritionBasis,
  ProductExtraction,
} from "@/lib/foods/types";

type Step = "name" | "photos" | "review" | "done";

type PhotoState =
  | { status: "idle" }
  | { status: "uploading"; preview: string }
  | { status: "done"; preview: string; imgid: number | null }
  | { status: "error"; message: string; retry?: { file: File; preview: string } };

type TextField = "brand" | "quantity" | "servingSize" | "ingredients";
type ListField = "categories" | "labels";

const inputClass =
  "w-full rounded-xl border border-border bg-background px-3 min-h-11 text-base outline-none focus:ring-2 focus:ring-ring";
const primaryBtn =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90 active:scale-95 disabled:opacity-50 disabled:active:scale-100";
const secondaryBtn =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-muted px-4 text-sm font-semibold text-foreground transition hover:bg-accent active:scale-95 disabled:opacity-50";

const PHOTO_KINDS: FoodPhotoKind[] = ["front", "nutrition", "ingredients", "packaging"];

// Open Food Facts country tag from the browser's region ("es-CL" -> "en:chile").
function localeCountry(): string[] {
  try {
    const region = new Intl.Locale(navigator.language).maximize().region;
    if (!region) return [];
    const name = new Intl.DisplayNames(["en"], { type: "region" }).of(region);
    return name ? [`en:${name.toLowerCase().replace(/\s+/g, "-")}`] : [];
  } catch {
    return [];
  }
}

const parseNum = (raw: string | undefined) => {
  const n = parseFloat((raw ?? "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};

export default function ContributeProduct({
  barcode,
  startAt = "details",
  onDone,
  onCancel,
}: {
  barcode: string;
  // "photos" skips creation for a product that already exists (e.g. a found
  // product that has no image yet).
  startAt?: "details" | "photos";
  onDone: () => void;
  onCancel: () => void;
}) {
  const { dict, locale } = useI18n();
  const t = dict.nutritionUser;
  const formId = useId();

  const [step, setStep] = useState<Step>(startAt === "photos" ? "photos" : "name");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [name, setName] = useState("");

  const [photos, setPhotos] = useState<Record<FoodPhotoKind, PhotoState>>({
    front: { status: "idle" },
    nutrition: { status: "idle" },
    ingredients: { status: "idle" },
    packaging: { status: "idle" },
  });

  const [text, setText] = useState<Record<TextField, string>>({
    brand: "",
    quantity: "",
    servingSize: "",
    ingredients: "",
  });
  const [lists, setLists] = useState<Record<ListField, string[]>>({ categories: [], labels: [] });
  const [basis, setBasis] = useState<NutritionBasis>("100g");
  const [nutriments, setNutriments] = useState<Partial<Record<NutrimentKey, string>>>({});
  const [sources, setSources] = useState<Record<string, ExtractSource>>({});

  const [reading, setReading] = useState<"idle" | "off" | "ai">("idle");
  const [readMessage, setReadMessage] = useState<string | null>(null);
  const [aiTried, setAiTried] = useState(false);

  const failureText = (reason: FoodWriteFailure, detail?: string) => {
    switch (reason) {
      case "exists":
        return t.contributeErrExists;
      case "invalid":
        return detail ? `${t.contributeErrInvalid} (${detail})` : t.contributeErrInvalid;
      case "rejected":
        return t.contributeErrRejected;
      case "unavailable":
        return t.contributeErrUnavailable;
      case "not-found":
        return t.contributeErrNotFound;
      default:
        return t.contributeErrGeneric;
    }
  };

  const nutrientFields: { key: NutrimentKey; label: string; unit: string }[] = [
    { key: "energy-kcal", label: t.nutrEnergy, unit: "kcal" },
    { key: "energy-kj", label: t.nutrEnergy, unit: "kJ" },
    { key: "fat", label: t.nutrFat, unit: t.unitG },
    { key: "saturated-fat", label: t.nutrSatFat, unit: t.unitG },
    { key: "carbohydrates", label: t.nutrCarbs, unit: t.unitG },
    { key: "sugars", label: t.nutrSugars, unit: t.unitG },
    { key: "fiber", label: t.nutrFiber, unit: t.unitG },
    { key: "proteins", label: t.nutrProtein, unit: t.unitG },
    { key: "salt", label: t.nutrSalt, unit: t.unitG },
    { key: "sodium", label: t.nutrSodium, unit: "mg" },
  ];

  const numericValues = useMemo(() => {
    const out: Partial<Record<NutrimentKey, number>> = {};
    for (const [k, v] of Object.entries(nutriments)) {
      const n = parseNum(v);
      if (n != null) out[k as NutrimentKey] = n;
    }
    return out;
  }, [nutriments]);

  const warnings = useMemo(() => checkNutrition(numericValues, basis), [numericValues, basis]);
  const warningText: Record<NutritionWarning, string> = {
    over100: t.warnOver100,
    satFatOverFat: t.warnSatFat,
    sugarsOverCarbs: t.warnSugars,
    energyMismatch: t.warnEnergy,
    saltSodiumMismatch: t.warnSaltSodium,
  };
  const warnedKeys = new Set<NutrimentKey>(
    warnings.flatMap((w): NutrimentKey[] =>
      w === "satFatOverFat"
        ? ["saturated-fat"]
        : w === "sugarsOverCarbs"
          ? ["sugars"]
          : w === "energyMismatch"
            ? ["energy-kcal"]
            : w === "saltSodiumMismatch"
              ? ["salt", "sodium"]
              : [],
    ),
  );

  const uploaded = PHOTO_KINDS.flatMap((kind) => {
    const s = photos[kind];
    return s.status === "done" && s.imgid ? [{ kind, imgid: s.imgid }] : [];
  });
  const anyUploading = PHOTO_KINDS.some((k) => photos[k].status === "uploading");

  // ---- Step 1: create the product (name only) -------------------------------

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setFormError(t.contributeNameRequired);
      return;
    }
    setBusy(true);
    setFormError(null);
    const res = await registerFoodProduct(
      barcode,
      { name, countries: localeCountry() },
      locale,
    ).catch(() => null);
    setBusy(false);
    // Someone else just created it: photos and the PATCH still apply.
    if (res?.ok || (res && !res.ok && res.reason === "exists")) {
      setStep("photos");
      return;
    }
    setFormError(failureText(res && !res.ok ? res.reason : "error", res && !res.ok ? res.message : undefined));
  };

  // ---- Step 2: photos -------------------------------------------------------

  const sendPhoto = async (kind: FoodPhotoKind, file: File, preview: string) => {
    setPhotos((p) => ({ ...p, [kind]: { status: "uploading", preview } }));
    const form = new FormData();
    form.append("barcode", barcode);
    form.append("kind", kind);
    form.append("lang", locale);
    form.append("image", file);
    const res = await uploadFoodPhoto(form).catch(() => null);
    setPhotos((p) => ({
      ...p,
      [kind]: res?.ok
        ? { status: "done", preview, imgid: res.imgid }
        : {
            status: "error",
            message: failureText(res && !res.ok ? res.reason : "error"),
            retry: { file, preview },
          },
    }));
  };

  const onPickSlot = async (kind: FoodPhotoKind, raw: File) => {
    const prepared = await preparePhoto(raw);
    if (!prepared.ok) {
      setPhotos((p) => ({
        ...p,
        [kind]: {
          status: "error",
          message: prepared.reason === "too-small" ? t.photoTooSmall : t.photoUnreadable,
        },
      }));
      return;
    }
    await sendPhoto(kind, prepared.file, URL.createObjectURL(prepared.file));
  };

  // ---- Step 3: read the photos ----------------------------------------------

  // Only fill fields the user hasn't typed into.
  const applyExtraction = (data: ProductExtraction) => {
    const nextSources: Record<string, ExtractSource> = {};
    const nextText = { ...text };
    for (const f of ["brand", "quantity", "servingSize", "ingredients"] as TextField[]) {
      const found = data[f];
      if (found && !text[f].trim()) {
        nextText[f] = found.value;
        nextSources[f] = found.source;
      }
    }
    const nextLists = { ...lists };
    for (const f of ["categories", "labels"] as ListField[]) {
      const found = data[f];
      if (found && lists[f].length === 0) {
        nextLists[f] = found.value;
        nextSources[f] = found.source;
      }
    }
    setText(nextText);
    setLists(nextLists);
    if (data.nutriments && Object.keys(numericValues).length === 0) {
      if (data.nutritionBasis) setBasis(data.nutritionBasis.value);
      const filled: Partial<Record<NutrimentKey, string>> = {};
      for (const [k, v] of Object.entries(data.nutriments)) {
        if (!v) continue;
        filled[k as NutrimentKey] = String(Math.round(v.value * 100) / 100);
        nextSources[k] = v.source;
      }
      setNutriments(filled);
    }
    setSources((s) => ({ ...s, ...nextSources }));
  };

  const missingFields = (): LabelField[] => {
    const out: LabelField[] = [];
    if (!text.brand.trim()) out.push("brand");
    if (!text.quantity.trim()) out.push("quantity");
    if (!text.servingSize.trim()) out.push("servingSize");
    if (!text.ingredients.trim() && uploaded.some((p) => p.kind === "ingredients")) {
      out.push("ingredients");
    }
    if (lists.categories.length === 0) out.push("categories");
    if (lists.labels.length === 0) out.push("labels");
    if (Object.keys(numericValues).length === 0 && uploaded.some((p) => p.kind === "nutrition")) {
      out.push("nutrition");
    }
    return out;
  };

  const onReadPhotos = async () => {
    setStep("review");
    if (uploaded.length === 0) return;
    setReading("off");
    setReadMessage(null);
    const res = await extractFromProductPhotos(barcode, uploaded, locale).catch(() => null);
    setReading("idle");
    if (res?.ok) {
      applyExtraction(res.data);
      setReadMessage(Object.keys(res.data).length ? t.readDone : t.readNothing);
    } else {
      setReadMessage(t.readNothing);
    }
  };

  const onTryAi = async () => {
    const missing = missingFields();
    if (missing.length === 0) return;
    setReading("ai");
    setReadMessage(null);
    const res = await readLabelWithAi(barcode, uploaded, missing, locale).catch(() => null);
    setReading("idle");
    setAiTried(true);
    if (res?.ok) {
      applyExtraction(res.data);
      setReadMessage(Object.keys(res.data).length ? t.aiDone : t.readNothing);
    } else {
      setReadMessage(res && !res.ok && res.reason === "quota" ? t.aiQuota : t.aiError);
    }
  };

  // ---- Step 4: submit -------------------------------------------------------

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFormError(null);
    const values = deriveSaltSodium(numericValues);
    const patch: FoodProductPatch = {
      brand: text.brand,
      quantity: text.quantity,
      servingSize: text.servingSize,
      ingredients: text.ingredients,
      categories: lists.categories,
      labels: lists.labels,
      ...(Object.keys(values).length > 0 && { nutriments: values, nutritionBasis: basis }),
    };
    const res = await completeFoodProduct(barcode, patch, locale).catch(() => null);
    setBusy(false);
    if (res?.ok) setStep("done");
    else setFormError(failureText(res && !res.ok ? res.reason : "error", res && !res.ok ? res.message : undefined));
  };

  const sourceBadge = (field: string) => {
    const s = sources[field];
    if (!s) return null;
    const label = s === "ai" ? t.sourceAi : s === "robotoff" ? t.sourceRobotoff : t.sourceOff;
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
          s === "ai" ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"
        }`}
      >
        {s === "ai" ? (
          <Sparkles className="h-3 w-3" aria-hidden="true" />
        ) : (
          <ScanText className="h-3 w-3" aria-hidden="true" />
        )}
        {label}
      </span>
    );
  };

  const steps: { id: Step; label: string }[] = [
    ...(startAt === "photos" ? [] : [{ id: "name" as Step, label: t.stepName }]),
    { id: "photos", label: t.stepPhotos },
    { id: "review", label: t.stepReview },
  ];
  const stepIndex = step === "done" ? steps.length : steps.findIndex((s) => s.id === step);

  return (
    <section
      aria-labelledby={`${formId}-title`}
      className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h3 id={`${formId}-title`} className="text-base font-semibold text-balance">
            {startAt === "photos" ? t.photosTitle : t.contributeTitle}
          </h3>
          <p className="text-xs text-muted-foreground">
            {t.barcodeLabel}: <span className="font-mono tabular-nums">{barcode}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={step === "done" ? onDone : onCancel}
          aria-label={t.contributeCancel}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-accent active:scale-95"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </header>

      <ol className="flex items-center gap-2 text-xs" aria-label={t.contributeTitle}>
        {steps.map((s, i) => (
          <li
            key={s.id}
            aria-current={i === stepIndex ? "step" : undefined}
            className={`flex flex-1 flex-col gap-1.5 ${i <= stepIndex ? "text-foreground" : "text-muted-foreground"}`}
          >
            <span className={`h-1 rounded-full ${i <= stepIndex ? "bg-primary" : "bg-muted"}`} />
            <span className="font-medium">{s.label}</span>
          </li>
        ))}
      </ol>

      {step === "name" && (
        <form onSubmit={onCreate} className="flex flex-col gap-4" noValidate>
          <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
            {t.contributeIntro}
          </p>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {t.fieldName}
            <input
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={200}
              autoComplete="off"
              autoFocus
            />
          </label>
          {formError && (
            <p role="alert" className="text-sm text-destructive text-pretty">
              {formError}
            </p>
          )}
          <p className="text-xs leading-relaxed text-muted-foreground text-pretty">
            {t.contributeLicense}
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy} className={primaryBtn}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {busy ? t.contributeCreating : t.contributeCreate}
            </button>
            <button type="button" onClick={onCancel} className={secondaryBtn}>
              {t.contributeCancel}
            </button>
          </div>
        </form>
      )}

      {step === "photos" && (
        <div className="flex flex-col gap-4">
          <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
            {t.photosHint}
          </p>
          <ul className="flex flex-col gap-2">
            {(
              [
                ["front", t.photoFront],
                ["nutrition", t.photoNutrition],
                ["ingredients", t.photoIngredients],
                ["packaging", t.photoPackaging],
              ] as const
            ).map(([kind, label]) => {
              const state = photos[kind];
              return (
                <PhotoSlot
                  key={kind}
                  label={label}
                  state={state}
                  onPick={(file) => onPickSlot(kind, file)}
                  onRetry={
                    state.status === "error" && state.retry
                      ? () => sendPhoto(kind, state.retry!.file, state.retry!.preview)
                      : undefined
                  }
                  addLabel={t.photoAdd}
                  replaceLabel={t.photoReplace}
                  retryLabel={t.photoRetry}
                  uploadingLabel={t.photoUploading}
                  uploadedLabel={t.photoUploaded}
                />
              );
            })}
          </ul>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onReadPhotos}
              disabled={anyUploading}
              className={primaryBtn}
            >
              {uploaded.length > 0 ? (
                <ScanText className="h-4 w-4" aria-hidden="true" />
              ) : null}
              {uploaded.length > 0 ? t.photosRead : t.photosSkip}
            </button>
            <button type="button" onClick={onDone} className={secondaryBtn}>
              {t.contributeLater}
            </button>
          </div>
        </div>
      )}

      {step === "review" && (
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <div
            role="status"
            aria-live="polite"
            className="flex flex-col gap-2 rounded-xl bg-muted p-3 text-sm"
          >
            {reading !== "idle" ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                {reading === "ai" ? t.aiTrying : t.readTitle}
              </span>
            ) : (
              <span className="text-muted-foreground text-pretty">
                {readMessage ?? t.reviewHint}
              </span>
            )}
            {reading === "idle" && uploaded.length > 0 && !aiTried && missingFields().length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={onTryAi} className={`${secondaryBtn} bg-background`}>
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                  {t.aiTry}
                </button>
                <span className="text-xs text-muted-foreground text-pretty">{t.aiHint}</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {(
              [
                ["brand", t.fieldBrand, "", 200],
                ["quantity", t.fieldQuantity, "400 g", 50],
                ["servingSize", t.fieldServingSize, "30 g", 50],
              ] as const
            ).map(([field, label, placeholder, max]) => (
              <label key={field} className="flex flex-col gap-1.5 text-sm font-medium">
                <span className="flex flex-wrap items-center gap-2">
                  {label}
                  {sourceBadge(field)}
                </span>
                <input
                  className={inputClass}
                  value={text[field]}
                  onChange={(e) => setText((v) => ({ ...v, [field]: e.target.value }))}
                  placeholder={placeholder}
                  maxLength={max}
                  autoComplete="off"
                />
              </label>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TagInput
              label={t.fieldCategories}
              hint={t.categoriesHint}
              badge={sourceBadge("categories")}
              values={lists.categories}
              onChange={(v) => setLists((l) => ({ ...l, categories: v }))}
              addLabel={t.tagAdd}
              removeLabel={t.tagRemove}
            />
            <TagInput
              label={t.fieldLabels}
              hint={t.labelsHint}
              badge={sourceBadge("labels")}
              values={lists.labels}
              onChange={(v) => setLists((l) => ({ ...l, labels: v }))}
              addLabel={t.tagAdd}
              removeLabel={t.tagRemove}
            />
          </div>

          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 flex w-full flex-wrap items-center justify-between gap-2 text-sm font-medium">
              {t.nutritionTitle}
            </legend>
            <div role="radiogroup" aria-label={t.basisLabel} className="flex gap-1 self-start rounded-xl bg-muted p-1">
              {(
                [
                  ["100g", t.basis100g],
                  ["serving", t.basisServing],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={basis === value}
                  onClick={() => setBasis(value)}
                  className={`min-h-9 rounded-lg px-3 text-xs font-semibold transition ${
                    basis === value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {nutrientFields.map(({ key, label, unit }) => (
                <label key={key} className="flex flex-col gap-1 text-xs text-muted-foreground">
                  <span className="flex flex-wrap items-center gap-1">
                    {label}
                    {sourceBadge(key)}
                  </span>
                  <div className="relative">
                    <input
                      className={`${inputClass} pr-12 text-foreground ${
                        warnedKeys.has(key) ? "border-destructive" : ""
                      }`}
                      inputMode="decimal"
                      value={nutriments[key] ?? ""}
                      onChange={(e) => setNutriments((n) => ({ ...n, [key]: e.target.value }))}
                      aria-invalid={warnedKeys.has(key) || undefined}
                      autoComplete="off"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs">
                      {unit}
                    </span>
                  </div>
                </label>
              ))}
            </div>
            {warnings.length > 0 && (
              <ul className="flex flex-col gap-1 rounded-xl border border-destructive/40 p-3 text-xs text-destructive">
                {warnings.map((w) => (
                  <li key={w} className="flex items-start gap-2 text-pretty">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {warningText[w]}
                  </li>
                ))}
              </ul>
            )}
          </fieldset>

          <label className="flex flex-col gap-1.5 text-sm font-medium">
            <span className="flex flex-wrap items-center gap-2">
              {t.fieldIngredients}
              {sourceBadge("ingredients")}
            </span>
            <textarea
              className={`${inputClass} min-h-28 py-2 leading-relaxed`}
              value={text.ingredients}
              onChange={(e) => setText((v) => ({ ...v, ingredients: e.target.value }))}
              maxLength={5000}
            />
          </label>

          {Object.keys(sources).length > 0 && (
            <p className="text-xs text-muted-foreground text-pretty">{t.ocrReview}</p>
          )}
          {formError && (
            <p role="alert" className="text-sm text-destructive text-pretty">
              {formError}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy || reading !== "idle"} className={primaryBtn}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {busy ? t.contributeSubmitting : t.reviewSubmit}
            </button>
            <button type="button" onClick={() => setStep("photos")} className={secondaryBtn}>
              {t.reviewBack}
            </button>
          </div>
        </form>
      )}

      {step === "done" && (
        <div className="flex flex-col gap-3">
          <p className="inline-flex items-center gap-2 text-sm font-medium">
            <Check className="h-4 w-4 text-primary" aria-hidden="true" />
            {t.contributeSaved}
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground text-pretty">{t.contributeSavedHint}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onDone} className={primaryBtn}>
              {t.contributeDone}
            </button>
            <a
              href={`https://world.openfoodfacts.org/product/${barcode}`}
              target="_blank"
              rel="noopener noreferrer"
              className={secondaryBtn}
            >
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              {t.viewOnOff}
            </a>
          </div>
        </div>
      )}
    </section>
  );
}

function TagInput({
  label,
  hint,
  badge,
  values,
  onChange,
  addLabel,
  removeLabel,
}: {
  label: string;
  hint: string;
  badge: React.ReactNode;
  values: string[];
  onChange: (values: string[]) => void;
  addLabel: string;
  removeLabel: string;
}) {
  const id = useId();
  const [draft, setDraft] = useState("");
  const add = () => {
    const parts = draft
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    const next = [...values];
    for (const p of parts) {
      if (!next.some((v) => v.toLowerCase() === p.toLowerCase())) next.push(p);
    }
    onChange(next.slice(0, 20));
    setDraft("");
  };
  return (
    <div className="flex flex-col gap-1.5 text-sm font-medium">
      <label htmlFor={id} className="flex flex-wrap items-center gap-2">
        {label}
        {badge}
      </label>
      {values.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {values.map((v) => (
            <li
              key={v}
              className="inline-flex items-center gap-1 rounded-full bg-muted py-1 pl-3 pr-1 text-xs font-medium"
            >
              {v}
              <button
                type="button"
                onClick={() => onChange(values.filter((x) => x !== v))}
                aria-label={`${removeLabel}: ${v}`}
                className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-accent"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input
          id={id}
          className="w-full rounded-xl border border-border bg-background px-3 min-h-11 text-base font-normal outline-none focus:ring-2 focus:ring-ring"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing || e.keyCode === 229) return;
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add();
            }
          }}
          onBlur={add}
          placeholder={hint}
          autoComplete="off"
        />
        <button type="button" onClick={add} className={`${secondaryBtn} shrink-0 px-3`}>
          {addLabel}
        </button>
      </div>
    </div>
  );
}

function PhotoSlot({
  label,
  state,
  onPick,
  onRetry,
  addLabel,
  replaceLabel,
  retryLabel,
  uploadingLabel,
  uploadedLabel,
}: {
  label: string;
  state: PhotoState;
  onPick: (file: File) => void;
  onRetry?: () => void;
  addLabel: string;
  replaceLabel: string;
  retryLabel: string;
  uploadingLabel: string;
  uploadedLabel: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = state.status === "uploading";
  const preview = state.status === "done" || state.status === "uploading" ? state.preview : null;
  return (
    <li className="flex items-center gap-3 rounded-xl border border-border p-2">
      <div className="relative h-12 w-12 shrink-0">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview || "/placeholder.svg"}
            alt={label}
            className={`h-12 w-12 rounded-lg border border-border bg-muted object-cover ${busy ? "opacity-50" : ""}`}
          />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Upload className="h-5 w-5" aria-hidden="true" />
          </div>
        )}
        {busy && (
          <Loader2 className="absolute inset-0 m-auto h-5 w-5 animate-spin" aria-hidden="true" />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-medium">{label}</span>
        <span
          role="status"
          className={`text-xs ${state.status === "error" ? "text-destructive" : "text-muted-foreground"}`}
        >
          {state.status === "uploading" && uploadingLabel}
          {state.status === "done" && uploadedLabel}
          {state.status === "error" && state.message}
        </span>
      </div>
      {onRetry && (
        <button type="button" onClick={onRetry} className={`${secondaryBtn} shrink-0 px-3`}>
          {retryLabel}
        </button>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        aria-label={`${state.status === "done" ? replaceLabel : addLabel}: ${label}`}
        className={`${secondaryBtn} shrink-0 px-3`}
      >
        <Camera className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">{state.status === "done" ? replaceLabel : addLabel}</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onPick(file);
        }}
      />
    </li>
  );
}
