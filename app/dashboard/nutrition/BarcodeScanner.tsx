"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { X, Loader2, CameraOff } from "lucide-react";
import { useScrollLock } from "@/lib/use-scroll-lock";
import { useI18n } from "@/lib/i18n/provider";

// Product barcodes are almost always 1D retail formats — restricting the
// decoder to these makes detection noticeably faster and more reliable.
const PRODUCT_FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.ITF,
];

export default function BarcodeScanner({
  onDetected,
  onClose,
}: {
  onDetected: (code: string) => void;
  onClose: () => void;
}) {
  const { dict } = useI18n();
  const t = dict.nutritionUser;

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [starting, setStarting] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useScrollLock(true);

  useEffect(() => {
    let controls: IScannerControls | null = null;
    let cancelled = false;
    // Guard so we only report the first successful decode.
    let handled = false;

    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, PRODUCT_FORMATS);
    const reader = new BrowserMultiFormatReader(hints, {
      delayBetweenScanAttempts: 200,
    });

    async function start() {
      try {
        // Check API availability — some Android WebViews hide mediaDevices.
        if (
          typeof navigator === "undefined" ||
          !navigator.mediaDevices?.getUserMedia
        ) {
          if (!cancelled) setError(t.scannerNoCamera);
          return;
        }

        // IMPORTANT: call getUserMedia() explicitly first so Android Chrome /
        // WebView shows the OS-level camera permission dialog. Passing
        // constraints straight to decodeFromConstraints skips this step on
        // many Android builds and the permission is never requested.
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        // Keep a ref so we can stop the tracks in cleanup.
        streamRef.current = stream;

        // Attach the stream to the video element directly, then hand it to
        // the zxing reader which can decode frames from an already-playing
        // video instead of re-opening the camera.
        const video = videoRef.current!;
        video.srcObject = stream;
        video.setAttribute("playsinline", "true");
        video.setAttribute("muted", "true");
        await video.play();

        if (cancelled) return;
        setStarting(false);

        controls = await reader.decodeFromStream(
          stream,
          video,
          (result) => {
            if (result && !handled) {
              handled = true;
              const text = result.getText().replace(/\D+/g, "");
              if (text) {
                onDetected(text);
                controls?.stop();
              }
            }
          },
        );

        if (cancelled) controls?.stop();
      } catch (err) {
        if (!cancelled) {
          const name = (err as { name?: string })?.name;
          setError(
            name === "NotFoundError" || name === "OverconstrainedError"
              ? t.scannerNoCamera
              : t.scannerError,
          );
        }
      }
    }

    void start();

    return () => {
      cancelled = true;
      controls?.stop();
      // Also stop raw tracks — this releases the camera indicator on Android.
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-black"
      role="dialog"
      aria-modal="true"
      aria-label={t.scannerTitle}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-3 text-white">
        <h3 className="text-base font-semibold">{t.scannerTitle}</h3>
        <button
          type="button"
          onClick={onClose}
          aria-label={dict.common.close}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 active:scale-95 transition"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      {/* Camera viewport */}
      <div className="relative flex-1 overflow-hidden">
        {error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-8 text-center text-white">
            <CameraOff className="h-10 w-10 text-white/70" aria-hidden="true" />
            <p className="text-sm text-white/80 text-pretty">{error}</p>
          </div>
        ) : (
          <>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video
              ref={videoRef}
              className="h-full w-full object-cover"
              playsInline
              muted
              autoPlay
            />

            {starting && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                <Loader2
                  className="h-8 w-8 animate-spin text-white"
                  aria-hidden="true"
                />
              </div>
            )}

            {/* Scan frame overlay */}
            {!starting && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="relative h-40 w-72 max-w-[80%] rounded-2xl">
                  <span className="absolute -left-0.5 -top-0.5 h-8 w-8 rounded-tl-2xl border-l-4 border-t-4 border-primary" />
                  <span className="absolute -right-0.5 -top-0.5 h-8 w-8 rounded-tr-2xl border-r-4 border-t-4 border-primary" />
                  <span className="absolute -bottom-0.5 -left-0.5 h-8 w-8 rounded-bl-2xl border-b-4 border-l-4 border-primary" />
                  <span className="absolute -bottom-0.5 -right-0.5 h-8 w-8 rounded-br-2xl border-b-4 border-r-4 border-primary" />
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Hint */}
      <div className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 text-center">
        <p className="text-sm text-white/80 text-pretty">{t.scannerHint}</p>
      </div>
    </div>
  );
}
