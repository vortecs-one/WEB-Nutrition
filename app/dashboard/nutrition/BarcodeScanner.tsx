"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType, NotFoundException } from "@zxing/library";
import { Loader2, CameraOff, Camera, Zap, ZapOff, Plus, Minus } from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";
import { normalizeBarcode } from "@/lib/foods/barcode";

// Product barcodes — restrict to common retail 1D formats for speed.
//
// ITF is deliberately absent. It is a shipping-carton symbology (ITF-14) that
// consumer food packaging doesn't use, and ZXing's ITF reader is the single
// biggest source of phantom reads: with no fixed length and no mandatory check
// digit it will happily lock onto a *portion* of an EAN-13's bars and return a
// short number that looks like a real barcode.
const PRODUCT_FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
];

// Native BarcodeDetector format equivalents (Android Chrome / modern browsers).
const NATIVE_FORMATS = [
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "code_128",
  "code_39",
];

// How often to attempt a decode (ms). Running every animation frame (~16ms)
// is wasteful and can starve the decoder; ~8 attempts/sec is plenty.
const DECODE_INTERVAL_MS = 120;

// Forgiveness added around the guide box when cropping, as a fraction of the
// frame's LARGER dimension — so the pad is isotropic in sensor pixels, which
// under object-cover's uniform scale is isotropic on screen too.
//
// Padding relative to the BOX was the wrong knob: the guide box already covers
// most of the frame, so a margin proportional to the box scales with the very
// thing it is meant to pad and saturates at the frame edge. At the previous
// 0.35/0.30 the "crop" worked out to 95-100% of the frame at every real
// viewport width — the crop was a no-op, and the upscale that followed it was
// interpolating a full frame for nothing. Frame-relative padding is bounded by
// construction and gives constant on-screen forgiveness regardless of box size.
const ROI_PAD_FRAME = 0.04;

// Normalize the decoded bitmap to a fixed width rather than blindly upscaling:
// upscale small crops, DOWNSCALE oversized ones. 1280px keeps several pixels
// on each of an EAN-13's 95 modules — clear of the floor where thin bars start
// aliasing away — while costing ~9x fewer pixels per tick than drawing the
// full frame at 2x. It also makes cost independent of stream resolution, so
// asking the camera for 1440p buys a genuine supersample instead of just work.
const TARGET_DECODE_WIDTH = 1280;
const MAX_DECODE_SCALE = 3; // past ~3x it's interpolation, not information
const MAX_DECODE_PIXELS = 1_600_000; // ceiling for pathological aspect ratios

// Every Nth tick, decode the full frame instead of the cropped ROI, in case
// the user hasn't aligned the barcode to the guide box yet.
const FULL_FRAME_EVERY_N_TICKS = 5;
const MIN_CROP_DIMENSION_PX = 20;

// Some builds construct a BarcodeDetector successfully but reject every
// detect() call. Give up on it after this many consecutive failures so the
// ZXing fallback can take over instead of the scanner silently never working.
const NATIVE_FAILURE_LIMIT = 3;

// Codes that can't be checksum-verified must be seen this many times, within
// this window, before we act on them.
const CONFIRMATIONS_REQUIRED = 2;
const CONFIRM_WINDOW_MS = 1500;

const SUCCESS_VIBRATE_MS = 30;
const SUCCESS_FLASH_MS = 450;
const FOCUS_RING_MS = 700;
// How long to let a forced single-shot sweep run before handing control back
// to continuous autofocus.
const FOCUS_HANDBACK_MS = 900;
// Re-trigger focus after this long with no candidate decode at all.
const AF_NUDGE_IDLE_MS = 3000;

const hints = new Map();
hints.set(DecodeHintType.POSSIBLE_FORMATS, PRODUCT_FORMATS);
hints.set(DecodeHintType.TRY_HARDER, true);

// The camera-control fields below live in the Media Capture extensions and
// aren't in TypeScript's DOM lib yet. They're declared locally rather than
// silenced with @ts-expect-error, which would turn into a build ERROR the day
// TypeScript ships them (an unused expect-error is itself an error, and
// `next build` type-checks).
type ExtraConstraintSet = MediaTrackConstraintSet & {
  torch?: boolean;
  zoom?: number;
  focusMode?: "none" | "manual" | "single-shot" | "continuous";
  focusDistance?: number;
  pointsOfInterest?: { x: number; y: number }[];
};
type ExtraConstraints = MediaTrackConstraints & {
  resizeMode?: "none" | "crop-and-scale";
  advanced?: ExtraConstraintSet[];
};
// Note MediaSettingsRange has every field optional, so runtime typeof guards
// on min/max/step are load-bearing, not decorative.
type ExtraCapabilities = MediaTrackCapabilities & {
  torch?: boolean;
  zoom?: MediaSettingsRange;
  focusMode?: string[];
  focusDistance?: MediaSettingsRange;
  pointsOfInterest?: unknown;
};

