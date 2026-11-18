"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Camera, Fingerprint, HeartPulse, X } from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";
import { capturePulse } from "@/lib/pulse/capture";
import { CAPTURE_MS } from "@/lib/pulse/estimate";
import { useDayLog } from "@/lib/day-log/provider";
import { localDateKey } from "@/lib/day-log/date-key";
import { isStressLevel, type StressLevel } from "@/lib/day-log/types";

type ScanState =
  | { kind: "idle" | "requesting" | "position" }
  | { kind: "measuring"; seconds: number }
  | { kind: "result"; bpm: number; stress: StressLevel | null }
  | { kind: "error"; reason: "unavailable" | "denied" | "cameraError" | "weak" };

export function PulseShortcut() {
  const { dict } = useI18n();
  const t = dict.nutritionUser.pulseScan;
  const { stressFor } = useDayLog();
  const [stress, setStress] = useState<StressLevel | null>(null);
  const stressHelp = useId();
  const title = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const stop = useRef<(() => void) | undefined>(undefined);
  const [scan, setScan] = useState<ScanState>({ kind: "idle" });
  const active = ["requesting", "position", "measuring"].includes(scan.kind);
  const totalSeconds = CAPTURE_MS / 1000;

  function cancel() {
    stop.current?.();
    stop.current = undefined;
    setScan({ kind: "idle" });
  }
  useEffect(() => {
    const hide = () => { if (document.hidden) cancel(); };
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", cancel);
    return () => {
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", cancel);
      stop.current?.();
    };
  }, []);

  function start() {
    stop.current?.();
    setScan({ kind: "requesting" });
    stop.current = capturePulse({
      progress: (seconds, covered) => setScan(covered ? { kind: "measuring", seconds } : { kind: "position" }),
      finish: result => setScan(typeof result === "number" ? { kind: "result", bpm: result, stress } : { kind: "error", reason: result }),
    });
  }
  const message = scan.kind === "error" ? t[scan.reason]
    : scan.kind === "result" ? t.result
    : scan.kind === "idle" ? t.instructions : t[scan.kind];

  return <>
    <button type="button" aria-label={t.action} aria-haspopup="dialog" title={t.action}
      onClick={() => {
        setStress(stressFor(localDateKey(new Date())));
        dialog.current?.showModal();
      }}
      className="pointer-events-auto flex size-16 shrink-0 flex-col items-center justify-center gap-1 self-start rounded-2xl bg-highlight font-bold text-highlight-foreground transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight active:scale-[0.98] sm:size-[4.5rem] sm:self-center">
      <Fingerprint aria-hidden="true" className="size-7 sm:size-8" />
      <span className="text-xs leading-none">{t.tile}</span>
    </button>
    <dialog ref={dialog} aria-labelledby={title} onClose={cancel}
      onClick={e => { if (e.target === dialog.current) dialog.current?.close(); }}
      className="pointer-events-auto fixed inset-0 m-auto max-h-[90dvh] w-[min(26rem,calc(100%-2rem))] overflow-y-auto rounded-3xl bg-sidebar p-0 text-sidebar-foreground shadow-xl backdrop:bg-background/80">
      <div className="p-5 sm:p-6">
        <header className="flex items-center justify-between gap-3">
          <h2 id={title} className="text-balance text-lg font-semibold">{t.title}</h2>
          <button type="button" aria-label={t.close} onClick={() => dialog.current?.close()} className="flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-sidebar-accent">
            <X aria-hidden="true" className="size-5" />
          </button>
        </header>
        <div className="my-5 flex flex-col items-center gap-3 rounded-2xl bg-sidebar-accent p-5 text-center text-sidebar-accent-foreground">
          {scan.kind === "result" ? <HeartPulse aria-hidden="true" className="size-10 text-highlight" /> : <Fingerprint aria-hidden="true" className="size-12 text-highlight" />}
          <div role="status" className="text-pretty text-sm leading-relaxed">
            {message}
            {scan.kind === "result" && <>
              <p className="mt-1 text-4xl font-semibold tabular-nums">{scan.bpm} <span className="text-base">{t.unit}</span></p>
              <p className="mt-4 border-t border-sidebar-foreground/15 pt-3">{t.stressLabel}</p>
              <p className="font-semibold">{scan.stress === null ? t.stressNotReported : `${scan.stress}/5 · ${dict.healthStats.stressLevels[scan.stress - 1]}`}</p>
            </>}
          </div>
          {scan.kind === "measuring" && <>
            <progress aria-label={t.measuring} max={totalSeconds} value={scan.seconds} className="h-2 w-full accent-highlight" />
            <p className="text-sm tabular-nums">{totalSeconds - scan.seconds} {t.seconds}</p>
          </>}
        </div>
        {!active && scan.kind !== "result" && <div className="mb-5">
          <label className="flex flex-col gap-2 text-sm font-semibold">
            {t.stressLabel}
            <select value={stress ?? ""} aria-describedby={stressHelp}
              onChange={e => { const level = Number(e.target.value); setStress(isStressLevel(level) ? level : null); }}
              className="min-h-11 rounded-xl border border-sidebar-foreground/20 bg-sidebar px-3 text-sm font-normal text-sidebar-foreground focus-visible:outline-highlight">
              <option value="">{t.stressNotReported}</option>
              {dict.healthStats.stressLevels.map((label, index) => <option key={label} value={index + 1}>{index + 1}/5 · {label}</option>)}
            </select>
          </label>
          <p id={stressHelp} className="mt-2 text-sm text-sidebar-foreground/75">{t.stressHelp}</p>
        </div>}
        <p className="text-sm leading-relaxed text-sidebar-foreground/75">{t.privacy}</p>
        <p className="mt-1 text-sm leading-relaxed text-sidebar-foreground/75">{t.caution}</p>
        <button type="button" onClick={active ? cancel : start} className="mt-5 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-highlight px-4 font-semibold text-highlight-foreground hover:brightness-110">
          {!active && <Camera aria-hidden="true" className="size-5" />}
          {active ? t.stop : scan.kind === "idle" ? t.start : t.retry}
        </button>
      </div>
    </dialog>
  </>;
}
