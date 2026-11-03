"use client";

// Glucose source settings: pick between LibreLinkUp (Abbott's follower API —
// same data as the LibreLink app, main + remote readings), Nightscout, and
// CareLink (Medtronic — CSV import only; no live connection, see
// lib/glucose/carelink-csv.ts). Secrets (Nightscout token, LibreLinkUp
// password) are write-only from the client's perspective — we only know
// whether one is stored.

import { useRef, useState, type FormEvent } from "react";
import { CheckCircle2, Trash2, UploadCloud, XCircle, Loader2 } from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";
import {
  clearCareLinkReadings,
  importCareLinkReadings,
  saveGlucoseSettings,
  testLibreConnection,
  testNightscoutConnection,
} from "@/lib/glucose/actions";
import {
  CARELINK_IMPORT_CHUNK,
  CareLinkCsvError,
  parseCareLinkCsv,
  type CareLinkCsvParseResult,
  type CareLinkCsvReading,
} from "@/lib/glucose/carelink-csv";
import {
  type GlucoseSettings,
  type GlucoseSource,
  formatGlucose,
  unitLabel,
} from "@/lib/glucose/types";

type TestState =
  | { kind: "idle" }
  | { kind: "testing" }
  | { kind: "ok"; message: string }
  | { kind: "error"; message: string };

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