type FocusMode = "continuous" | "single-shot" | "manual";

// Camera constraint tiers, tried in order. Falling back only on
// OverconstrainedError — other errors (permission denied, no camera) won't
// be fixed by loosening resolution and should surface immediately.
//
// Everything is `ideal`, so the UA silently picks the nearest supported mode
// rather than throwing; the chain is mostly insurance for facingMode/frameRate
// on unusual devices. resizeMode "none" asks for the sensor's native output
// instead of a UA-rescaled one, and is only meaningful on the top tier.
const CONSTRAINT_TIERS: ExtraConstraints[] = [
  {
    facingMode: { ideal: "environment" },
    width: { ideal: 2560 },
    height: { ideal: 1440 },
    frameRate: { ideal: 30, min: 15 },
    resizeMode: "none",
  },
  {
    facingMode: { ideal: "environment" },
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    frameRate: { ideal: 30, min: 15 },
  },
  {
    facingMode: { ideal: "environment" },
    width: { ideal: 1280 },
    height: { ideal: 720 },
  },
  { facingMode: { ideal: "environment" } },
];

async function getCameraStream(): Promise<MediaStream> {
  let lastErr: unknown;
  for (const constraints of CONSTRAINT_TIERS) {
    try {
      return await navigator.mediaDevices.getUserMedia({
        video: constraints,
        audio: false,
      });
    } catch (err) {
      lastErr = err;
      if ((err as { name?: string })?.name !== "OverconstrainedError") {
        throw err;
      }
    }
  }
  throw lastErr;
}

// Best-effort autofocus: continuous AF is ideal for barcodes held close to
// the lens; fall back to a single-shot trigger or a near manual focus
// distance on devices that don't support continuous mode. Returns the mode it
// managed to apply, so the caller knows whether re-triggering is worthwhile.
async function applyBestEffortFocus(
  track: MediaStreamTrack,
): Promise<FocusMode | null> {
  try {
    const caps = track.getCapabilities?.() as ExtraCapabilities | undefined;
    if (!caps?.focusMode) return null;

    if (caps.focusMode.includes("continuous")) {
      await track.applyConstraints({
        advanced: [{ focusMode: "continuous" }],
      } as ExtraConstraints);
      return "continuous";
    }
    if (caps.focusMode.includes("single-shot")) {
      await track.applyConstraints({
        advanced: [{ focusMode: "single-shot" }],
      } as ExtraConstraints);
      return "single-shot";
    }
    if (
      caps.focusMode.includes("manual") &&
      typeof caps.focusDistance?.min === "number" &&
      typeof caps.focusDistance?.max === "number"
    ) {
      // MediaTrackCapabilities convention: min = closest focus distance.
      // Barcodes are scanned at close range, so bias near the near end.
      const near =
        caps.focusDistance.min +
        (caps.focusDistance.max - caps.focusDistance.min) * 0.1;
      await track.applyConstraints({
        advanced: [{ focusMode: "manual", focusDistance: near }],
      } as ExtraConstraints);
      return "manual";
    }
  } catch {
    // Non-fatal — focus tuning is a best-effort enhancement.
  }
  return null;
}

// Force a fresh autofocus sweep, optionally at a point of interest.
//
// Re-applying focusMode "continuous" does nothing on a device already in
// continuous mode — the constraint is already satisfied, so no sweep starts.
// Only a single-shot request actually re-focuses, after which control is
// handed back to continuous.
async function retriggerFocus(
  track: MediaStreamTrack,
  poi?: { x: number; y: number },
) {
  try {
    const caps = track.getCapabilities?.() as ExtraCapabilities | undefined;
    if (!caps?.focusMode) return;

    if (poi && caps.pointsOfInterest) {
      await track.applyConstraints({
        advanced: [{ pointsOfInterest: [poi] }],
      } as ExtraConstraints);
    }

    if (caps.focusMode.includes("single-shot")) {
      await track.applyConstraints({
        advanced: [{ focusMode: "single-shot" }],
      } as ExtraConstraints);
      if (caps.focusMode.includes("continuous")) {
        setTimeout(() => void applyBestEffortFocus(track), FOCUS_HANDBACK_MS);
      }
      return;
    }

    if (caps.focusMode.includes("manual")) {
      await applyBestEffortFocus(track);
    }
    // Continuous-only device: nothing to re-trigger, it's already tracking.
  } catch {
    // Non-fatal.
  }
}

