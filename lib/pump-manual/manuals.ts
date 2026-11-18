// Registry of device user manuals stored in the project. The PDF is served
// statically for viewing; the extracted text (data/manuals) is kept as the
// source for future logic such as warnings, limits or formulas taken from the
// manual. Nothing reads the text yet.

export type PumpDevice = "minimed-780g-guardian-3";

export type PumpManual = {
  id: string;
  device: PumpDevice;
  title: string;
  /** BCP 47 language of the manual itself, not of the UI. */
  language: "es" | "en";
  /** Public URL of the PDF (served from /public). */
  pdfPath: string;
  /** Project-relative path of the extracted text, for server-side use. */
  textPath: string;
  source: string;
};

export const PUMP_MANUALS: readonly PumpManual[] = [
  {
    id: "minimed-780g-guardian-3-es",
    device: "minimed-780g-guardian-3",
    title: "MiniMed 780G · Guardian 3 — Guía del usuario del sistema",
    language: "es",
    pdfPath: "/manuals/minimed-780g-guardian-3-es.pdf",
    textPath: "data/manuals/minimed-780g-guardian-3-es.txt",
    source: "Medtronic",
  },
];

export function getManualFor(
  device: PumpDevice,
  language?: PumpManual["language"],
): PumpManual | null {
  const forDevice = PUMP_MANUALS.filter((m) => m.device === device);
  return forDevice.find((m) => m.language === language) ?? forDevice[0] ?? null;
}
