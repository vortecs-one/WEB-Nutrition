// lib/glucose/carelink-csv.ts
//
// Parser for Medtronic CareLink Personal's CSV export ("Exportación de
// datos (CSV)" — see the "CareLink Personal: Guia rapida de descarga"
// manual, p.4 and p.12-13). CareLink has no API: this file export is the
// only official way data gets out of the pump/sensor account, so importing
// it is how the "carelink" glucose source gets its readings (see
// actions.ts's importCareLinkReadings, which stores what this parser
// returns, and fetchFromCareLinkImport, which reads it back).
//
// Runs in the browser (app/dashboard/pump/CareLinkImport.tsx), not on the
// server: CareLink timestamps are local time with no timezone marker, and
// the browser's timezone is the household's while the server's is UTC. A full export can
// also be several MB — over the server-action body limit — while the
// readings pulled out of it are a fraction of that. The server re-checks
// every reading with isPlausibleReading before storing it.
//
// STATUS: the column names in CARELINK_COLUMNS come from public descriptions
// of the export and have NOT been confirmed against a real file from this
// account. Columns are found by header name rather than position, and the
// import form previews what was parsed before anything is saved, so a
// mismatch shows up as an error or an obviously wrong preview — never as
// silently wrong data.
// TODO(carelink-csv-format): once a real export is available, add its exact
// header text to CARELINK_COLUMNS and build a test fixture from it.

import type { GlucoseUnit } from "./types";
import { toMgdl } from "@/lib/health-formulas";

// --- Recognized columns -------------------------------------------------------
// Header cells are compared after normalizeHeader(): lowercase, accents
// stripped, "(mg/dL)"-style unit suffix removed, spaces collapsed.
export const CARELINK_COLUMNS = {
  date: ["date", "fecha"],
  time: ["time", "hora"],
  // A single date + time column, used when there's no separate date column.
  timestamp: ["timestamp", "date time", "datetime", "fecha y hora", "fecha/hora"],
  // Sensor glucose: a header mentioning every `allOf` word and no `noneOf`
  // word. Matches "Sensor Glucose (mg/dL)" and "Glucosa del sensor (mg/dL)",
  // but not the meter value used to calibrate the sensor ("Sensor
  // Calibration BG (mg/dL)").
  glucose: { allOf: ["sensor", "gluc"], noneOf: ["calib"] },
};

/** CareLink sensors report 40–400 mg/dL; anything outside isn't a sensor value. */
export const SGV_MIN = 40;
export const SGV_MAX = 400;

/**
 * Readings sent per importCareLinkReadings call: ~165 KB of JSON and 15k SQL
 * parameters — well under the 1 MB server-action body limit and Postgres'
 * 65,535 bind-parameter limit, which a whole 90-day export (~26k readings)
 * would exceed.
 */
export const CARELINK_IMPORT_CHUNK = 5000;

const EARLIEST_READING = Date.UTC(2000, 0, 1);
const DAY_MS = 24 * 3600_000;

export type CareLinkCsvErrorCode = "empty" | "unrecognized-format" | "no-readings";

export class CareLinkCsvError extends Error {
  code: CareLinkCsvErrorCode;
  constructor(code: CareLinkCsvErrorCode, message?: string) {
    super(message ?? code);
    this.name = "CareLinkCsvError";
    this.code = code;
  }
}

export type CareLinkCsvReading = {
  /** Epoch ms, parsed from the export's local-time date/time columns. */
  date: number;
  /** Sensor glucose value, always normalized to mg/dL. */
  sgv: number;
};

/** Order of the date parts: year first, or day/month first with the year last. */
export type DateOrder = "ymd" | "dmy" | "mdy";

export type CareLinkCsvParseResult = {
  /** Sorted by date, at most one per timestamp. */
  readings: CareLinkCsvReading[];
  /** Unit the file's glucose values were in (readings are converted to mg/dL). */
  unit: GlucoseUnit;
  /** Header text of the columns read, for the import preview. */
  columns: string[];
  dateOrder: DateOrder;
  /**
   * True when no date told day and month apart (both ≤ 12 everywhere), so
   * the order came from the UI locale instead of the data.
   */
  dateOrderGuessed: boolean;
  /** Rows with a glucose value that couldn't be used (bad date, number or range). */
  skipped: number;
};

/**
 * Whether a reading is something a CareLink sensor could have produced:
 * whole numbers, sgv within the sensor's range, a date from 2000 up to a
 * day from now. Takes `unknown` because the server runs it on whatever the
 * client sent.
 */
export function isPlausibleReading(r: unknown, now = Date.now()): r is CareLinkCsvReading {
  if (typeof r !== "object" || r === null) return false;
  const { date, sgv } = r as { date?: unknown; sgv?: unknown };
  return (
    typeof date === "number" &&
    Number.isInteger(date) &&
    date >= EARLIEST_READING &&
    date <= now + DAY_MS &&
    typeof sgv === "number" &&
    Number.isInteger(sgv) &&
    sgv >= SGV_MIN &&
    sgv <= SGV_MAX
  );
}