export default function GlucoseSettingsForm({
  settings,
  onSaved,
}: {
  settings: GlucoseSettings | null;
  onSaved: (settings: GlucoseSettings) => void;
}) {
  const { dict, locale } = useI18n();
  const t = dict.glucose;

  const [source, setSource] = useState<GlucoseSource>(settings?.source ?? "librelinkup");

  // Nightscout fields
  const [url, setUrl] = useState(settings?.nightscoutUrl ?? "");
  const [token, setToken] = useState("");

  // LibreLinkUp fields
  const [libreEmail, setLibreEmail] = useState(settings?.libreEmail ?? "");
  const [librePassword, setLibrePassword] = useState("");

  // CareLink fields — CSV import only, no credentials (see carelink-csv.ts).
  const [careLinkLastImportAt, setCareLinkLastImportAt] = useState(
    settings?.careLinkLastImportAt ?? null,
  );
  const [careLinkReadingCount, setCareLinkReadingCount] = useState(
    settings?.careLinkReadingCount ?? 0,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [careLink, setCareLink] = useState<CareLinkState>({ kind: "idle" });

  // No display settings here: the unit is toggled from the chart header, and
  // the alert limits / target range are read from the glucose source itself
  // (the LibreLink app or the Nightscout site).

  const [test, setTest] = useState<TestState>({ kind: "idle" });
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const libreErrorMessage = (error: string): string => {
    switch (error) {
      case "invalid-credentials":
        return t.libreInvalidCredentials;
      case "terms":
        return t.libreTermsPending;
      case "no-connections":
        return t.libreNoConnections;
      case "missing-credentials":
        return t.libreMissingCredentials;
      default:
        return t.libreTestUnreachable;
    }
  };

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

  const canTest =
    source === "nightscout"
      ? Boolean(url)
      : source === "librelinkup"
        ? Boolean(libreEmail && (librePassword || settings?.hasLibreCredentials))
        : false;

  // CareLink needs no credentials — picking it is always a valid save. Data
  // comes from the separate "Import" action below, not from this form's
  // Save button.
  const canSave = source === "carelink" ? true : canTest;

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

  const handleTest = async () => {
    setTest({ kind: "testing" });
    if (source === "nightscout") {
      const result = await testNightscoutConnection({
        nightscoutUrl: url,
        nightscoutToken: token || undefined,
        // If the user hasn't typed a new token, test with the stored one.
        useSavedToken: !token && Boolean(settings?.hasToken),
      });
      if (result.ok) {
        setTest({ kind: "ok", message: t.testSuccess.replace("{name}", result.serverName) });
      } else {
        const message =
          result.error === "unauthorized"
            ? t.testUnauthorized
            : result.error === "invalid-url"
              ? t.invalidUrl
              : t.testUnreachable;
        setTest({ kind: "error", message });
      }
      return;
    }

    const result = await testLibreConnection({
      libreEmail,
      librePassword: librePassword || undefined,
      useSavedPassword: !librePassword && Boolean(settings?.hasLibreCredentials),
    });
    if (result.ok) {
      setTest({
        kind: "ok",
        message: t.libreTestSuccess.replace("{count}", String(result.patients.length)),
      });
    } else {
      setTest({ kind: "error", message: libreErrorMessage(result.error) });
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveMessage(null);
    const result = await saveGlucoseSettings({
      source,
      nightscoutUrl: url || undefined,
      // Empty field keeps the stored secret (undefined = "no change").
      nightscoutToken: token || undefined,
      libreEmail: libreEmail || undefined,
      librePassword: librePassword || undefined,
      // Unit and thresholds intentionally omitted — the server keeps the
      // stored values, and the source overrides thresholds on each fetch.
    });
    setSaving(false);
    if (result.ok) {
      setSaveMessage({ ok: true, text: t.saved });
      setToken("");
      setLibrePassword("");
      onSaved(result.settings);
    } else {
      const text =
        result.error === "invalid-url"
          ? t.invalidUrl
          : source === "librelinkup"
            ? libreErrorMessage(result.error)
            : t.saveError;
      setSaveMessage({ ok: false, text });
    }
  };

  const inputClass =
    "w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring";
  const labelClass = "block text-xs font-medium text-sidebar-foreground/70 mb-1";
  const pillGroupClass = "flex rounded-full bg-sidebar-accent p-1 w-fit";
  const pillClass = (active: boolean) =>
    `rounded-full px-4 py-1.5 text-xs font-medium transition ${
      active
        ? "bg-sidebar text-sidebar-foreground shadow-sm"
        : "text-sidebar-foreground/60 hover:text-sidebar-foreground"
    }`;

  return (
    <div>
      <h2 className="text-base font-semibold">
        {source === "librelinkup"
          ? t.libreSettingsTitle
          : source === "carelink"
            ? t.careLinkSettingsTitle
            : t.settingsTitle}
      </h2>
      <p className="mt-1 text-sm text-sidebar-foreground/70 text-pretty">
        {source === "librelinkup"
          ? t.libreSettingsSubtitle
          : source === "carelink"
            ? t.careLinkSettingsSubtitle
            : t.settingsSubtitle}
      </p>

      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        {/* Source selector */}
        <fieldset>
          <legend className={labelClass}>{t.sourceLabel}</legend>
          <div className={pillGroupClass}>
            {(["librelinkup", "nightscout", "carelink"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setSource(s);
                  setTest({ kind: "idle" });
                  setSaveMessage(null);
                  setCareLink({ kind: "idle" });
                }}
                aria-pressed={source === s}
                className={pillClass(source === s)}
              >
                {s === "librelinkup" ? t.sourceLibre : s === "carelink" ? t.sourceCareLink : t.sourceNightscout}
              </button>
            ))}
          </div>
          {source === "librelinkup" && (
            <p className="mt-2 text-xs text-sidebar-foreground/60 text-pretty">
              {t.sourceLibreHint}
            </p>
          )}
          {source === "carelink" && (
            <p className="mt-2 text-xs text-sidebar-foreground/60 text-pretty">
              {t.sourceCareLinkHint}
            </p>
          )}
        </fieldset>

        {source === "librelinkup" ? (
          <>
            {/* LibreLinkUp email */}
            <div>
              <label htmlFor="libre-email" className={labelClass}>
                {t.libreEmail}
              </label>
              <input
                id="libre-email"
                type="email"
                required
                value={libreEmail}
                onChange={(e) => setLibreEmail(e.target.value)}
                placeholder={t.libreEmailPlaceholder}
                autoComplete="off"
                inputMode="email"
                className={inputClass}
              />
            </div>

            {/* LibreLinkUp password */}
            <div>
              <label htmlFor="libre-password" className={labelClass}>
                {t.librePassword}
              </label>
              <input
                id="libre-password"
                type="password"
                value={librePassword}
                onChange={(e) => setLibrePassword(e.target.value)}
                placeholder={settings?.hasLibreCredentials ? "••••••••" : ""}
                autoComplete="off"
                className={inputClass}
              />
              <p className="mt-1 text-xs text-sidebar-foreground/60 text-pretty">
                {settings?.hasLibreCredentials ? t.librePasswordSaved : t.librePasswordHint}
              </p>
            </div>
          </>
        ) : source === "carelink" ? (
          <>
            {/* CareLink CSV import — no credentials: upload the export
                downloaded from CareLink Personal's Informes page. */}
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
              <p className="text-xs text-sidebar-foreground/60 text-pretty">
                {careLinkLastImportAt
                  ? t.careLinkLastImport
                      .replace("{time}", new Date(careLinkLastImportAt).toLocaleString(locale))
                      .replace("{count}", formatCount(careLinkReadingCount))
                  : t.careLinkNoImportYet}
              </p>
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
          </>
        ) : (
          <>
            {/* Nightscout URL */}
            <div>
              <label htmlFor="ns-url" className={labelClass}>
                {t.nsUrl}
              </label>
              <input
                id="ns-url"
                type="url"
                required
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={t.nsUrlPlaceholder}
                autoComplete="off"
                inputMode="url"
                className={inputClass}
              />
            </div>

            {/* Access token */}
            <div>
              <label htmlFor="ns-token" className={labelClass}>
                {t.nsToken}
              </label>
              <input
                id="ns-token"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder={settings?.hasToken ? "••••••••" : ""}
                autoComplete="off"
                className={inputClass}
              />
              <p className="mt-1 text-xs text-sidebar-foreground/60 text-pretty">
                {settings?.hasToken ? t.nsTokenSaved : t.nsTokenHint}
              </p>
            </div>
          </>
        )}

        {/* Display unit lives in the chart header, and the alert/target ranges
            come from the source — so this form is connection-only. Doesn't
            apply to CareLink: a CSV export carries no alert config to read. */}
        {source !== "carelink" && (
          <p className="text-xs text-sidebar-foreground/60 text-pretty">
            {t.thresholdsFromSource}
          </p>
        )}

        {/* Connection test feedback */}
        {test.kind === "ok" && (
          <div className="flex items-center gap-2 rounded-xl bg-chart-2/15 px-3 py-2 text-sm text-chart-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{test.message}</span>
          </div>
        )}
        {test.kind === "error" && (
          <div
            role="alert"
            className="flex items-center gap-2 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            <XCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{test.message}</span>
          </div>
        )}
        {saveMessage && (
          <div
            role={saveMessage.ok ? "status" : "alert"}
            className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${
              saveMessage.ok
                ? "bg-chart-2/15 text-chart-2"
                : "bg-destructive/10 text-destructive"
            }`}
          >
            {saveMessage.ok ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            ) : (
              <XCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            )}
            <span>{saveMessage.text}</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3 pt-1">
          {/* No connection to test for CareLink — the file preview above is
              its check. */}
          {source !== "carelink" && (
            <button
              type="button"
              onClick={handleTest}
              disabled={!canTest || test.kind === "testing"}
              className="flex items-center gap-2 rounded-full border border-sidebar-border px-4 py-2 text-sm font-medium hover:bg-sidebar-accent active:scale-95 transition disabled:opacity-50 disabled:pointer-events-none"
            >
              {test.kind === "testing" && (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              )}
              {test.kind === "testing" ? t.testing : t.testConnection}
            </button>
          )}
          <button
            type="submit"
            disabled={!canSave || saving}
            className="flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 active:scale-95 transition disabled:opacity-50 disabled:pointer-events-none"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {saving ? t.saving : t.save}
          </button>
        </div>
      </form>
    </div>
  );
}
