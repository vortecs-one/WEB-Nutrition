"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  ImageUp,
  Loader2,
  Minus,
  Plus,
  RotateCcw,
  Sparkles,
  TriangleAlert,
  Check,
} from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";
import { analyzeFoodPhotoLocally, preloadLocalFoodModel } from "@/lib/foods/local-vision";
import {
  LOW_CONFIDENCE,
  REFERENCE_MIN_CONFIDENCE,
  type FoodPhotoItem,
  type FoodPhotoResult,
} from "@/lib/foods/photo-types";
import { referenceToItem } from "@/lib/foods/photo-postprocess";
import { REFERENCE_BY_ID, type ReferenceEntry } from "@/lib/foods/reference-table";
import ReferencePicker from "./ReferencePicker";

const PORTION_STEPS = [0.5, 1, 1.5, 2, 3];

const isPreselected = (item: FoodPhotoItem) =>
  item.confidence >= (item.reference ? REFERENCE_MIN_CONFIDENCE : LOW_CONFIDENCE);

type Phase = "camera" | "analyzing" | "review" | "failed";
type FailReason = "not-food" | "rate-limited" | "quota" | "error";

const MAX_DIMENSION = 768;
const JPEG_QUALITY = 0.8;

function drawToDataUrl(source: CanvasImageSource, width: number, height: number) {
  const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}

function fileToDataUrl(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve(drawToDataUrl(img, img.naturalWidth, img.naturalHeight));
      URL.revokeObjectURL(url);
    };
  img.onerror = () => {
  URL.revokeObjectURL(url);
  if (typeof createImageBitmap !== "function") return resolve(null);
  createImageBitmap(file)
    .then((bitmap) => {
      resolve(drawToDataUrl(bitmap, bitmap.width, bitmap.height));
      bitmap.close();
    })
    .catch(() => resolve(null));
  };
    img.src = url;
  });
}

const itemTotals = (item: FoodPhotoItem) => {
  const f = item.grams / 100;
  return {
    calories: item.per100g.calories * f,
    protein: item.per100g.protein * f,
    carbs: item.per100g.carbs * f,
    fat: item.per100g.fat * f,
  };
};

