"use client";

// CareLink CSV import for the Guardian 3 sensor: the export downloaded from
// CareLink Personal's Informes page is parsed here in the browser (see
// lib/glucose/carelink-csv.ts for why), previewed, then stored in chunks.
// Importing only stores readings — it doesn't change the active glucose
// sensor; that's picked in the glucose card's settings (or from the pump
// page's "Use Guardian 3" banner). Watchers only see the import status.

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Trash2, UploadCloud, XCircle, Loader2 } from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";
import { clearCareLinkReadings, importCareLinkReadings } from "@/lib/glucose/actions";
import {
  CARELINK_IMPORT_CHUNK,
  CareLinkCsvError,
  parseCareLinkCsv,
  type CareLinkCsvParseResult,
  type CareLinkCsvReading,
} from "@/lib/glucose/carelink-csv";
import { type GlucoseSettings, formatGlucose, unitLabel } from "@/lib/glucose/types";

type CareLinkState =
  | { kind: "idle" }
  // File parsed in the browser and shown for review; nothing saved yet.
  | { kind: "preview"; parsed: CareLinkCsvParseResult }
  | { kind: "importing"; done: number; total: number }
  | { kind: "deleting" }
  | { kind: "ok"; message: string }
  | { kind: "error"; message: string };

// Lowest and highest value, by loop: Math.min(...) would spread a whole
// export (~26k readings for 90 days) into call arguments.
function sgvRange(readings: CareLinkCsvReading[]): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const r of readings) {
    if (r.sgv < min) min = r.sgv;
    if (r.sgv > max) max = r.sgv;
  }
  return { min, max };
}

// The first and last few readings, with null marking the gap between them.
function previewSample(readings: CareLinkCsvReading[]): (CareLinkCsvReading | null)[] {
  return readings.length <= 6 ? readings : [...readings.slice(0, 3), null, ...readings.slice(-3)];
}

