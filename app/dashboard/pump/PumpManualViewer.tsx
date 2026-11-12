"use client";

// Read-only view of the pump's user manual, using the browser's built-in PDF
// viewer (search, zoom, pages, print) so no PDF library is needed. Mounted
// only when the Manual tab is open, so the large file loads on demand.

import { useEffect, useState } from "react";
import { BookOpen, Download, ExternalLink } from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";
import type { PumpManual } from "@/lib/pump-manual/manuals";
import PumpManualPages from "./PumpManualPages";

// Touch devices and browsers without an inline PDF viewer can't show the PDF
// in an <iframe>, so they get the canvas reader instead.
const CANVAS_READER_QUERY = "(pointer: coarse), (max-width: 767px)";

export default function PumpManualViewer({ manual }: { manual: PumpManual }) {
  const { dict } = useI18n();
  const t = dict.glucose.pump;
  const [useCanvasReader, setUseCanvasReader] = useState<boolean | null>(null);

  useEffect(() => {
    const query = window.matchMedia(CANVAS_READER_QUERY);
    const update = () =>
      setUseCanvasReader(query.matches || navigator.pdfViewerEnabled === false);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const action =
    "inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-highlight";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <BookOpen className="h-4 w-4 shrink-0 text-sidebar-foreground/60" aria-hidden="true" />
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <h3 className="min-w-0 truncate text-sm font-semibold">{t.manualTitle}</h3>
          <span
            className="shrink-0 rounded-full bg-sidebar-accent px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-sidebar-foreground/70"
            title={t.manualLanguage}
          >
            {manual.language}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <a
            href={manual.pdfPath}
            target="_blank"
            rel="noopener noreferrer"
            className={`${action} bg-amber-500 text-amber-950 hover:bg-amber-400`}
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            {t.manualOpen}
          </a>
          <a
            href={manual.pdfPath}
            download
            className={`${action} bg-sidebar-accent text-sidebar-foreground hover:bg-sidebar-accent/70`}
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            {t.manualDownload}
          </a>
        </div>
      </div>

      {useCanvasReader === null ? (
        <div className="h-[70vh] w-full rounded-2xl border border-sidebar-foreground/10 bg-sidebar-accent" />
      ) : useCanvasReader ? (
        <PumpManualPages
          url={manual.pdfPath}
          labels={{
            loading: t.manualLoading,
            error: t.manualError,
            zoomIn: t.manualZoomIn,
            zoomOut: t.manualZoomOut,
            page: (current, total) =>
              t.manualPage.replace("{current}", String(current)).replace("{total}", String(total)),
          }}
        />
      ) : (
        <iframe
          src={`${manual.pdfPath}#view=FitH`}
          title={manual.title}
          className="h-[70vh] w-full rounded-2xl border border-sidebar-foreground/10 bg-sidebar-accent"
        />
      )}

      <p className="text-xs leading-relaxed text-sidebar-foreground/60 text-pretty">
        {t.manualMobileHint} {t.manualDisclaimer}
      </p>
    </div>
  );
}