export default function FoodPhotoScanner({
  onAdd,
}: {
  onAdd: (items: FoodPhotoItem[]) => void;
}) {
  const { dict, locale } = useI18n();
  const t = dict.nutritionUser;

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [phase, setPhase] = useState<Phase>("camera");
  const [failReason, setFailReason] = useState<FailReason>("error");
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraDenied, setCameraDenied] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [items, setItems] = useState<FoodPhotoItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const lastResultRef = useRef<{ dataUrl: string; result: FoodPhotoResult } | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraReady(false);
  }, []);

  useEffect(() => {
    if (phase !== "camera") return;
    let cancelled = false;
    preloadLocalFoodModel();
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraDenied(true);
      return;
    }
    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 } },
        audio: false,
      })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          void video.play().then(() => setCameraReady(true)).catch(() => {});
        }
      })
      .catch(() => {
        if (!cancelled) setCameraDenied(true);
      });
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [phase, stopCamera]);

  const analyze = async (dataUrl: string) => {
    setPhoto(dataUrl);
    setPhase("analyzing");
    stopCamera();
    try {
      const cached = lastResultRef.current;
      const result =
        cached && cached.dataUrl === dataUrl
          ? cached.result
          : await analyzeFoodPhotoLocally(dataUrl, locale === "en" ? "en" : "es");
      if (result.ok) lastResultRef.current = { dataUrl, result };
      if (result.ok) {
        setItems(result.items);
        setSelected(new Set(result.items.filter(isPreselected).map((i) => i.id)));
        setPhase("review");
        return;
      }
      setFailReason(
        result.reason === "not-food" ||
          result.reason === "rate-limited" ||
          result.reason === "quota"
          ? result.reason
          : "error",
      );
    } catch {
      setFailReason("error");
    }
    setPhase("failed");
  };

  const capture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const dataUrl = drawToDataUrl(video, video.videoWidth, video.videoHeight);
    if (dataUrl) void analyze(dataUrl);
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const dataUrl = file.type.startsWith("image/") || file.type === "" ? await fileToDataUrl(file) : null;
    if (dataUrl) {
      void analyze(dataUrl);
      return;
    }
    stopCamera();
    setPhoto(null);
    setFailReason("error");
    setPhase("failed");
  };

  const retake = () => {
    setItems([]);
    setSelected(new Set());
    setPhoto(null);
    setPickerFor(null);
    setPhase("camera");
  };

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const setGrams = (id: string, grams: number) =>
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, grams: Math.max(0, Math.round(grams)) } : i)),
    );

  const lang = locale === "en" ? "en" : "es";
  const [pickerFor, setPickerFor] = useState<string | null>(null);

  const swapItem = (id: string, entry: ReferenceEntry) => {
    setItems((prev) =>
      prev.map((i) => {
        if (i.id !== id) return i;
        const previous = i.reference?.id;
        const alternatives = [previous, ...(i.alternatives ?? [])].filter(
          (alt): alt is string => !!alt && alt !== entry.id,
        );
        return referenceToItem(entry, lang, { id, confidence: 1, alternatives });
      }),
    );
    setSelected((prev) => new Set(prev).add(id));
    setPickerFor(null);
  };

  const addItem = (entry: ReferenceEntry) => {
    const id = `manual-${entry.id}-${items.length}`;
    setItems((prev) => [...prev, referenceToItem(entry, lang, { id, confidence: 1 })]);
    setSelected((prev) => new Set(prev).add(id));
    setPickerFor(null);
  };

  const picker = (onPick: (entry: ReferenceEntry) => void) => (
    <ReferencePicker
      locale={lang}
      placeholder={t.photoSearchPlaceholder}
      emptyLabel={t.photoSearchEmpty}
      closeLabel={t.photoSearchClose}
      carbsLabel={t.photoCarbsShort}
      unitG={t.unitG}
      onPick={onPick}
      onClose={() => setPickerFor(null)}
    />
  );

  const chosen = items.filter((i) => selected.has(i.id) && i.grams > 0);
  const totals = chosen.reduce(
    (acc, item) => {
      const v = itemTotals(item);
      return {
        calories: acc.calories + v.calories,
        protein: acc.protein + v.protein,
        carbs: acc.carbs + v.carbs,
        fat: acc.fat + v.fat,
      };
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );

  const addSelected = () => {
    if (chosen.length === 0) return;
    onAdd(chosen);
    retake();
  };

  const fileInput = (
    <input
      ref={fileRef}
      type="file"
      accept="image/*"
      className="sr-only"
      tabIndex={-1}
      aria-hidden="true"
      onChange={onFile}
    />
  );

  if (phase === "camera") {
    return (
      <div className="flex flex-col gap-3">
        {fileInput}
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-3xl border-2 border-highlight/40 bg-muted">
          {cameraDenied ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
              <Camera className="h-8 w-8 text-highlight" aria-hidden="true" />
              <p className="text-sm text-muted-foreground text-pretty">{t.photoCameraDenied}</p>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                className="h-full w-full object-cover"
                playsInline
                muted
                aria-label={t.tabPhoto}
              />
              {!cameraReady && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="h-7 w-7 animate-spin text-highlight" aria-hidden="true" />
                </div>
              )}
              <div
                className="pointer-events-none absolute inset-6 rounded-2xl border border-dashed border-highlight/60"
                aria-hidden="true"
              />
              <p className="absolute inset-x-0 top-3 text-center text-xs font-medium text-foreground/90">
                <span className="rounded-full bg-background/70 px-3 py-1 backdrop-blur">
                  {t.photoHint}
                </span>
              </p>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={capture}
            disabled={!cameraReady}
            className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-highlight px-5 text-sm font-semibold text-highlight-foreground transition hover:bg-highlight/90 active:scale-[0.98] disabled:opacity-50"
          >
            <Camera className="h-5 w-5" aria-hidden="true" />
            {t.photoTake}
          </button>
          <label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl bg-muted px-4 text-sm font-semibold text-foreground transition hover:bg-accent focus-within:ring-2 focus-within:ring-highlight active:scale-95">
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={onFile}
            />
            <ImageUp className="h-5 w-5 text-highlight" aria-hidden="true" />
            <span className={cameraDenied ? "" : "sr-only sm:not-sr-only"}>{t.photoUpload}</span>
          </label>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {fileInput}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        {photo && (
          <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden rounded-3xl border border-border bg-muted sm:w-48">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo} alt={t.photoPreviewAlt} className="h-full w-full object-cover" />
            {phase === "analyzing" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/60 backdrop-blur-[2px]">
                <Sparkles className="h-6 w-6 animate-pulse text-highlight" aria-hidden="true" />
              </div>
            )}
          </div>
        )}

        <div className="min-w-0 flex-1" role="status" aria-live="polite">
          {phase === "analyzing" && (
            <div className="flex flex-col gap-2">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Loader2 className="h-4 w-4 animate-spin text-highlight" aria-hidden="true" />
                {t.photoAnalyzing}
              </p>
              <div className="flex flex-col gap-2" aria-hidden="true">
                <div className="h-14 animate-pulse rounded-xl bg-muted" />
                <div className="h-14 animate-pulse rounded-xl bg-muted" />
              </div>
            </div>
          )}

          {phase === "failed" && (
            <div className="flex flex-col items-start gap-3 rounded-2xl border border-border p-4">
              <p className="text-sm text-pretty">
                {failReason === "not-food"
                  ? t.photoNotFood
                  : failReason === "rate-limited"
                    ? t.photoRateLimited
                    : failReason === "quota"
                      ? t.photoQuota
                      : t.photoError}
              </p>
              <button
                type="button"
                onClick={retake}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-muted px-4 text-sm font-semibold transition hover:bg-accent active:scale-95"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                {t.photoRetake}
              </button>
            </div>
          )}

          {phase === "review" && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-highlight">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  {t.photoDetected} ({items.length})
                </h3>
                <button
                  type="button"
                  onClick={retake}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  {t.photoRetake}
                </button>
              </div>

              <ul className="flex flex-col gap-2">
                {items.map((item) => {
                  const v = itemTotals(item);
                  const isOn = selected.has(item.id);
                  const low = item.confidence < LOW_CONFIDENCE;
                  return (
                    <li
                      key={item.id}
                      className={`rounded-xl border p-3 transition ${isOn ? "border-highlight/40 bg-highlight/5" : "border-border bg-background opacity-70"}`}
                    >
                      <div className="flex items-start gap-3">
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={isOn}
                          aria-label={item.name}
                          onClick={() => toggle(item.id)}
                          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition ${isOn ? "border-highlight bg-highlight text-highlight-foreground" : "border-border"}`}
                        >
                          {isOn && <Check className="h-4 w-4" aria-hidden="true" />}
                        </button>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium leading-tight text-pretty">{item.name}</div>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                            <span className="rounded-md bg-highlight/15 px-1.5 py-0.5 font-medium text-highlight">
                              {item.source === "reference" ? t.photoSourceReference : t.photoSourceAi}
                            </span>
                            {low && (
                              <span className="inline-flex items-center gap-1 rounded-md bg-chart-3/15 px-1.5 py-0.5 font-medium text-chart-3">
                                <TriangleAlert className="h-3 w-3" aria-hidden="true" />
                                {t.photoLowConfidence}
                              </span>
                            )}
                          </div>
                          {item.reference && (
                            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                              <span className="tabular-nums">
                                {item.reference.portion} · {item.reference.portionGrams} {t.unitG} ·{" "}
                                <span className="font-medium text-highlight">
                                  {item.reference.portionCarbs} {t.unitG} {t.photoCarbsShort}
                                </span>
                              </span>
                            </div>
                          )}
                          {item.reference && (
                            <div
                              role="group"
                              aria-label={t.photoPortions}
                              className="mt-2 flex flex-wrap items-center gap-1"
                            >
                              {PORTION_STEPS.map((step) => {
                                const grams = Math.round(step * item.reference!.portionGrams);
                                const active = item.grams === grams;
                                return (
                                  <button
                                    key={step}
                                    type="button"
                                    aria-pressed={active}
                                    onClick={() => setGrams(item.id, grams)}
                                    className={`inline-flex min-h-8 items-center rounded-md border px-2.5 text-xs font-medium tabular-nums transition ${active ? "border-highlight bg-highlight text-highlight-foreground" : "border-border text-muted-foreground hover:border-highlight/50 hover:text-foreground"}`}
                                  >
                                    {step === 0.5 ? "½" : step === 1.5 ? "1½" : step}×
                                  </button>
                                );
                              })}
                              <span className="ml-1 text-xs tabular-nums text-highlight">
                                {Math.round(
                                  (item.grams / item.reference.portionGrams) * item.reference.portionCarbs * 10,
                                ) / 10}{" "}
                                {t.unitG} {t.photoCarbsShort}
                              </span>
                            </div>
                          )}
                          {(item.alternatives?.length ?? 0) > 0 && pickerFor !== item.id && (
                            <div className="mt-2 flex flex-wrap items-center gap-1">
                              <span className="text-[11px] text-muted-foreground">{t.photoAlternatives}</span>
                              {item.alternatives!.slice(0, 3).flatMap((altId) => {
                                const alt = REFERENCE_BY_ID.get(altId);
                                if (!alt) return [];
                                return [
                                  <button
                                    key={altId}
                                    type="button"
                                    onClick={() => swapItem(item.id, alt)}
                                    className="inline-flex min-h-7 items-center rounded-full bg-muted px-2.5 text-[11px] font-medium text-foreground transition hover:bg-accent"
                                  >
                                    {lang === "en" ? alt.nameEn : alt.nameEs}
                                  </button>,
                                ];
                              })}
                            </div>
                          )}
                          {pickerFor === item.id ? (
                            <div className="mt-2">{picker((entry) => swapItem(item.id, entry))}</div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setPickerFor(item.id)}
                              className="mt-2 inline-flex min-h-7 items-center gap-1 rounded-md px-1 text-[11px] font-medium text-highlight underline-offset-2 transition hover:underline"
                            >
                              {t.photoChangeFood}
                            </button>
                          )}
                          {item.reference?.warning === "lactose-free" && (
                            <p className="mt-1.5 flex items-start gap-1 text-xs text-chart-3 text-pretty">
                              <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                              {t.photoWarnLactoseFree}
                            </p>
                          )}
                        </div>
                        <span className="shrink-0 text-sm font-semibold tabular-nums">
                          {Math.round(v.calories)} {t.kcal}
                        </span>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <div className="inline-flex items-center rounded-lg border border-border bg-background">
                          <button
                            type="button"
                            onClick={() => setGrams(item.id, item.grams - 10)}
                            aria-label={`- 10 ${t.unitG}`}
                            className="flex h-9 w-9 items-center justify-center rounded-l-lg text-muted-foreground transition hover:bg-accent"
                          >
                            <Minus className="h-4 w-4" aria-hidden="true" />
                          </button>
                          <input
                            type="number"
                            inputMode="numeric"
                            value={item.grams || ""}
                            onChange={(e) => setGrams(item.id, Number(e.target.value) || 0)}
                            aria-label={`${t.quantity} (${t.unitG})`}
                            className="h-9 w-14 border-x border-border bg-background text-center text-sm tabular-nums outline-none focus:ring-1 focus:ring-highlight"
                          />
                          <button
                            type="button"
                            onClick={() => setGrams(item.id, item.grams + 10)}
                            aria-label={`+ 10 ${t.unitG}`}
                            className="flex h-9 w-9 items-center justify-center rounded-r-lg text-muted-foreground transition hover:bg-accent"
                          >
                            <Plus className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </div>
                        <span className="text-xs text-muted-foreground">{t.unitG}</span>
                        <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                          {t.macroProtein.slice(0, 1)} {v.protein.toFixed(1)} · {t.macroCarbs.slice(0, 1)}{" "}
                          {v.carbs.toFixed(1)} · {t.macroFat.slice(0, 1)} {v.fat.toFixed(1)}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
              {pickerFor === "new" ? (
                picker(addItem)
              ) : (
                <button
                  type="button"
                  onClick={() => setPickerFor("new")}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-dashed border-highlight/50 px-4 text-sm font-medium text-highlight transition hover:bg-highlight/5"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  {t.photoAddItem}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {phase === "review" && (
        <>
          <dl className="grid grid-cols-4 gap-2 rounded-xl bg-muted p-3 text-center">
            <div>
              <dt className="text-[11px] text-muted-foreground">{t.kcal}</dt>
              <dd className="text-sm font-bold tabular-nums text-highlight">{Math.round(totals.calories)}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted-foreground">{t.macroProtein}</dt>
              <dd className="text-sm font-semibold tabular-nums">{totals.protein.toFixed(1)}{t.unitG}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted-foreground">{t.macroCarbs}</dt>
              <dd className="text-sm font-semibold tabular-nums">{totals.carbs.toFixed(1)}{t.unitG}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted-foreground">{t.macroFat}</dt>
              <dd className="text-sm font-semibold tabular-nums">{totals.fat.toFixed(1)}{t.unitG}</dd>
            </div>
          </dl>

          <button
            type="button"
            onClick={addSelected}
            disabled={chosen.length === 0}
            className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 active:scale-[0.98] disabled:opacity-50"
          >
            <Plus className="h-5 w-5" aria-hidden="true" />
            {t.addToMeal} ({chosen.length})
          </button>

          {items.some((i) => i.reference) && (
            <p className="flex items-start gap-2 text-xs leading-relaxed text-highlight text-pretty">
              <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {t.photoRefCarbsNote}
            </p>
          )}
          {items.some((i) => !i.reference) && (
            <p className="text-xs leading-relaxed text-muted-foreground text-pretty">
              {t.photoPackagedHint}
            </p>
          )}
          <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground text-pretty">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {t.photoDisclaimer}
          </p>
        </>
      )}
    </div>
  );
}