// --- Generic CSV helpers -----------------------------------------------------
// Medtronic's export is semicolon-delimited in locales with a decimal comma
// (per the CareLink format notes in the CRAN `aidR` package's vignette) and
// comma-delimited elsewhere, with quoted fields where a value itself
// contains the delimiter.

function splitCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      cells.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells.map((c) => c.trim());
}

// The most frequent of the candidate delimiters in the first lines. A
// decimal comma can't outvote the semicolons of a semicolon file: every row
// carries one per column, empty or not.
function detectDelimiter(lines: string[]): string {
  const sample = lines.slice(0, 100).join("\n");
  let best = ";";
  let bestCount = 0;
  for (const delimiter of [";", ",", "\t"]) {
    const count = sample.split(delimiter).length - 1;
    if (count > bestCount) {
      best = delimiter;
      bestCount = count;
    }
  }
  return best;
}

// --- Header detection ---------------------------------------------------------

function normalizeHeader(cell: string): string {
  return cell
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isGlucoseHeader(normalized: string): boolean {
  const { allOf, noneOf } = CARELINK_COLUMNS.glucose;
  return (
    allOf.every((word) => normalized.includes(word)) &&
    !noneOf.some((word) => normalized.includes(word))
  );
}

// The unit named in the glucose header's suffix, if any.
function headerUnit(cell: string): GlucoseUnit | null {
  const lower = cell.toLowerCase();
  if (lower.includes("mmol")) return "mmol";
  if (lower.includes("mg/dl")) return "mgdl";
  return null;
}

type ColumnMap = {
  glucose: number;
  /** The date column — or the combined timestamp column when `time` is null. */
  date: number;
  time: number | null;
  unit: GlucoseUnit | null;
  /** Original header text of the columns above, for the preview. */
  names: string[];
};

// A row is a header row when it names a sensor glucose column plus a date
// (or timestamp) column. CareLink repeats the header row at the top of each
// section (pump, sensor), so every header row found resets the column map.
function findColumns(cells: string[]): ColumnMap | null {
  const normalized = cells.map(normalizeHeader);
  const glucose = normalized.findIndex(isGlucoseHeader);
  if (glucose === -1) return null;

  const date = normalized.findIndex((h) => CARELINK_COLUMNS.date.includes(h));
  if (date !== -1) {
    const time = normalized.findIndex((h) => CARELINK_COLUMNS.time.includes(h));
    return {
      glucose,
      date,
      time: time === -1 ? null : time,
      unit: headerUnit(cells[glucose]),
      names: time === -1 ? [cells[date], cells[glucose]] : [cells[date], cells[time], cells[glucose]],
    };
  }

  const timestamp = normalized.findIndex((h) => CARELINK_COLUMNS.timestamp.includes(h));
  if (timestamp === -1) return null;
  return {
    glucose,
    date: timestamp,
    time: null,
    unit: headerUnit(cells[glucose]),
    names: [cells[timestamp], cells[glucose]],
  };
}

// --- Value parsing -------------------------------------------------------------

// The three numbers of a date as written ("2026/11/03", "03/11/2026",
// "11-03-26", "03.11.2026"), in file order. Which one is the day or the month
// is decided later, from the whole file (see detectDateOrder).
type RawDate = { a: number; b: number; c: number; yearFirst: boolean };

function splitDate(raw: string): RawDate | null {
  const m = raw.trim().match(/^(\d{1,4})[/.-](\d{1,2})[/.-](\d{1,4})$/);
  if (!m) return null;
  return { a: Number(m[1]), b: Number(m[2]), c: Number(m[3]), yearFirst: m[1].length === 4 };
}

type RawTime = { h: number; m: number; s: number };

// "14:35", "14:35:00", "2:35:00 PM", "2:35 p. m." (Spanish 12-hour clock).
function parseTime(raw: string): RawTime | null {
  const m = raw
    .trim()
    .toLowerCase()
    .match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:[.,]\d+)?\s*(?:([ap])\.?\s*m\.?)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  const s = m[3] ? Number(m[3]) : 0;
  if (m[4]) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (m[4] === "p" ? 12 : 0);
  }
  if (h > 23 || min > 59 || s > 59) return null;
  return { h, m: min, s };
}

// "2026/11/03 14:35:00" or "2026-11-03T14:35:00" → [date, time].
function splitTimestamp(raw: string): [string, string] | null {
  const m = raw.trim().match(/^(\S+?)(?:T|\s+)(.+)$/);
  return m ? [m[1], m[2]] : null;
}

function parseNumber(raw: string): number {
  const s = raw.trim().replace(",", ".");
  return s === "" ? NaN : Number(s);
}