type CoverMapping = { scale: number; offsetX: number; offsetY: number };

// The scale/offset `object-fit: cover` applies: uniform scale that fills the
// rendered box, overflow cropped, centered on both axes (the default
// object-position of 50% 50% — the <video> sets no object-position utility).
function computeCoverMapping(
  video: HTMLVideoElement,
  videoBox: DOMRect,
): CoverMapping | null {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (vw === 0 || vh === 0) return null;
  if (videoBox.width === 0 || videoBox.height === 0) return null;

  const scale = Math.max(videoBox.width / vw, videoBox.height / vh);
  return {
    scale,
    offsetX: (vw * scale - videoBox.width) / 2,
    offsetY: (vh * scale - videoBox.height) / 2,
  };
}

type CropRect = { sx: number; sy: number; sw: number; sh: number };

// Maps the on-screen guide box onto video-intrinsic-pixel coordinates.
function computeCropRect(
  video: HTMLVideoElement,
  guideBox: HTMLDivElement,
): CropRect | null {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const videoBox = video.getBoundingClientRect();
  const map = computeCoverMapping(video, videoBox);
  if (!map) return null;

  const rectBox = guideBox.getBoundingClientRect();
  const { scale, offsetX, offsetY } = map;

  const x0 = (rectBox.left - videoBox.left + offsetX) / scale;
  const y0 = (rectBox.top - videoBox.top + offsetY) / scale;
  const x1 = (rectBox.right - videoBox.left + offsetX) / scale;
  const y1 = (rectBox.bottom - videoBox.top + offsetY) / scale;
  if (x1 <= x0 || y1 <= y0) return null;

  const pad = Math.max(vw, vh) * ROI_PAD_FRAME;
  const sx = Math.max(0, x0 - pad);
  const sy = Math.max(0, y0 - pad);
  const sw = Math.min(vw, x1 + pad) - sx;
  const sh = Math.min(vh, y1 + pad) - sy;

  if (sw < MIN_CROP_DIMENSION_PX || sh < MIN_CROP_DIMENSION_PX) return null;

  return { sx, sy, sw, sh };
}

// Un-project a viewport point onto normalized (0..1) video-intrinsic
// coordinates, which is what pointsOfInterest expects.
function screenToVideoPoint(
  video: HTMLVideoElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } | null {
  const videoBox = video.getBoundingClientRect();
  const map = computeCoverMapping(video, videoBox);
  if (!map) return null;
  const { scale, offsetX, offsetY } = map;
  const x = (clientX - videoBox.left + offsetX) / scale / video.videoWidth;
  const y = (clientY - videoBox.top + offsetY) / scale / video.videoHeight;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return {
    x: Math.min(1, Math.max(0, x)),
    y: Math.min(1, Math.max(0, y)),
  };
}

// Scale factor that lands the decoded bitmap near TARGET_DECODE_WIDTH,
// upscaling small crops and downscaling oversized ones.
function fitScale(sw: number, sh: number): number {
  let scale = Math.min(TARGET_DECODE_WIDTH / sw, MAX_DECODE_SCALE);
  if (sw * sh * scale * scale > MAX_DECODE_PIXELS) {
    scale = Math.sqrt(MAX_DECODE_PIXELS / (sw * sh));
  }
  return scale;
}

// Map ZXing's format enum onto the same lowercase vocabulary the native
// BarcodeDetector uses, so barcode validation sees one format namespace.
function zxingFormatTag(format: BarcodeFormat): string | undefined {
  switch (format) {
    case BarcodeFormat.EAN_13:
      return "ean_13";
    case BarcodeFormat.EAN_8:
      return "ean_8";
    case BarcodeFormat.UPC_A:
      return "upc_a";
    case BarcodeFormat.UPC_E:
      return "upc_e";
    case BarcodeFormat.CODE_128:
      return "code_128";
    case BarcodeFormat.CODE_39:
      return "code_39";
    default:
      return undefined;
  }
}

