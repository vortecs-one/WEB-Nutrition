"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType, NotFoundException } from "@zxing/library";
import { Loader2, CameraOff, VideoOff } from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";

// Product barcodes — restrict to common retail 1D formats for speed.
const PRODUCT_FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.ITF,
];

const hints = new Map();
hints.set(DecodeHintType.POSSIBLE_FORMATS, PRODUCT_FORMATS);
hints.set(DecodeHintType.TRY_HARDER, true);

export default function BarcodeScanner({
  active,
  onDetected,
}: {
  /** When false the camera stream is stopped but the frame stays visible. */
  active: boolean;
  onDetected: (code: string) => void;
}) {
  const { dict } = useI18n();
  const t = dict.nutritionUser;

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const detectedRef = useRef(false);

  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Manual rAF-driven decode loop — fires once per animation frame and retries
  // until a barcode is found or the scanner is deactivated. This is far more
  // reliable on mobile than ZXing's internal polling (`decodeFromStream`).
  const startDecodeLoop = useCallback(
    (reader: BrowserMultiFormatReader, video: HTMLVideoElement) => {
      const tick = () => {
        if (detectedRef.current) return;
        if (!streamRef.current) return;

        try {
          const result = reader.decodeFromVideoElement(video);
          const text = result.getText().replace(/\D+/g, "");
          if (text && !detectedRef.current) {
            detectedRef.current = true;
            // Stop the stream immediately after detection.
            streamRef.current?.getTracks().forEach((tr) => tr.stop());
            streamRef.current = null;
            onDetected(text);
          }
        } catch (err) {
          // NotFoundException is normal — no barcode in this frame yet.
          if (err instanceof NotFoundException) {
            rafRef.current = requestAnimationFrame(tick);
          } else {
            console.error("[v0] BarcodeScanner decode error:", err);
            rafRef.current = requestAnimationFrame(tick);
          }
        }
      };

      rafRef.current = requestAnimationFrame(tick);
    },
    [onDetected],
  );

  const stopAll = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    detectedRef.current = false;
  }, []);

  useEffect(() => {
    if (!active) {
      stopAll();
      setStarting(false);
      setError(null);
      return;
    }

    let cancelled = false;

    setStarting(true);
    setError(null);
    detectedRef.current = false;

    const reader = new BrowserMultiFormatReader(hints);

    async function start() {
      try {
        if (
          typeof navigator === "undefined" ||
          !navigator.mediaDevices?.getUserMedia
        ) {
          if (!cancelled) setError(t.scannerNoCamera);
          return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((tr) => tr.stop());
          return;
        }

        streamRef.current = stream;

        const video = videoRef.current!;
        video.srcObject = stream;
        video.setAttribute("playsinline", "true");
        video.setAttribute("muted", "true");

        await video.play();

        if (cancelled) {
          stopAll();
          return;
        }

        setStarting(false);

        // Small delay to let the first frames settle (especially on Android).
        await new Promise((r) => setTimeout(r, 300));

        if (!cancelled) {
          startDecodeLoop(reader, video);
        }
      } catch (err) {
        if (!cancelled) {
          const name = (err as { name?: string })?.name;
          setError(
            name === "NotFoundError" || name === "OverconstrainedError"
              ? t.scannerNoCamera
              : t.scannerError,
          );
          setStarting(false);
        }
      }
    }

    void start();

    return () => {
      cancelled = true;
      stopAll();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-black">
      {/* Camera viewport */}
      <div className="relative aspect-[4/3] w-full">

        {/* Idle / camera-off state */}
        {!active && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-8 text-center">
            <VideoOff className="h-9 w-9 text-white/40" aria-hidden="true" />
            <p className="text-sm text-white/50 text-pretty">{t.scanBarcode}</p>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-8 text-center">
            <CameraOff className="h-9 w-9 text-white/70" aria-hidden="true" />
            <p className="text-sm text-white/80 text-pretty">{error}</p>
          </div>
        )}

        {/* Video — always in the DOM so the ref is always valid */}
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          ref={videoRef}
          className={`h-full w-full object-cover transition-opacity duration-300 ${
            active && !error ? "opacity-100" : "opacity-0"
          }`}
          playsInline
          muted
          autoPlay
        />

        {/* Loading spinner */}
        {active && starting && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <Loader2
              className="h-8 w-8 animate-spin text-white"
              aria-hidden="true"
            />
          </div>
        )}

        {/* Scan frame overlay */}
        {active && !starting && !error && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            {/* Vignette */}
            <div className="absolute inset-0 bg-black/50" />

            {/* Scan rectangle */}
            <div className="relative z-10 h-32 w-72 max-w-[85%] rounded-2xl bg-black/20 backdrop-blur-[1px]">
              {/* Corner brackets */}
              <span className="absolute -left-px -top-px h-8 w-8 rounded-tl-2xl border-l-[3px] border-t-[3px] border-primary" />
              <span className="absolute -right-px -top-px h-8 w-8 rounded-tr-2xl border-r-[3px] border-t-[3px] border-primary" />
              <span className="absolute -bottom-px -left-px h-8 w-8 rounded-bl-2xl border-b-[3px] border-l-[3px] border-primary" />
              <span className="absolute -bottom-px -right-px h-8 w-8 rounded-br-2xl border-b-[3px] border-r-[3px] border-primary" />

              {/* Barcode icon */}
              <div className="absolute inset-0 flex items-center justify-center">
                <svg
                  viewBox="0 0 64 40"
                  className="h-10 w-auto opacity-80"
                  aria-hidden="true"
                  fill="white"
                >
                  <rect x="0"  width="3" height="40" />
                  <rect x="5"  width="1" height="40" />
                  <rect x="8"  width="2" height="40" />
                  <rect x="12" width="1" height="40" />
                  <rect x="15" width="3" height="40" />
                  <rect x="20" width="1" height="40" />
                  <rect x="23" width="2" height="40" />
                  <rect x="27" width="1" height="40" />
                  <rect x="30" width="3" height="40" />
                  <rect x="35" width="1" height="40" />
                  <rect x="38" width="2" height="40" />
                  <rect x="42" width="1" height="40" />
                  <rect x="45" width="3" height="40" />
                  <rect x="50" width="1" height="40" />
                  <rect x="53" width="2" height="40" />
                  <rect x="57" width="1" height="40" />
                  <rect x="61" width="3" height="40" />
                </svg>
              </div>

              {/* Animated scan line */}
              <div className="absolute inset-x-2 top-1/2 h-px -translate-y-1/2 bg-primary/80 shadow-[0_0_6px_2px] shadow-primary/40 animate-[scanline_2s_ease-in-out_infinite]" />
            </div>
          </div>
        )}
      </div>

      {/* Hint text */}
      <p className="px-4 py-3 text-center text-sm text-white/80 text-pretty">
        {active && !error ? t.scannerHint : t.scanBarcode}
      </p>
    </div>
  );
}
