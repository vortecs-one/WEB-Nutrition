"use client";

import { useId, useRef, useState } from "react";
import {
  Camera,
  Check,
  Loader2,
  ScanText,
  Upload,
  X,
} from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";
import {
  readIngredientsFromPhoto,
  registerFoodProduct,
  saveFoodIngredients,
  uploadFoodPhoto,
} from "@/lib/foods/actions";
import { preparePhoto } from "@/lib/foods/prepare-photo";
import type {
  FoodPhotoKind,
  FoodWriteFailure,
  NewFoodProductInput,
  NutrimentKey,
} from "@/lib/foods/types";

type PhotoState =
  | { status: "idle" }
  | { status: "uploading" }
  | { status: "done"; preview: string }
  | { status: "error"; message: string };

const inputClass =
  "w-full rounded-xl border border-border bg-background px-3 min-h-11 text-base outline-none focus:ring-2 focus:ring-ring";
const primaryBtn =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90 active:scale-95 disabled:opacity-50 disabled:active:scale-100";
const secondaryBtn =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-muted px-4 text-sm font-semibold text-foreground transition hover:bg-accent active:scale-95 disabled:opacity-50";

export default function ContributeProduct({
  barcode,
  startAt = "details",
  onDone,
  onCancel,
}: {
  barcode: string;
  // "photos" skips registration for a product that already exists (e.g. a
  // found product that has no image yet).
  startAt?: "details" | "photos";
  onDone: () => void;
  onCancel: () => void;
}) {
  const { dict, locale } = useI18n();
  const t = dict.nutritionUser;
  const formId = useId();

  const [step, setStep] = useState(startAt);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [quantity, setQuantity] = useState("");
  const [servingSize, setServingSize] = useState("");
  const [nutriments, setNutriments] = useState<Partial<Record<NutrimentKey, string>>>({});
  const [frontFile, setFrontFile] = useState<File | null>(null);
  const [frontPreview, setFrontPreview] = useState<string | null>(null);

  const [photos, setPhotos] = useState<Record<FoodPhotoKind, PhotoState>>({
    front: { status: "idle" },
    nutrition: { status: "idle" },
    ingredients: { status: "idle" },
  });

  const [ingredients, setIngredients] = useState("");
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrMessage, setOcrMessage] = useState<string | null>(null);
  const [ingredientsSaved, setIngredientsSaved] = useState(false);
  const [savingIngredients, setSavingIngredients] = useState(false);

  const failureText = (reason: FoodWriteFailure | "no-photo", detail?: string) => {
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
      case "no-photo":
        return t.ocrNoPhoto;
      default:
        return t.contributeErrGeneric;
    }
  };

  const nutrientFields: { key: NutrimentKey; label: string; unit: string }[] = [
    { key: "energy-kcal", label: t.nutrEnergy, unit: "kcal" },
    { key: "fat", label: t.nutrFat, unit: t.unitG },
    { key: "saturated-fat", label: t.nutrSatFat, unit: t.unitG },
    { key: "carbohydrates", label: t.nutrCarbs, unit: t.unitG },
    { key: "sugars", label: t.nutrSugars, unit: t.unitG },
    { key: "fiber", label: t.nutrFiber, unit: t.unitG },
    { key: "proteins", label: t.nutrProtein, unit: t.unitG },
    { key: "salt", label: t.nutrSalt, unit: t.unitG },
  ];

  const sendPhoto = async (kind: FoodPhotoKind, file: File, preview: string) => {
    setPhotos((p) => ({ ...p, [kind]: { status: "uploading" } }));
    const form = new FormData();
    form.append("barcode", barcode);
    form.append("kind", kind);
    form.append("lang", locale);
    form.append("image", file);
    const res = await uploadFoodPhoto(form).catch(() => null);
    setPhotos((p) => ({
      ...p,
      [kind]: res?.ok
        ? { status: "done", preview }
        : {
            status: "error",
            message: failureText(res && !res.ok ? res.reason : "error"),
          },
    }));
    return res?.ok ?? false;
  };

  // Validate + downscale a picked file. Returns null (and reports why) when
  // the photo can't be used.
  const pick = async (
    raw: File,
    onError: (message: string) => void,
  ): Promise<{ file: File; preview: string } | null> => {
    const prepared = await preparePhoto(raw);
    if (!prepared.ok) {
      onError(prepared.reason === "too-small" ? t.photoTooSmall : t.photoUnreadable);
      return null;
    }
    return { file: prepared.file, preview: URL.createObjectURL(prepared.file) };
  };

  const onPickSlot = async (kind: FoodPhotoKind, raw: File) => {
    const picked = await pick(raw, (message) =>
      setPhotos((p) => ({ ...p, [kind]: { status: "error", message } })),
    );
    if (picked) await sendPhoto(kind, picked.file, picked.preview);
  };

  const onPickFront = async (raw: File) => {
    setFormError(null);
    const picked = await pick(raw, setFormError);
    if (!picked) return;
    setFrontFile(picked.file);
    setFrontPreview(picked.preview);
  };

  const onRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setFormError(t.contributeNameRequired);
      return;
    }
    setSubmitting(true);
    setFormError(null);

    const values: NewFoodProductInput["nutriments"] = {};
    for (const { key } of nutrientFields) {
      const n = parseFloat((nutriments[key] ?? "").replace(",", "."));
      if (Number.isFinite(n) && n >= 0) values[key] = n;
    }

    const res = await registerFoodProduct(
      barcode,
      { name, brand, quantity, servingSize, nutriments: values },
      locale,
    ).catch(() => null);

    if (!res?.ok) {
      setSubmitting(false);
      setFormError(failureText(res && !res.ok ? res.reason : "error", res && !res.ok ? res.message : undefined));
      return;
    }

    if (frontFile && frontPreview) await sendPhoto("front", frontFile, frontPreview);
    setSubmitting(false);
    setStep("photos");
  };

  const onReadIngredients = async () => {
    setOcrBusy(true);
    setOcrMessage(null);
    const res = await readIngredientsFromPhoto(barcode, locale).catch(() => null);
    setOcrBusy(false);
    if (res?.ok) {
      setIngredients(res.ingredients);
      setIngredientsSaved(false);
      setOcrMessage(t.ocrReview);
    } else {
      setOcrMessage(failureText(res && !res.ok ? res.reason : "error"));
    }
  };

  const onSaveIngredients = async () => {
    setSavingIngredients(true);
    setOcrMessage(null);
    const res = await saveFoodIngredients(barcode, ingredients, locale).catch(() => null);
    setSavingIngredients(false);
    if (res?.ok) setIngredientsSaved(true);
    else setOcrMessage(failureText(res && !res.ok ? res.reason : "error"));
  };

  return (
    <section
      aria-labelledby={`${formId}-title`}
      className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h3 id={`${formId}-title`} className="text-base font-semibold text-balance">
            {step === "details" ? t.contributeTitle : t.photosTitle}
          </h3>
          <p className="text-xs text-muted-foreground">
            {t.barcodeLabel}: <span className="font-mono tabular-nums">{barcode}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          aria-label={t.contributeCancel}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-accent active:scale-95"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </header>

      {step === "details" ? (
        <form onSubmit={onRegister} className="flex flex-col gap-4" noValidate>
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
            />
          </label>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {t.fieldBrand}
              <input className={inputClass} value={brand} onChange={(e) => setBrand(e.target.value)} maxLength={200} autoComplete="off" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {t.fieldQuantity}
              <input className={inputClass} value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="400 g" maxLength={50} autoComplete="off" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {t.fieldServingSize}
              <input className={inputClass} value={servingSize} onChange={(e) => setServingSize(e.target.value)} placeholder="30 g" maxLength={50} autoComplete="off" />
            </label>
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium">{t.nutritionPer100g}</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {nutrientFields.map(({ key, label, unit }) => (
                <label key={key} className="flex flex-col gap-1 text-xs text-muted-foreground">
                  {label}
                  <div className="relative">
                    <input
                      className={`${inputClass} pr-12 text-foreground`}
                      inputMode="decimal"
                      value={nutriments[key] ?? ""}
                      onChange={(e) => setNutriments((n) => ({ ...n, [key]: e.target.value }))}
                      autoComplete="off"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs">
                      {unit}
                    </span>
                  </div>
                </label>
              ))}
            </div>
          </fieldset>

          <FilePickButton
            label={frontPreview ? t.photoReplace : t.photoFront}
            onPick={onPickFront}
            preview={frontPreview}
            previewAlt={t.photoFront}
          />

          {formError && (
            <p role="alert" className="text-sm text-destructive text-pretty">
              {formError}
            </p>
          )}

          <p className="text-xs leading-relaxed text-muted-foreground text-pretty">
            {t.contributeLicense}
          </p>

          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={submitting} className={primaryBtn}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {submitting ? t.contributeSubmitting : t.contributeSubmit}
            </button>
            <button type="button" onClick={onCancel} className={secondaryBtn}>
              {t.contributeCancel}
            </button>
          </div>
        </form>
      ) : (
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
              ] as const
            ).map(([kind, label]) => (
              <PhotoSlot
                key={kind}
                label={label}
                state={photos[kind]}
                onPick={(file) => onPickSlot(kind, file)}
                addLabel={t.photoAdd}
                replaceLabel={t.photoReplace}
                uploadingLabel={t.photoUploading}
                uploadedLabel={t.photoUploaded}
              />
            ))}
          </ul>

          {photos.ingredients.status === "done" && (
            <div className="flex flex-col gap-3 rounded-xl bg-muted p-3">
              <button
                type="button"
                onClick={onReadIngredients}
                disabled={ocrBusy}
                className={`${secondaryBtn} bg-background self-start`}
              >
                {ocrBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <ScanText className="h-4 w-4" aria-hidden="true" />
                )}
                {ocrBusy ? t.ocrReading : t.ocrRead}
              </button>

              <label className="flex flex-col gap-1.5 text-sm font-medium">
                {t.fieldIngredients}
                <textarea
                  className={`${inputClass} min-h-28 py-2 leading-relaxed`}
                  value={ingredients}
                  onChange={(e) => {
                    setIngredients(e.target.value);
                    setIngredientsSaved(false);
                  }}
                  maxLength={5000}
                />
              </label>

              <div role="status" aria-live="polite" className="text-xs text-muted-foreground">
                {ingredientsSaved ? t.ocrSaved : ocrMessage}
              </div>

              <button
                type="button"
                onClick={onSaveIngredients}
                disabled={savingIngredients || !ingredients.trim() || ingredientsSaved}
                className={`${primaryBtn} self-start`}
              >
                {savingIngredients ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : ingredientsSaved ? (
                  <Check className="h-4 w-4" aria-hidden="true" />
                ) : null}
                {t.ocrSave}
              </button>
            </div>
          )}

          <button type="button" onClick={onDone} className={`${primaryBtn} self-start`}>
            {t.contributeDone}
          </button>
        </div>
      )}
    </section>
  );
}