// Minimal typing for the native BarcodeDetector API (not in TS DOM libs yet).
type NativeBarcode = { rawValue: string; format?: string };
type NativeDetector = {
  detect: (source: CanvasImageSource) => Promise<NativeBarcode[]>;
};
type BarcodeDetectorCtor = {
  new (options?: { formats?: string[] }): NativeDetector;
  getSupportedFormats?: () => Promise<string[]>;
};

type ZoomCaps = { min: number; max: number; step: number; unit: number };

export default function BarcodeScanner({
  active,
  onDetected,
  onActivate,
}: {
  /** When false the camera stream is stopped but the frame stays visible. */
  active: boolean;
  onDetected: (code: string) => void;
  /** Called when the idle frame is tapped — the parent owns `active`. */
  onActivate: () => void;
}) {
  const { dict } = useI18n();
  const t = dict.nutritionUser;

  const videoRef = useRef<HTMLVideoElement>(null);
  const rectRef = useRef<HTMLDivElement>(null);
  const roiCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fullCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const detectedRef = useRef(false);
  const cropRectRef = useRef<CropRect | null>(null);
  const tickCountRef = useRef(0);
  const resizeCleanupRef = useRef<(() => void) | null>(null);
  const focusModeRef = useRef<FocusMode | null>(null);
  const lastActivityRef = useRef(0);
  // Pending confirmation for codes that couldn't be checksum-verified.
  const pendingCodeRef = useRef<string | null>(null);
  const pendingCountRef = useRef(0);
  const pendingSeenAtRef = useRef(0);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusRingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusSeqRef = useRef(0);

  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [zoomCaps, setZoomCaps] = useState<ZoomCaps | null>(null);
  const [zoom, setZoom] = useState<number | null>(null);
  const [flash, setFlash] = useState(false);
  const [focusPoint, setFocusPoint] = useState<{
    x: number;
    y: number;
    id: number;
  } | null>(null);

  // Validate a raw decode, then either accept it (tearing down the stream and
  // firing the callback exactly once) or hold it pending confirmation.
  // Returns whether the code was accepted.
  const handleFound = useCallback(
    (raw: string, format?: string): boolean => {
      if (detectedRef.current) return false;

      const norm = normalizeBarcode(raw, format);
      if (!norm) return false;

      // Any plausible decode means the optics are working — hold off the
      // autofocus nudge even if this code isn't accepted yet.
      const now = Date.now();
      lastActivityRef.current = now;

      if (!norm.trusted) {
        const stale = now - pendingSeenAtRef.current > CONFIRM_WINDOW_MS;
        if (pendingCodeRef.current !== norm.code || stale) {
          pendingCodeRef.current = norm.code;
          pendingCountRef.current = 1;
        } else {
          pendingCountRef.current += 1;
        }
        pendingSeenAtRef.current = now;
        if (pendingCountRef.current < CONFIRMATIONS_REQUIRED) return false;
      }

      detectedRef.current = true;

      // navigator.vibrate is undefined on iOS Safari and returns false rather
      // than throwing when a browser suppresses it; the guard covers both.
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
        try {
          navigator.vibrate(SUCCESS_VIBRATE_MS);
        } catch {
          // Non-fatal.
        }
      }
      setFlash(true);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      flashTimerRef.current = setTimeout(() => setFlash(false), SUCCESS_FLASH_MS);

      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
      onDetected(norm.code);
      return true;
    },
    [onDetected],
  );

  // Decode loop. Prefers the native BarcodeDetector API (fast + reliable on
  // Android Chrome / WebView); falls back to ZXing canvas decoding elsewhere.
  const startDecodeLoop = useCallback(
    (reader: BrowserMultiFormatReader, video: HTMLVideoElement) => {
      // Try to build a native detector if the platform supports it.
      let nativeDetector: NativeDetector | null = null;
      let nativeFailures = 0;
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

      // willReadFrequently is only honored on the first getContext call for a
      // canvas, so it has to be decided once, up front. ZXing reads pixels
      // back via getImageData and wants it; the native detector consumes the
      // canvas as an image source, where forcing a software-backed canvas
      // would only make the drawImage downscale slower.
      const wantReadback = !nativeDetector;
      const ensure = (ref: React.MutableRefObject<HTMLCanvasElement | null>) => {
        if (!ref.current) ref.current = document.createElement("canvas");
        const canvas = ref.current;
        const ctx = canvas.getContext(
          "2d",
          wantReadback ? { willReadFrequently: true } : undefined,
        );
        return { canvas, ctx };
      };
      const roi = ensure(roiCanvasRef);
      const full = ensure(fullCanvasRef);

      const recomputeCropRect = () => {
        if (!videoRef.current || !rectRef.current) return;
        cropRectRef.current = computeCropRect(videoRef.current, rectRef.current);
      };

      recomputeCropRect();

      let resizeDebounce: ReturnType<typeof setTimeout> | null = null;
      const onResize = () => {
        if (resizeDebounce) clearTimeout(resizeDebounce);
        resizeDebounce = setTimeout(recomputeCropRect, 150);
      };
      // Layout can lag the orientationchange event on mobile — give it a beat.
      const onOrientationChange = () => setTimeout(recomputeCropRect, 250);

      window.addEventListener("resize", onResize);
      window.addEventListener("orientationchange", onOrientationChange);

      // The viewport is `w-full max-w-sm` inside a modal or card, so its width
      // changes without any window resize — the product preview mounting, the
      // saved-foods button appearing, a mobile URL bar collapsing. Observe the
      // elements themselves, not just the window.
      let ro: ResizeObserver | null = null;
      if (typeof ResizeObserver !== "undefined") {
        ro = new ResizeObserver(onResize);
        ro.observe(video);
        if (rectRef.current) ro.observe(rectRef.current);
      }

      resizeCleanupRef.current = () => {
        if (resizeDebounce) clearTimeout(resizeDebounce);
        window.removeEventListener("resize", onResize);
        window.removeEventListener("orientationchange", onOrientationChange);
        ro?.disconnect();
      };

      const scheduleNext = () => {
        if (detectedRef.current || !streamRef.current) return;
        timerRef.current = setTimeout(tick, DECODE_INTERVAL_MS);
      };

      // Draw either the cropped guide-box region or the whole frame into an
      // offscreen canvas, normalized to a consistent decode size.
      const prepareFrame = (useFullFrame: boolean): HTMLCanvasElement | null => {
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        if (vw === 0 || vh === 0) return null;

        const crop = useFullFrame ? null : cropRectRef.current;
        const sx = crop?.sx ?? 0;
        const sy = crop?.sy ?? 0;
        const sw = crop?.sw ?? vw;
        const sh = crop?.sh ?? vh;

        const target = crop ? roi : full;
        const { canvas, ctx } = target;
        if (!ctx) return null;

        const scale = fitScale(sw, sh);
        const w = Math.round(sw * scale);
        const h = Math.round(sh * scale);
        // Assigning width/height reallocates the backing store and resets all
        // 2D state, so only do it when the size actually changed.
        if (canvas.width !== w) canvas.width = w;
        if (canvas.height !== h) canvas.height = h;

        // We are usually downsampling now, and a naive reduction can drop the
        // narrowest bars entirely.
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, w, h);
        return canvas;
      };

      const decodeWithZxing = (
        canvas: HTMLCanvasElement,
      ): { text: string; format?: string } | null => {
        try {
          const result = reader.decodeFromCanvas(canvas);
          return {
            text: result.getText(),
            format: zxingFormatTag(result.getBarcodeFormat()),
          };
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

        // Self-heal: the guide box may not have been mounted when the loop
        // started. Once measured it's cached until the next resize, so this
        // doesn't put a layout read on the hot path.
        if (!cropRectRef.current) recomputeCropRect();

        tickCountRef.current += 1;
        const useFullFrame =
          tickCountRef.current % FULL_FRAME_EVERY_N_TICKS === 0;
        const canvas = prepareFrame(useFullFrame);
        if (!canvas) {
          scheduleNext();
          return;
        }

        try {
          if (nativeDetector) {
            const codes = await nativeDetector.detect(canvas);
            nativeFailures = 0;
            const hit = codes?.[0];
            if (hit?.rawValue && handleFound(hit.rawValue, hit.format)) return;
          } else {
            const hit = decodeWithZxing(canvas);
            if (hit && handleFound(hit.text, hit.format)) return;
          }
        } catch (err) {
          console.error("BarcodeScanner detect error:", err);
          if (nativeDetector && ++nativeFailures >= NATIVE_FAILURE_LIMIT) {
            // This platform's BarcodeDetector constructs but doesn't work.
            // Hand the rest of the session to ZXing.
            console.warn(
              "BarcodeScanner: native BarcodeDetector failing, falling back to ZXing",
            );
            nativeDetector = null;
          }
        }

        // No usable read for a while — nudge focus. Skipped on continuous-AF
        // devices, which are already re-focusing; forcing a single-shot there
        // just makes the preview visibly hunt.
        const now = Date.now();
        if (
          focusModeRef.current !== "continuous" &&
          now - lastActivityRef.current > AF_NUDGE_IDLE_MS
        ) {
          lastActivityRef.current = now;
          const track = streamRef.current?.getVideoTracks()[0];
          if (track) void retriggerFocus(track);
        }

        scheduleNext();
      };

      lastActivityRef.current = Date.now();
      void tick();
    },
    [handleFound],
  );

  const stopAll = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (flashTimerRef.current) {
      clearTimeout(flashTimerRef.current);
      flashTimerRef.current = null;
    }
    if (focusRingTimerRef.current) {
      clearTimeout(focusRingTimerRef.current);
      focusRingTimerRef.current = null;
    }
    if (resizeCleanupRef.current) {
      resizeCleanupRef.current();
      resizeCleanupRef.current = null;
    }
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    detectedRef.current = false;
    cropRectRef.current = null;
    tickCountRef.current = 0;
    focusModeRef.current = null;
    pendingCodeRef.current = null;
    pendingCountRef.current = 0;
    pendingSeenAtRef.current = 0;
    setTorchOn(false);
    setTorchSupported(false);
    setZoomCaps(null);
    setZoom(null);
    setFlash(false);
    setFocusPoint(null);
  }, []);

  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({
        advanced: [{ torch: next }],
      } as ExtraConstraints);
      setTorchOn(next);
    } catch {
      // Device reported torch support but failed — hide the button.
      setTorchSupported(false);
    }
  }, [torchOn]);

  const stepZoom = useCallback(
    async (direction: 1 | -1) => {
      const track = streamRef.current?.getVideoTracks()[0];
      if (!track || !zoomCaps || zoom === null) return;
      // Step linearly in device units; multiplicative stepping breaks on a
      // device that reports min: 0.
      const raw = zoom + direction * zoomCaps.unit * 0.25;
      const snapped =
        zoomCaps.step > 0
          ? zoomCaps.min +
            Math.round((raw - zoomCaps.min) / zoomCaps.step) * zoomCaps.step
          : raw;
      const next = Math.min(zoomCaps.max, Math.max(zoomCaps.min, snapped));
      if (next === zoom) return;
      try {
        await track.applyConstraints({
          advanced: [{ zoom: next }],
        } as ExtraConstraints);
        setZoom(next);
      } catch {
        setZoomCaps(null);
      }
    },
    [zoom, zoomCaps],
  );

  const onTapFocus = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    const host = e.currentTarget.getBoundingClientRect();
    focusSeqRef.current += 1;
    setFocusPoint({
      x: e.clientX - host.left,
      y: e.clientY - host.top,
      id: focusSeqRef.current,
    });
    if (focusRingTimerRef.current) clearTimeout(focusRingTimerRef.current);
    focusRingTimerRef.current = setTimeout(
      () => setFocusPoint(null),
      FOCUS_RING_MS,
    );

    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || !videoRef.current) return;
    const poi = screenToVideoPoint(videoRef.current, e.clientX, e.clientY);
    void retriggerFocus(track, poi ?? undefined);
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

        const stream = await getCameraStream();

        if (cancelled) {
          stream.getTracks().forEach((tr) => tr.stop());
          return;
        }

        streamRef.current = stream;
        const track = stream.getVideoTracks()[0];

        // Ask the camera for its best available autofocus mode — barcodes
        // are usually held close to the lens, and without this many Android
        // cameras stay fixed at infinity focus and never resolve the bars.
        focusModeRef.current = await applyBestEffortFocus(track);

        const caps = track.getCapabilities?.() as ExtraCapabilities | undefined;

        if (caps?.torch) setTorchSupported(true);

        // Leave zoom at whatever the device naturally starts on (the main
        // lens, effectively 1x) rather than forcing one: on some devices,
        // zooming past 1x hands off from the main lens to a telephoto module
        // with a much longer minimum focus distance, which makes close-up
        // barcode scanning — the whole point of this screen — impossible.
        // Zoom is exposed to the user via the manual +/- control instead.
        const zc = caps?.zoom;
        if (
          zc &&
          typeof zc.min === "number" &&
          typeof zc.max === "number" &&
          zc.max > zc.min
        ) {
          const step = typeof zc.step === "number" && zc.step > 0 ? zc.step : 0;
          const unit = zc.min > 0 ? zc.min : 1;
          if (!cancelled) {
            setZoomCaps({ min: zc.min, max: zc.max, step, unit });
            const applied = (track.getSettings() as MediaTrackSettings).zoom;
            setZoom(typeof applied === "number" ? applied : zc.min);
          }
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

        if (cancelled) return;

        // Re-assert focus after the zoom change — switching zoom can move the
        // lens (or hand off to another module entirely) and reset focus mode.
        focusModeRef.current = await applyBestEffortFocus(track);

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

  const zoomLabel =
    zoomCaps && zoom !== null ? `${(zoom / zoomCaps.unit).toFixed(1)}×` : null;

  // Borders are 2px, not the usual hairline: a 1px border gets anti-aliased
  // across a curve, so on a high-DPI phone the rounded bottom corners wash out
  // to nothing while the straight runs still read. border-t-0 because the
  // search input directly above already draws the seam between them — two
  // adjacent 1px borders would otherwise double up into a 4px line.
  return (
    <div className="overflow-hidden rounded-t-none rounded-b-3xl border-2 border-t-0 border-primary bg-black">
      {/* Camera viewport */}
      {/* h-60 (240px) is sized around the scan rectangle below (h-36 = 144px)
          plus a 48px vignette strip above and below, rather than an aspect
          ratio: this box shrinks to w-full on narrow phones, and an aspect
          ratio's height would shrink right along with it, risking clipping the
          fixed-size rectangle. A fixed height doesn't move.
          240 rather than the previous 160: a bigger target is much easier to
          aim one-handed, the 48px strips seat the torch/zoom controls clear of
          the rectangle, and being taller than the camera's 16:9 means
          object-cover crops horizontally instead of vertically — which buys
          standoff distance, letting the user hold the phone far enough away
          for the lens to actually focus. */}
      <div className="relative h-60 w-full max-w-sm mx-auto">

        {/* Idle state — the whole frame is the tap target to start scanning */}
        {!active && !error && (
          <button
            type="button"
            onClick={onActivate}
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-8 text-center"
          >
            <Camera className="h-9 w-9 text-white/40" aria-hidden="true" />
            <p className="text-sm text-white/50 text-pretty">{t.scanBarcode}</p>
          </button>
        )}

        {/* Error state */}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-8 text-center">
            <CameraOff className="h-9 w-9 text-white/70" aria-hidden="true" />
            <p className="text-sm text-white/80 text-pretty">{error}</p>
          </div>
        )}

        {/* Video — always in the DOM so the ref is always valid.
            pointer-events-none matters: opacity < 1 puts this element in its
            own stacking context at the same paint level as the idle button's
            position:absolute, and being later in the DOM it would otherwise
            paint (and hit-test) above that button while invisible, silently
            swallowing the tap-to-scan click. */}
        <video
          ref={videoRef}
          className={`pointer-events-none h-full w-full object-cover transition-opacity duration-300 ${
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

        {/* Scan frame overlay. The blurred vignette is built from four strips
            tiling everything OUTSIDE the scan rectangle, rather than one
            full-bleed blurred layer behind everything — that previous
            approach put the blur (and the rectangle's own backdrop-blur) right
            over the barcode itself, exactly where it needs to be sharp to
            decode. This way the rectangle's own area is never touched by any
            backdrop-filter, however slight, while the border reads as
            softly out of focus around it. */}
        {active && !starting && !error && (
          <div className="pointer-events-none absolute inset-0 flex flex-col">
            {/* Tap-to-focus target. Safe to lay over the whole frame here:
                this overlay is gated on `active`, which is mutually exclusive
                with the idle button's `!active` gate, so it can never shadow
                the tap-to-scan button the way the video element would. The
                z-20 controls below still win, and z-10's rectangle still
                paints on top since this has no background. */}
            <button
              type="button"
              onClick={onTapFocus}
              aria-label={t.scannerTapFocus}
              className="pointer-events-auto absolute inset-0 z-0 cursor-default"
            />

            <div className="flex-1 bg-black/50 backdrop-blur-sm" />
            <div className="flex h-36 shrink-0 items-stretch">
              <div className="flex-1 bg-black/50 backdrop-blur-sm" />

              {/* Scan rectangle — no blur here; this is exactly where the
                  barcode needs to stay sharp to decode. */}
              <div
                ref={rectRef}
                className="relative z-10 h-36 w-80 max-w-[88%] shrink-0 rounded-3xl bg-black/20"
              >
                {/* Corner brackets. Their radius must match the rect's above,
                    or the arc sits proud of the corner it traces. Note this
                    theme overrides --radius-xl to 18px but leaves --radius-2xl
                    at Tailwind's default 16px, so 2xl is SMALLER than xl here —
                    3xl (24px) is the first step that actually rounds more. */}
                <span className="absolute -left-px -top-px h-10 w-10 rounded-tl-3xl border-l-[3px] border-t-[3px] border-primary" />
                <span className="absolute -right-px -top-px h-10 w-10 rounded-tr-3xl border-r-[3px] border-t-[3px] border-primary" />
                <span className="absolute -bottom-px -left-px h-10 w-10 rounded-bl-3xl border-b-[3px] border-l-[3px] border-primary" />
                <span className="absolute -bottom-px -right-px h-10 w-10 rounded-br-3xl border-b-[3px] border-r-[3px] border-primary" />

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

              <div className="flex-1 bg-black/50 backdrop-blur-sm" />
            </div>
            {/* Bottom strip carries its own bottom radius. An element with
                backdrop-filter escapes an ancestor's rounded-corner clip in
                Chromium — it gets clipped to the square padding box instead —
                so without this its corners paint over the frame's curved
                border. 22px = the container's 24px outer radius minus its 2px
                border, i.e. the padding-box radius this strip sits against. */}
            <div className="flex-1 rounded-b-[22px] bg-black/50 backdrop-blur-sm" />

            {/* Aiming hint, centred in the 48px top strip — (240 − 144) / 2. */}
            <p className="pointer-events-none absolute inset-x-0 top-0 z-20 flex h-12 items-center justify-center px-3 text-center text-[11px] leading-tight text-white/70 text-balance">
              {t.scannerHint}
            </p>

            {/* Zoom control — only shown when the camera reports zoom range */}
            {zoomCaps && zoom !== null && (
              <div
                role="group"
                aria-label={t.scannerZoomLabel}
                className="pointer-events-auto absolute bottom-1 left-1 z-20 flex items-center gap-1 rounded-full border border-white/40 bg-black/50 px-1"
              >
                <button
                  type="button"
                  onClick={() => void stepZoom(-1)}
                  aria-label={t.scannerZoomOut}
                  disabled={zoom <= zoomCaps.min}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-white/80 transition-colors duration-200 hover:text-white disabled:opacity-40"
                >
                  <Minus className="h-4 w-4" aria-hidden="true" />
                </button>
                <span className="min-w-9 text-center text-xs font-medium tabular-nums text-white/90">
                  {zoomLabel}
                </span>
                <button
                  type="button"
                  onClick={() => void stepZoom(1)}
                  aria-label={t.scannerZoomIn}
                  disabled={zoom >= zoomCaps.max}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-white/80 transition-colors duration-200 hover:text-white disabled:opacity-40"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            )}

            {/* Torch toggle — only shown when the device supports it */}
            {torchSupported && (
              <button
                type="button"
                onClick={toggleTorch}
                aria-label={torchOn ? t.scannerTorchOff : t.scannerTorchOn}
                aria-pressed={torchOn}
                className={`pointer-events-auto absolute bottom-1 right-1 z-20 flex h-10 w-10 items-center justify-center rounded-full border transition-colors duration-200 ${
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

            {/* Tap-to-focus ring. The key forces a remount so the animation
                replays on every tap — CSS animations don't restart on an
                element that's already mounted. */}
            {focusPoint && (
              <span
                key={focusPoint.id}
                aria-hidden="true"
                style={{ left: focusPoint.x, top: focusPoint.y }}
                className="pointer-events-none absolute z-30 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary motion-safe:animate-[focus-ring_600ms_ease-out_forwards]"
              />
            )}

            {/* Success flash. Cleared by state rather than by the animation:
                under prefers-reduced-motion the motion-safe animation never
                runs, and a fill-mode:forwards element would otherwise sit
                there tinted forever. */}
            {flash && (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 z-40 bg-primary/25 motion-safe:animate-[scan-success_450ms_ease-out_forwards]"
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
