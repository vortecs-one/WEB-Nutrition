"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType, NotFoundException } from "@zxing/library";
import { Loader2, CameraOff, VideoOff, Zap, ZapOff } from "lucide-react";
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

// Native BarcodeDetector format equivalents (Android Chrome / modern browsers).
const NATIVE_FORMATS = [
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "code_128",
  "code_39",
  "itf",
];

// How often to attempt a decode (ms). Running every animation frame (~16ms)
// is wasteful and can starve the decoder; ~8 attempts/sec is plenty.
const DECODE_INTERVAL_MS = 120;

const hints = new Map();
hints.set(DecodeHintType.POSSIBLE_FORMATS, PRODUCT_FORMATS);
hints.set(DecodeHintType.TRY_HARDER, true);

// Minimal typing for the native BarcodeDetector API (not in TS DOM libs yet).
type NativeBarcode = { rawValue: string };
type NativeDetector = {
  detect: (source: CanvasImageSource) => Promise<NativeBarcode[]>;
};
type BarcodeDetectorCtor = {
  new (options?: { formats?: string[] }): NativeDetector;
  getSupportedFormats?: () => Promise<string[]>;
};

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
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const detectedRef = useRef(false);

  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);

  // Fire the detection callback exactly once, then tear down the stream.
  const handleFound = useCallback(
    (raw: string) => {
      const text = raw.replace(/\D+/g, "");
      if (!text || detectedRef.current) return;
      detectedRef.current = true;
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
      onDetected(text);
    },
    [onDetected],
  );

  // Decode loop. Prefers the native BarcodeDetector API (fast + reliable on
  // Android Chrome / WebView); falls back to ZXing canvas decoding elsewhere.
  const startDecodeLoop = useCallback(
    (reader: BrowserMultiFormatReader, video: HTMLVideoElement) => {
      if (!canvasRef.current) {
        canvasRef.current = document.createElement("canvas");
      }

      // Try to build a native detector if the platform supports it.
      let nativeDetector: NativeDetector | null = null;
      const Ctor = (
        globalThis as unknown as { BarcodeDetector?: BarcodeDetectorCtor }
      ).BarcodeDetector;
      if (Ctor) {
        try {
          nativeDetector = new Ctor({ formats: NATIVE_FORMATS });
        } catch {
          nativeDetector = null;
        }
      }

      const scheduleNext = () => {
        if (detectedRef.current || !streamRef.current) return;
        timerRef.current = setTimeout(tick, DECODE_INTERVAL_MS);
      };

      const decodeWithZxing = (): string | null => {
        const canvas = canvasRef.current;
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        if (!canvas || vw === 0 || vh === 0) return null;
        canvas.width = vw;
        canvas.height = vh;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return null;
        ctx.drawImage(video, 0, 0, vw, vh);
        try {
          const result = reader.decodeFromCanvas(canvas);
          return result.getText();
        } catch (err) {
          // NotFoundException just means no barcode in this frame — expected.
          if (!(err instanceof NotFoundException)) {
            console.error("BarcodeScanner ZXing error:", err);
          }
          return null;
        }
      };

      const tick = async () => {
        if (detectedRef.current || !streamRef.current) return;

        // Wait for real video dimensions before trying to decode.
        if (video.videoWidth === 0 || video.videoHeight === 0) {
          scheduleNext();
          return;
        }

        try {
          if (nativeDetector) {
            const codes = await nativeDetector.detect(video);
            if (codes && codes.length > 0 && codes[0].rawValue) {
              handleFound(codes[0].rawValue);
              return;
            }
          } else {
            const text = decodeWithZxing();
            if (text) {
              handleFound(text);
              return;
            }
          }
        } catch (err) {
          console.error("BarcodeScanner detect error:", err);
        }

        scheduleNext();
      };

      void tick();
    },
    [handleFound],
  );

  const stopAll = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    detectedRef.current = false;
    setTorchOn(false);
    setTorchSupported(false);
  }, []);

  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({
        // @ts-expect-error torch is not in standard TS types yet
        advanced: [{ torch: next }],
      });
      setTorchOn(next);
    } catch {
      // Device reported torch support but failed — hide the button.
      setTorchSupported(false);
    }
  }, [torchOn]);

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
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((tr) => tr.stop());
          return;
        }

        streamRef.current = stream;

        // Ask the camera for continuous autofocus — barcodes are usually held
        // close to the lens, and without this many Android cameras stay fixed
        // at infinity focus and never resolve the bars.
        try {
          const track = stream.getVideoTracks()[0];
          const caps = track.getCapabilities?.() as
            | { focusMode?: string[] }
            | undefined;
          if (caps?.focusMode?.includes("continuous")) {
            await track.applyConstraints({
              // @ts-expect-error focusMode isn't in the standard TS types yet
              advanced: [{ focusMode: "continuous" }],
            });
          }
        } catch {
          // Non-fatal — focus tuning is a best-effort enhancement.
        }

        // Check if the track supports the torch/flashlight constraint.
        try {
          const track = stream.getVideoTracks()[0];
          const caps = track.getCapabilities?.() as
            | { torch?: boolean }
            | undefined;
          if (caps?.torch) {
            setTorchSupported(true);
          }
        } catch {
          // Non-fatal.
        }

        const video = videoRef.current!;
        video.srcObject = stream;
        video.setAttribute("playsinline", "true");
        video.setAttribute("muted", "true");

        await video.play();

        if (cancelled) {
          stopAll();
          return;
        }

        // Wait until the video actually has frame data before decoding.
        if (video.readyState < 2) {
          await new Promise<void>((resolve) => {
            const onReady = () => {
              video.removeEventListener("loadeddata", onReady);
              resolve();
            };
            video.addEventListener("loadeddata", onReady);
          });
        }

        if (cancelled) {
          stopAll();
          return;
        }

        setStarting(false);

        // Small delay to let autofocus settle (especially on Android).
        await new Promise((r) => setTimeout(r, 400));

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
      <div className="relative aspect-[16/9] w-full max-w-sm mx-auto">

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

            {/* Torch toggle — only shown when the device supports it */}
            {torchSupported && (
              <button
                type="button"
                onClick={toggleTorch}
                aria-label={torchOn ? t.scannerTorchOff : t.scannerTorchOn}
                aria-pressed={torchOn}
                className={`pointer-events-auto absolute bottom-4 right-4 z-20 flex h-10 w-10 items-center justify-center rounded-full border transition-colors duration-200 ${
                  torchOn
                    ? "border-primary bg-primary text-black"
                    : "border-white/40 bg-black/50 text-white/80 hover:border-white/70 hover:text-white"
                }`}
              >
                {torchOn ? (
                  <ZapOff className="h-5 w-5" aria-hidden="true" />
                ) : (
                  <Zap className="h-5 w-5" aria-hidden="true" />
                )}
              </button>
            )}
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