export default function CareLinkImport({
  settings,
  isOwner,
  onSaved,
}: {
  settings: GlucoseSettings | null;
  isOwner: boolean;
  onSaved: (settings: GlucoseSettings) => void;
}) {
  const { dict, locale } = useI18n();
  const t = dict.glucose;

  const [careLinkLastImportAt, setCareLinkLastImportAt] = useState(
    settings?.careLinkLastImportAt ?? null,
  );
  const [careLinkReadingCount, setCareLinkReadingCount] = useState(
    settings?.careLinkReadingCount ?? 0,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [careLink, setCareLink] = useState<CareLinkState>({ kind: "idle" });
  // The page is server-rendered, and the server's timezone (UTC) isn't the
  // household's, so the last-import time is only formatted in the browser.
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only time formatting
  useEffect(() => setMounted(true), []);

  const careLinkErrorMessage = (error: string): string => {
    switch (error) {
      case "empty":
        return t.careLinkImportEmpty;
      case "no-readings":
        return t.careLinkImportNoReadings;
      case "unrecognized-format":
      default:
        return t.careLinkImportUnrecognized;
    }
  };

  const careLinkBusy = careLink.kind === "importing" || careLink.kind === "deleting";
  const displayUnit = settings?.unit ?? "mgdl";
  const formatCount = (n: number) => n.toLocaleString(locale);
  const formatReadingTime = (ms: number) =>
    new Date(ms).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });

  const clearCareLinkFile = () => {
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // The file is parsed right here in the browser (see carelink-csv.ts for
  // why) and only previewed — nothing is saved until Import is clicked.
  const handleCareLinkFile = async (file: File | undefined) => {
    if (!file) {
      setCareLink({ kind: "idle" });
      return;
    }
    try {
      const parsed = parseCareLinkCsv(await file.text(), { dayFirst: locale !== "en" });
      setCareLink({ kind: "preview", parsed });
    } catch (err) {
      const code = err instanceof CareLinkCsvError ? err.code : "unknown";
      setCareLink({ kind: "error", message: careLinkErrorMessage(code) });
      clearCareLinkFile();
    }
  };

  const cancelCareLinkPreview = () => {
    setCareLink({ kind: "idle" });
    clearCareLinkFile();
  };

  // Sends the previewed readings in chunks of CARELINK_IMPORT_CHUNK. A failed
  // chunk stops the import: what was stored stays, and importing the same
  // file again skips it.
  const handleImportCareLink = async () => {
    if (careLink.kind !== "preview") return;
    const { readings } = careLink.parsed;
    const total = readings.length;
    let added = 0;
    let saved: GlucoseSettings | null = null;
    for (let done = 0; done < total; done += CARELINK_IMPORT_CHUNK) {
      setCareLink({ kind: "importing", done, total });
      const result = await importCareLinkReadings(
        readings.slice(done, done + CARELINK_IMPORT_CHUNK),
      ).catch(() => null);
      if (!result?.ok) {
        setCareLink({
          kind: "error",
          message: t.careLinkImportFailed
            .replace("{done}", formatCount(done))
            .replace("{total}", formatCount(total)),
        });
        if (saved) {
          setCareLinkLastImportAt(saved.careLinkLastImportAt);
          setCareLinkReadingCount(saved.careLinkReadingCount);
          onSaved(saved);
        }
        return;
      }
      added += result.added;
      saved = result.settings;
    }
    clearCareLinkFile();
    if (!saved) return;
    setCareLink({
      kind: "ok",
      message: t.careLinkImportSuccess
        .replace("{added}", formatCount(added))
        .replace("{skipped}", formatCount(total - added)),
    });
    setCareLinkLastImportAt(saved.careLinkLastImportAt);
    setCareLinkReadingCount(saved.careLinkReadingCount);
    onSaved(saved);
  };

  // Undo for an import that came out wrong — the CSV can be imported again.
  const handleDeleteCareLink = async () => {
    if (
      !window.confirm(
        t.careLinkDeleteConfirm.replace("{count}", formatCount(careLinkReadingCount)),
      )
    ) {
      return;
    }
    setCareLink({ kind: "deleting" });
    const result = await clearCareLinkReadings().catch(() => null);
    if (!result?.ok) {
      setCareLink({ kind: "error", message: t.careLinkDeleteError });
      return;
    }
    setCareLink({ kind: "idle" });
    setCareLinkLastImportAt(null);
    setCareLinkReadingCount(0);
    if (result.settings) onSaved(result.settings);
  };

  const parsed = careLink.kind === "preview" ? careLink.parsed : null;
  const parsedRange = parsed ? sgvRange(parsed.readings) : null;

  const inputClass =
    "w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring";
  const labelClass = "block text-xs font-medium text-sidebar-foreground/70 mb-1";

  const statusLine = mounted && (
    <p className="text-xs text-sidebar-foreground/60 text-pretty">
      {careLinkLastImportAt
        ? t.careLinkLastImport
            .replace("{time}", new Date(careLinkLastImportAt).toLocaleString(locale))
            .replace("{count}", formatCount(careLinkReadingCount))
        : t.careLinkNoImportYet}
    </p>
  );

  return (
    <div>
      <h2 className="text-base font-semibold">{t.careLinkImportTitle}</h2>
      {isOwner && (
        <p className="mt-1 text-sm text-sidebar-foreground/70 text-pretty">
          {t.careLinkImportSubtitle}
        </p>
      )}

      {!isOwner ? (
        <div className="mt-3">{statusLine}</div>
      ) : (
        <div className="mt-4 space-y-4">
          {/* No credentials: upload the export downloaded from CareLink
              Personal's Informes page. */}
          <div>
            <label htmlFor="carelink-file" className={labelClass}>
              {t.careLinkFileLabel}
            </label>
            <input
              id="carelink-file"
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              disabled={careLinkBusy}
              onChange={(e) => handleCareLinkFile(e.target.files?.[0])}
              className={`${inputClass} file:mr-3 file:rounded-full file:border-0 file:bg-sidebar-accent file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-sidebar-foreground`}
            />
            <p className="mt-1 text-xs text-sidebar-foreground/60 text-pretty">
              {t.careLinkFileHint}
            </p>
          </div>

          {/* Preview of the parsed file — the CSV layout isn't confirmed
              against a real export yet, so the owner checks dates and
              values here before anything is stored. */}
          {parsed && parsedRange && (
            <div className="space-y-2 rounded-xl border border-sidebar-border p-3 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-sidebar-foreground/70">
                {t.careLinkPreviewTitle}
              </p>
              <p className="font-medium text-pretty">
                {t.careLinkPreviewSummary
                  .replace("{count}", formatCount(parsed.readings.length))
                  .replace("{from}", formatReadingTime(parsed.readings[0].date))
                  .replace("{to}", formatReadingTime(parsed.readings[parsed.readings.length - 1].date))}
              </p>
              <p className="text-xs text-sidebar-foreground/70">
                {t.careLinkPreviewRange
                  .replace("{min}", formatGlucose(parsedRange.min, displayUnit))
                  .replace("{max}", formatGlucose(parsedRange.max, displayUnit))
                  .replace("{unit}", unitLabel(displayUnit))}
              </p>
              <ul className="divide-y divide-sidebar-border rounded-lg bg-sidebar-accent/60 text-xs tabular-nums">
                {previewSample(parsed.readings).map((r) =>
                  r ? (
                    <li key={r.date} className="flex justify-between gap-3 px-3 py-1.5">
                      <span>{formatReadingTime(r.date)}</span>
                      <span className="font-medium">
                        {formatGlucose(r.sgv, displayUnit)} {unitLabel(displayUnit)}
                      </span>
                    </li>
                  ) : (
                    <li
                      key="gap"
                      aria-hidden="true"
                      className="px-3 py-0.5 text-center text-sidebar-foreground/50"
                    >
                      …
                    </li>
                  ),
                )}
              </ul>
              <p className="text-xs text-sidebar-foreground/60 text-pretty">
                {t.careLinkPreviewColumns
                  .replace("{columns}", parsed.columns.join(" + "))
                  .replace("{unit}", unitLabel(parsed.unit))}
              </p>
              {parsed.dateOrderGuessed && (
                <p className="text-xs text-amber-500 text-pretty">
                  {t.careLinkPreviewDateGuess.replace(
                    "{order}",
                    parsed.dateOrder === "mdy" ? "MM/DD" : "DD/MM",
                  )}
                </p>
              )}
              {parsed.skipped > 0 && (
                <p className="text-xs text-amber-500 text-pretty">
                  {t.careLinkPreviewSkipped.replace("{count}", formatCount(parsed.skipped))}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleImportCareLink}
                  className="flex items-center gap-2 rounded-full border border-sidebar-border px-4 py-2 text-sm font-medium hover:bg-sidebar-accent active:scale-95 transition"
                >
                  <UploadCloud className="h-4 w-4" aria-hidden="true" />
                  {t.careLinkImportButton.replace("{count}", formatCount(parsed.readings.length))}
                </button>
                <button
                  type="button"
                  onClick={cancelCareLinkPreview}
                  className="rounded-full px-4 py-2 text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground active:scale-95 transition"
                >
                  {dict.common.cancel}
                </button>
              </div>
            </div>
          )}

          {careLink.kind === "importing" && (
            <div
              role="status"
              className="flex items-center gap-2 rounded-xl bg-sidebar-accent px-3 py-2 text-sm"
            >
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
              <span>
                {t.careLinkImportProgress
                  .replace("{done}", formatCount(careLink.done))
                  .replace("{total}", formatCount(careLink.total))}
              </span>
            </div>
          )}
          {careLink.kind === "ok" && (
            <div className="flex items-center gap-2 rounded-xl bg-chart-2/15 px-3 py-2 text-sm text-chart-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{careLink.message}</span>
            </div>
          )}
          {careLink.kind === "error" && (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              <XCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{careLink.message}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            {statusLine}
            {careLinkReadingCount > 0 && (
              <button
                type="button"
                onClick={handleDeleteCareLink}
                disabled={careLinkBusy}
                className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 active:scale-95 transition disabled:opacity-50 disabled:pointer-events-none"
              >
                {careLink.kind === "deleting" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {t.careLinkDeleteButton}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
