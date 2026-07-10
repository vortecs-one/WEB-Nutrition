"use client";

// Nightscout connection settings: URL + token, display unit, alert limits
// and target range. The token is write-only from the client's perspective —
// we only know whether one is stored (settings.hasToken).

import { useState, type FormEvent } from "react";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";
import {
  saveGlucoseSettings,
  testNightscoutConnection,
} from "@/lib/glucose/actions";
import type { GlucoseSettings, GlucoseUnit } from "@/lib/glucose/types";

type TestState =
  | { kind: "idle" }
  | { kind: "testing" }
  | { kind: "ok"; name: string }
  | { kind: "error"; message: string };

export default function GlucoseSettingsForm({
  settings,
  onSaved,
}: {
  settings: GlucoseSettings | null;
  onSaved: (settings: GlucoseSettings) => void;
}) {
  const { dict } = useI18n();
  const t = dict.glucose;

  const [url, setUrl] = useState(settings?.nightscoutUrl ?? "");
  const [token, setToken] = useState("");
  const [unit, setUnit] = useState<GlucoseUnit>(settings?.unit ?? "mgdl");
  const [lowThreshold, setLowThreshold] = useState(settings?.lowThreshold ?? 70);
  const [highThreshold, setHighThreshold] = useState(settings?.highThreshold ?? 240);
  const [targetLow, setTargetLow] = useState(settings?.targetLow ?? 70);
  const [targetHigh, setTargetHigh] = useState(settings?.targetHigh ?? 180);

  const [test, setTest] = useState<TestState>({ kind: "idle" });
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const handleTest = async () => {
    setTest({ kind: "testing" });
    const result = await testNightscoutConnection({
      nightscoutUrl: url,
      nightscoutToken: token || undefined,
      // If the user hasn't typed a new token, test with the stored one.
      useSavedToken: !token && Boolean(settings?.hasToken),
    });
    if (result.ok) {
      setTest({ kind: "ok", name: result.serverName });
    } else {
      const message =
        result.error === "unauthorized"
          ? t.testUnauthorized
          : result.error === "invalid-url"
            ? t.invalidUrl
            : t.testUnreachable;
      setTest({ kind: "error", message });
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveMessage(null);
    const result = await saveGlucoseSettings({
      nightscoutUrl: url,
      // Empty field keeps the stored token (undefined = "no change").
      nightscoutToken: token || undefined,
      unit,
      lowThreshold,
      highThreshold,
      targetLow,
      targetHigh,
    });
    setSaving(false);
    if (result.ok) {
      setSaveMessage({ ok: true, text: t.saved });
      setToken("");
      onSaved(result.settings);
    } else {
      setSaveMessage({
        ok: false,
        text: result.error === "invalid-url" ? t.invalidUrl : t.saveError,
      });
    }
  };

  const inputClass =
    "w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring";
  const labelClass = "block text-xs font-medium text-sidebar-foreground/70 mb-1";

  return (
    <section className="bg-sidebar text-sidebar-foreground rounded-3xl shadow-sm p-5">
      <h2 className="text-base font-semibold">{t.settingsTitle}</h2>
      <p className="mt-1 text-sm text-sidebar-foreground/70 text-pretty">{t.settingsSubtitle}</p>

      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
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

        {/* Unit toggle */}
        <fieldset>
          <legend className={labelClass}>{t.unit}</legend>
          <div className="flex rounded-full bg-sidebar-accent p-1 w-fit">
            {(["mgdl", "mmol"] as const).map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => setUnit(u)}
                aria-pressed={unit === u}
                className={`rounded-full px-4 py-1.5 text-xs font-medium transition ${
                  unit === u
                    ? "bg-sidebar text-sidebar-foreground shadow-sm"
                    : "text-sidebar-foreground/60 hover:text-sidebar-foreground"
                }`}
              >
                {u === "mgdl" ? t.unitMgdl : t.unitMmol}
              </button>
            ))}
          </div>
        </fieldset>

        {/* Thresholds */}
        <div>
          <div className={labelClass}>{t.thresholds}</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="ns-low" className={labelClass}>
                {t.lowThreshold}
              </label>
              <input
                id="ns-low"
                type="number"
                min={40}
                max={120}
                value={lowThreshold}
                onChange={(e) => setLowThreshold(Number(e.target.value))}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="ns-high" className={labelClass}>
                {t.highThreshold}
              </label>
              <input
                id="ns-high"
                type="number"
                min={140}
                max={400}
                value={highThreshold}
                onChange={(e) => setHighThreshold(Number(e.target.value))}
                className={inputClass}
              />
            </div>
          </div>
        </div>

        {/* Target range */}
        <div>
          <div className={labelClass}>{t.targetRange}</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="ns-target-low" className={labelClass}>
                {t.targetLow}
              </label>
              <input
                id="ns-target-low"
                type="number"
                min={40}
                max={150}
                value={targetLow}
                onChange={(e) => setTargetLow(Number(e.target.value))}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="ns-target-high" className={labelClass}>
                {t.targetHigh}
              </label>
              <input
                id="ns-target-high"
                type="number"
                min={100}
                max={300}
                value={targetHigh}
                onChange={(e) => setTargetHigh(Number(e.target.value))}
                className={inputClass}
              />
            </div>
          </div>
          <p className="mt-1 text-xs text-sidebar-foreground/60">{t.thresholdsHint}</p>
        </div>

        {/* Connection test feedback */}
        {test.kind === "ok" && (
          <div className="flex items-center gap-2 rounded-xl bg-chart-2/15 px-3 py-2 text-sm text-chart-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{t.testSuccess.replace("{name}", test.name)}</span>
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
          <button
            type="button"
            onClick={handleTest}
            disabled={!url || test.kind === "testing"}
            className="flex items-center gap-2 rounded-full border border-sidebar-border px-4 py-2 text-sm font-medium hover:bg-sidebar-accent active:scale-95 transition disabled:opacity-50 disabled:pointer-events-none"
          >
            {test.kind === "testing" && (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            )}
            {test.kind === "testing" ? t.testing : t.testConnection}
          </button>
          <button
            type="submit"
            disabled={!url || saving}
            className="flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 active:scale-95 transition disabled:opacity-50 disabled:pointer-events-none"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {saving ? t.saving : t.save}
          </button>
        </div>
      </form>
    </section>
  );
}
