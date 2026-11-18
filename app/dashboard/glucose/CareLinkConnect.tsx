"use client";

// Live CareLink (CarePartner API) sign-in. Medtronic's Auth0 login requires a
// reCAPTCHA (verified: a server-side password POST is rejected with 400) and
// redirects to the app's custom scheme, so the owner signs in in their own tab
// and pastes the redirect address back here. Done once; the cron keeps it alive.

import { useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { CheckCircle2, ExternalLink, Loader2, RefreshCw, XCircle } from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";
import { completeCareLinkConnect, disconnectCareLink, startCareLinkConnect } from "@/lib/glucose/actions";
import type { GlucoseSettings } from "@/lib/glucose/types";

type Message = { ok: boolean; text: string; detail?: string } | null;

// These mean the one-time code is spent or stale, so pasting it again is pointless.
const CODE_SPENT_ERRORS = new Set(["invalid-grant", "expired", "state-mismatch"]);
type Browser = "chrome" | "firefox" | "safari";

const hasCode = (value: string) => /[?&]code=[^&#\s'"]+/.test(value);
const isRequestUrl = (value: string) => /carelink-login\.|\/authorize\/resume|\/u\/login/i.test(value);

function detectBrowser(): Browser {
  if (typeof navigator === "undefined") return "chrome";
  const ua = navigator.userAgent;
  if (/firefox|fxios/i.test(ua)) return "firefox";
  if (/safari/i.test(ua) && !/chrome|chromium|crios|edg/i.test(ua)) return "safari";
  return "chrome";
}

export default function CareLinkConnect({
  settings,
  onChanged,
}: {
  settings: GlucoseSettings | null;
  onChanged: (settings: GlucoseSettings) => void;
}) {
  const { dict, locale } = useI18n();
  const t = dict.glucose;

  const [reconnecting, setReconnecting] = useState(false);
  const [started, setStarted] = useState(false);
  const [redirect, setRedirect] = useState("");
  const [busy, setBusy] = useState<"start" | "connect" | "disconnect" | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const [browser] = useState<Browser>(detectBrowser);

  const connected = Boolean(settings?.careLinkConnected);
  const needsReconnect = Boolean(settings?.careLinkNeedsReconnect);
  const showFlow = !connected || reconnecting;

  const errorText = (error: string) => {
    switch (error) {
      case "invalid-input":
        return t.careLinkErrorInvalidInput;
      case "expired":
        return t.careLinkErrorExpired;
      case "state-mismatch":
        return t.careLinkErrorState;
      case "invalid-grant":
        return t.careLinkErrorGrant;
      case "no-username":
        return t.careLinkErrorNoUsername;
      case "no-patients":
        return t.careLinkErrorNoPatients;
      case "upgrade-required":
        return t.careLinkErrorUpgrade;
      default:
        return t.careLinkErrorUnreachable;
    }
  };

  const handleStart = async () => {
    // Open synchronously so the popup isn't blocked, then point it at the URL.
    const tab = window.open("about:blank", "_blank");
    setBusy("start");
    setMessage(null);
    const result = await startCareLinkConnect("EU");
    setBusy(null);
    if (!result.ok) {
      tab?.close();
      setMessage({ ok: false, text: errorText(result.error) });
      return;
    }
    if (tab) tab.location.href = result.authorizeUrl;
    else window.open(result.authorizeUrl, "_blank", "noopener");
    setStarted(true);
  };

  const connect = async (value: string) => {
    if (busy) return;
    setBusy("connect");
    setMessage(null);
    const result = await completeCareLinkConnect(value);
    setBusy(null);
    if (!result.ok) {
      if (CODE_SPENT_ERRORS.has(result.error)) setRedirect("");
      setMessage({ ok: false, text: errorText(result.error), detail: result.detail });
      return;
    }
    setRedirect("");
    setStarted(false);
    setReconnecting(false);
    setMessage({ ok: true, text: t.careLinkConnectSuccess.replace("{count}", String(result.readingsAdded)) });
    onChanged(result.settings);
  };

  // The DevTools request URL (…/authorize/resume?state=…) is the easy thing
  // to copy by mistake; the code lives in that response's Location header.
  const submitRedirect = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (!hasCode(trimmed) && isRequestUrl(trimmed)) {
      setMessage({ ok: false, text: t.careLinkErrorRequestUrl });
      return;
    }
    void connect(trimmed);
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData("text").trim();
    e.preventDefault();
    setRedirect(pasted);
    if (hasCode(pasted) || isRequestUrl(pasted)) submitRedirect(pasted);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" || e.nativeEvent.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    submitRedirect(redirect);
  };

  const handleDisconnect = async () => {
    setBusy("disconnect");
    const result = await disconnectCareLink();
    setBusy(null);
    setMessage(null);
    if (result.ok && result.settings) onChanged(result.settings);
  };

  const helpItems: { id: Browser; text: string }[] = [
    { id: "chrome", text: t.careLinkHelpChrome },
    { id: "firefox", text: t.careLinkHelpFirefox },
    { id: "safari", text: t.careLinkHelpSafari },
  ];
  const orderedHelp = [...helpItems.filter((h) => h.id === browser), ...helpItems.filter((h) => h.id !== browser)];

  return (
    <section className="rounded-xl border border-sidebar-border p-4" aria-labelledby="carelink-live-title">
      <h3 id="carelink-live-title" className="text-sm font-semibold">
        {t.careLinkLiveTitle}
      </h3>

      {connected && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <p className="flex items-center gap-1.5 text-sm">
              <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden="true" />
              {t.careLinkConnected.replace("{name}", settings?.careLinkPatientName ?? "CareLink")}
            </p>
            <p className="text-xs text-sidebar-foreground/60">
              {settings?.careLinkLastSyncAt
                ? t.careLinkLastSync.replace("{time}", new Date(settings.careLinkLastSyncAt).toLocaleString(locale))
                : t.careLinkNeverSynced}
            </p>
            <p className="text-xs text-sidebar-foreground/60">{t.careLinkKeepAlive}</p>
          </div>
          {!reconnecting && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setReconnecting(true);
                  setMessage(null);
                }}
                disabled={busy !== null}
                className="flex items-center gap-1.5 rounded-full bg-sidebar-accent px-3 py-1.5 text-xs font-medium hover:text-sidebar-foreground disabled:opacity-50"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                {t.careLinkReconnect}
              </button>
              <button
                type="button"
                onClick={handleDisconnect}
                disabled={busy !== null}
                className="rounded-full bg-sidebar-accent px-3 py-1.5 text-xs font-medium hover:text-sidebar-foreground disabled:opacity-50"
              >
                {busy === "disconnect" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-label={t.careLinkDisconnect} />
                ) : (
                  t.careLinkDisconnect
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {showFlow && (
        <div className={`flex flex-col gap-3 ${connected ? "mt-4 border-t border-sidebar-border pt-4" : "mt-2"}`}>
          <p className="text-xs leading-relaxed text-sidebar-foreground/70 text-pretty">
            {needsReconnect ? t.careLinkReconnectNeeded : t.careLinkLiveIntro}
          </p>
          <p className="text-xs font-medium text-primary text-pretty">{t.careLinkOnceNote}</p>

          <ol className="flex flex-col gap-3">
            <li className="flex flex-col gap-2">
              <p className="text-xs leading-relaxed text-sidebar-foreground/70 text-pretty">{t.careLinkStep1}</p>
              <button
                type="button"
                onClick={handleStart}
                disabled={busy !== null}
                className="flex w-fit items-center gap-1.5 rounded-full bg-sidebar-accent px-3 py-1.5 text-xs font-medium hover:text-sidebar-foreground disabled:opacity-50"
              >
                {busy === "start" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {t.careLinkOpenLogin}
              </button>
            </li>

            {started && (
              <li>
                <div className="flex flex-col gap-2">
                  <p className="text-xs leading-relaxed text-sidebar-foreground/70 text-pretty">{t.careLinkStep2}</p>
                  <label htmlFor="carelink-redirect" className="text-xs font-medium text-sidebar-foreground/70">
                    {t.careLinkRedirectLabel}
                  </label>
                  <input
                    id="carelink-redirect"
                    value={redirect}
                    onChange={(e) => setRedirect(e.target.value)}
                    onPaste={handlePaste}
                    onKeyDown={handleKeyDown}
                    placeholder={t.careLinkRedirectPlaceholder}
                    autoComplete="off"
                    spellCheck={false}
                    disabled={busy === "connect"}
                    aria-describedby="carelink-paste-hint"
                    className="w-full rounded-xl border border-input bg-background px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
                  />
                  <p id="carelink-paste-hint" className="text-xs text-sidebar-foreground/50">
                    {t.careLinkPasteHint}
                  </p>

                  <details className="rounded-xl bg-sidebar-accent/50 px-3 py-2 text-xs">
                    <summary className="cursor-pointer font-medium text-sidebar-foreground/80">
                      {t.careLinkHelpTitle}
                    </summary>
                    <ul className="mt-2 flex flex-col gap-2 leading-relaxed text-sidebar-foreground/70">
                      {orderedHelp.map((h) => (
                        <li key={h.id} className={h.id === browser ? "text-sidebar-foreground" : undefined}>
                          {h.text}
                        </li>
                      ))}
                      <li className="text-sidebar-foreground/50">{t.careLinkHelpMobile}</li>
                    </ul>
                  </details>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => submitRedirect(redirect)}
                      disabled={!redirect.trim() || busy !== null}
                      className="flex w-fit items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
                    >
                      {busy === "connect" && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                      {busy === "connect" ? t.careLinkConnecting : t.careLinkConnectButton}
                    </button>
                  </div>
                </div>
              </li>
            )}
          </ol>

          {reconnecting && (
            <button
              type="button"
              onClick={() => {
                setReconnecting(false);
                setStarted(false);
                setRedirect("");
                setMessage(null);
              }}
              disabled={busy !== null}
              className="w-fit text-xs text-sidebar-foreground/60 underline-offset-2 hover:underline disabled:opacity-50"
            >
              {t.careLinkCancel}
            </button>
          )}
        </div>
      )}

      {message && (
        <p
          role="status"
          className={`mt-3 flex items-start gap-1.5 text-xs ${message.ok ? "text-primary" : "text-destructive"}`}
        >
          {message.ok ? (
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          ) : (
            <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          )}
          <span className="flex min-w-0 flex-col gap-1">
            {message.text}
            {message.detail && (
              <span className="break-words font-mono text-[11px] text-sidebar-foreground/50">{message.detail}</span>
            )}
          </span>
        </p>
      )}
    </section>
  );
}