// Day/month order for year-last dates, read from the data: a first part
// above 12 can only be a day, a second part above 12 likewise. When nothing
// tells them apart (or the file contradicts itself), fall back to the UI
// locale and report it as a guess so the preview can say so.
function detectDateOrder(
  dates: RawDate[],
  dayFirst: boolean,
): { order: DateOrder; guessed: boolean } {
  let firstOver12 = false;
  let secondOver12 = false;
  let yearLast = false;
  for (const d of dates) {
    if (d.yearFirst) continue;
    yearLast = true;
    if (d.a > 12) firstOver12 = true;
    if (d.b > 12) secondOver12 = true;
  }
  if (!yearLast) return { order: "ymd", guessed: false };
  if (firstOver12 && !secondOver12) return { order: "dmy", guessed: false };
  if (secondOver12 && !firstOver12) return { order: "mdy", guessed: false };
  return { order: dayFirst ? "dmy" : "mdy", guessed: true };
}

// Local time — the export has no timezone marker, so it's read in the
// timezone of the browser doing the import (see the file header).
function toEpoch(d: RawDate, order: DateOrder, t: RawTime): number | null {
  let year: number;
  let month: number;
  let day: number;
  if (d.yearFirst) [year, month, day] = [d.a, d.b, d.c];
  else if (order === "mdy") [month, day, year] = [d.a, d.b, d.c];
  else [day, month, year] = [d.a, d.b, d.c];
  if (year < 100) year += 2000;

  const date = new Date(year, month - 1, day, t.h, t.m, t.s);
  // new Date() rolls invalid dates over (31/02 → 3 March); reject those.
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date.getTime();
}

// mg/dL and mmol/L sensor ranges (40–400 vs 2.2–22.2) don't overlap, so the
// median tells them apart when the header doesn't name the unit.
function inferUnit(values: number[]): GlucoseUnit {
  if (values.length === 0) return "mgdl";
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] < 35 ? "mmol" : "mgdl";
}

// --- Main entry point ---------------------------------------------------------

/**
 * Parses a CareLink Personal CSV export into normalized glucose readings
 * (mg/dL, epoch ms). Throws CareLinkCsvError when no readings can be
 * returned at all; individual unusable rows are counted in `skipped`
 * rather than failing the whole import.
 *
 * `dayFirst` decides dates like 03/04/2026 when the file itself doesn't
 * (pass true for locales that write the day first).
 */
export function parseCareLinkCsv(
  csvText: string,
  { dayFirst }: { dayFirst: boolean },
): CareLinkCsvParseResult {
  const lines = csvText
    .replace(/^﻿/, "") // strip BOM if present
    .split(/\r\n|\r|\n/)
    .filter((line) => line.trim() !== "");
  if (lines.length === 0) throw new CareLinkCsvError("empty", "The file is empty.");

  const delimiter = detectDelimiter(lines);

  let map: ColumnMap | null = null;
  let columns: string[] = [];
  let fileUnit: GlucoseUnit | null = null;
  const rows: { date: RawDate; time: RawTime; value: number }[] = [];
  let skipped = 0;

  for (const line of lines) {
    const cells = splitCsvLine(line, delimiter);
    const header = findColumns(cells);
    if (header) {
      map = header;
      if (columns.length === 0) columns = header.names;
      fileUnit ??= header.unit;
      continue;
    }
    // Patient/device rows before the first header, and rows without a
    // sensor value (pump events, section separators) carry no reading.
    if (!map) continue;
    const rawValue = cells[map.glucose] ?? "";
    if (!rawValue) continue;

    const dateCell = cells[map.date] ?? "";
    const [rawDate, rawTime] =
      map.time === null ? (splitTimestamp(dateCell) ?? ["", ""]) : [dateCell, cells[map.time] ?? ""];
    const date = splitDate(rawDate);
    const time = parseTime(rawTime);
    const value = parseNumber(rawValue);
    if (!date || !time || !Number.isFinite(value) || value <= 0) {
      skipped++;
      continue;
    }
    rows.push({ date, time, value });
  }

  if (columns.length === 0) {
    throw new CareLinkCsvError(
      "unrecognized-format",
      "Couldn't find a sensor glucose column in this file. Make sure it's " +
        "the CSV export from CareLink Personal's Informes page.",
    );
  }

  const unit = fileUnit ?? inferUnit(rows.map((r) => r.value));
  const { order, guessed } = detectDateOrder(
    rows.map((r) => r.date),
    dayFirst,
  );

  // Keyed by timestamp: a reading repeated across sections is stored once.
  const byDate = new Map<number, number>();
  const now = Date.now();
  for (const r of rows) {
    const reading = { date: toEpoch(r.date, order, r.time), sgv: Math.round(toMgdl(r.value, unit)) };
    if (!isPlausibleReading(reading, now)) {
      skipped++;
      continue;
    }
    byDate.set(reading.date, reading.sgv);
  }

  if (byDate.size === 0) {
    throw new CareLinkCsvError("no-readings", "No readings could be read from this file.");
  }

  const readings = Array.from(byDate, ([date, sgv]) => ({ date, sgv })).sort(
    (a, b) => a.date - b.date,
  );
  return { readings, unit, columns, dateOrder: order, dateOrderGuessed: guessed, skipped };
}