function FilePickButton({
  label,
  onPick,
  preview,
  previewAlt,
  disabled,
}: {
  label: string;
  onPick: (file: File) => void;
  preview?: string | null;
  previewAlt: string;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-3">
      {preview && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview || "/placeholder.svg"}
          alt={previewAlt}
          className="h-14 w-14 shrink-0 rounded-lg border border-border bg-muted object-cover"
        />
      )}
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        className={secondaryBtn}
      >
        <Camera className="h-4 w-4" aria-hidden="true" />
        {label}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onPick(file);
        }}
      />
    </div>
  );
}

function PhotoSlot({
  label,
  state,
  onPick,
  addLabel,
  replaceLabel,
  uploadingLabel,
  uploadedLabel,
}: {
  label: string;
  state: PhotoState;
  onPick: (file: File) => void;
  addLabel: string;
  replaceLabel: string;
  uploadingLabel: string;
  uploadedLabel: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = state.status === "uploading";
  return (
    <li className="flex items-center gap-3 rounded-xl border border-border p-2">
      {state.status === "done" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={state.preview || "/placeholder.svg"}
          alt={label}
          className="h-12 w-12 shrink-0 rounded-lg border border-border bg-muted object-cover"
        />
      ) : (
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          {busy ? (
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          ) : (
            <Upload className="h-5 w-5" aria-hidden="true" />
          )}
        </div>
      )}
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
