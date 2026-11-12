"use client";

// Canvas-based PDF reader for touch devices, where browsers don't render PDFs
// inside an <iframe> (Android Chrome shows nothing, iOS Safari only page 1).
// Pages are drawn lazily as they approach the viewport so the large manual
// stays light on memory.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Minus, Plus } from "lucide-react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from "pdfjs-dist";

type PdfJs = typeof import("pdfjs-dist");

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.5;
const MAX_PIXEL_RATIO = 2;

type Labels = {
  loading: string;
  error: string;
  zoomIn: string;
  zoomOut: string;
  page: (current: number, total: number) => string;
};

function PageCanvas({
  pdf,
  pageNumber,
  width,
  aspect,
  root,
}: {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  width: number;
  aspect: number;
  root: React.RefObject<HTMLDivElement | null>;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { root: root.current, rootMargin: "100% 0px" },
    );
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [root]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!visible || !canvas || width <= 0) return;

    let cancelled = false;
    let task: RenderTask | null = null;

    (async () => {
      const page = await pdf.getPage(pageNumber);
      if (cancelled) return;
      const base = page.getViewport({ scale: 1 });
      const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
      const viewport = page.getViewport({ scale: (width / base.width) * ratio });
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      task = page.render({ canvas, viewport });
      try {
        await task.promise;
      } catch {
        // Cancelled by a zoom change or scroll; the next render replaces it.
      }
    })();

    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [visible, pdf, pageNumber, width]);

  // Free the bitmap of pages far from view.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!visible && canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }, [visible]);

  return (
    <div
      ref={wrapperRef}
      data-page={pageNumber}
      className="mb-2 rounded-sm bg-white shadow-sm"
      style={{ width, height: Math.round(width * aspect) }}
    >
      <canvas
        ref={canvasRef}
        className="block h-full w-full"
        role="img"
        aria-label={`${pageNumber}`}
      />
    </div>
  );
}

export default function PumpManualPages({
  url,
  labels,
}: {
  url: string;
  labels: Labels;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [aspect, setAspect] = useState(1.414);
  const [containerWidth, setContainerWidth] = useState(0);
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [currentPage, setCurrentPage] = useState(1);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let loadingTask: PDFDocumentLoadingTask | null = null;

    (async () => {
      try {
        const pdfjs: PdfJs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();
        loadingTask = pdfjs.getDocument({ url });
        const doc = await loadingTask.promise;
        if (cancelled) return;
        const first = await doc.getPage(1);
        const viewport = first.getViewport({ scale: 1 });
        setAspect(viewport.height / viewport.width);
        setPdf(doc);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      void loadingTask?.destroy();
    };
  }, [url]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setContainerWidth(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const pageWidth = Math.max(0, Math.round((containerWidth - 16) * zoom));
  const pageHeight = Math.round(pageWidth * aspect) + 8;

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || pageHeight <= 0) return;
    const middle = el.scrollTop + el.clientHeight / 2;
    setCurrentPage(Math.floor((middle - 8) / pageHeight) + 1);
  }, [pageHeight]);

  const pages = useMemo(
    () => (pdf ? Array.from({ length: pdf.numPages }, (_, i) => i + 1) : []),
    [pdf],
  );
  const total = pdf?.numPages ?? 0;
  const shownPage = Math.min(Math.max(currentPage, 1), Math.max(total, 1));

  const zoomButton =
    "inline-flex h-9 w-9 items-center justify-center rounded-full bg-sidebar-accent text-sidebar-foreground transition hover:bg-sidebar-accent/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-highlight disabled:opacity-40";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold tabular-nums text-sidebar-foreground/70" aria-live="polite">
          {total > 0 ? labels.page(shownPage, total) : ""}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - ZOOM_STEP))}
            disabled={zoom <= MIN_ZOOM}
            className={zoomButton}
            aria-label={labels.zoomOut}
          >
            <Minus className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + ZOOM_STEP))}
            disabled={zoom >= MAX_ZOOM}
            className={zoomButton}
            aria-label={labels.zoomIn}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="relative h-[70vh] overflow-auto overscroll-contain rounded-2xl border border-sidebar-foreground/10 bg-sidebar-accent p-2"
      >
        {!pdf && !failed ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-sidebar-foreground/70" role="status">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            {labels.loading}
          </div>
        ) : null}
        {failed ? (
          <p className="flex h-full items-center justify-center px-4 text-center text-sm text-red-400" role="alert">
            {labels.error}
          </p>
        ) : null}
        {pdf
          ? pages.map((n) => (
              <PageCanvas
                key={n}
                pdf={pdf}
                pageNumber={n}
                width={pageWidth}
                aspect={aspect}
                root={scrollRef}
              />
            ))
          : null}
      </div>
    </div>
  );
}
