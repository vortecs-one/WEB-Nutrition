// Framework-agnostic barcode validation. Plain module so both the camera
// scanner and any server-side lookup can use it.
//
// The scanner's job is not just "read something" — it's "read something that
// is actually a product barcode". Decoders happily return fragments: ZXing's
// ITF reader in particular will lock onto a *portion* of an EAN-13's bars and
// hand back a short even-length number that looks plausible but is garbage.
// Every code therefore has to clear three gates before we act on it: digits
// only, a real GTIN length, and a check digit that verifies.

/** Lengths of the GTIN family we accept: EAN-8, UPC-A, EAN-13, ITF-14/GTIN-14. */
const GTIN_LENGTHS = new Set([8, 12, 13, 14]);

/**
 * GS1 modulo-10 check digit verification.
 *
 * Walks right-to-left from the check digit with alternating weights 3,1,3,1…
 * Anchoring on the check digit rather than the start of the string is what
 * makes this length-agnostic: the same loop is correct for GTIN-8/12/13/14
 * with no parity special-case (the more common left-to-right formulation
 * needs one).
 */
export function gs1CheckDigitValid(code: string): boolean {
  const n = code.length;
  if (n < 2) return false;
  let sum = 0;
  for (let i = n - 2; i >= 0; i--) {
    // Digit immediately left of the check digit gets weight 3, then alternate.
    sum += ((n - 2 - i) % 2 === 0 ? 3 : 1) * (code.charCodeAt(i) - 48);
  }
  return (10 - (sum % 10)) % 10 === code.charCodeAt(n - 1) - 48;
}

/** GS1 check digit for a body that does not yet include one. */
function gs1CheckDigit(body: string): string {
  const n = body.length + 1;
  let sum = 0;
  for (let i = n - 2; i >= 0; i--) {
    sum += ((n - 2 - i) % 2 === 0 ? 3 : 1) * (body.charCodeAt(i) - 48);
  }
  return String((10 - (sum % 10)) % 10);
}

/**
 * Expand a zero-suppressed 8-digit UPC-E into its full 12-digit UPC-A.
 *
 * UPC-E has no check digit of its own — the trailing digit IS the expanded
 * UPC-A's check digit, so validating the 8 characters directly would reject
 * perfectly good codes. ZXing does this same expansion internally to verify
 * the checksum but still returns the compressed 8-digit form to callers.
 *
 * Expanding here also normalizes decoder disagreement (some stacks report
 * UPC-E as 6 digits, some 8, some pre-expanded to 12) and fixes lookups:
 * product databases are keyed on the full GTIN, so a raw 8-digit UPC-E
 * misses even when the product exists.
 */
export function expandUpcE(upce: string): string | null {
  if (!/^\d{8}$/.test(upce)) return null;
  const system = upce[0];
  // Only number systems 0 and 1 have a UPC-E representation.
  if (system !== "0" && system !== "1") return null;

  const p = upce.slice(1, 7);
  const mode = p[5];
  let body: string;
  if (mode === "0" || mode === "1" || mode === "2") {
    body = `${system}${p[0]}${p[1]}${mode}0000${p[2]}${p[3]}${p[4]}`;
  } else if (mode === "3") {
    body = `${system}${p[0]}${p[1]}${p[2]}00000${p[3]}${p[4]}`;
  } else if (mode === "4") {
    body = `${system}${p[0]}${p[1]}${p[2]}${p[3]}00000${p[4]}`;
  } else {
    body = `${system}${p[0]}${p[1]}${p[2]}${p[3]}${p[4]}0000${mode}`;
  }

  const upca = body + gs1CheckDigit(body);
  // The UPC-E trailing digit must agree with the expanded check digit.
  return upca[11] === upce[7] ? upca : null;
}

export type NormalizedBarcode = {
  /** Canonical GTIN to look up — UPC-E is expanded to its UPC-A form. */
  code: string;
  /**
   * True for the retail symbologies (EAN/UPC), whose fixed length and check
   * digit together make a misread very unlikely — those can be acted on from
   * a single frame.
   *
   * False for the variable-length symbologies (Code-128/Code-39). Those have
   * cleared the same length and checksum gates, but because their length is
   * not fixed a partial scan can still land on a valid-looking GTIN, so the
   * caller should see them repeated across frames before acting.
   */
  trusted: boolean;
};

/** Symbologies whose length is fixed by the spec, so a partial read can't pass. */
const FIXED_LENGTH_FORMATS = new Set([
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
]);

/**
 * Validate and canonicalize a raw decoder result.
 *
 * Returns null for anything that isn't a plausible product barcode. Note this
 * deliberately does NOT strip non-digits: doing so manufactures GTIN-shaped
 * numbers out of alphanumeric Code-128 payloads (a batch code like
 * "LOT-A2024B7" becomes "20247") and hides exactly the misreads the check
 * digit is here to catch.
 *
 * @param format Lowercase format tag from the decoder ("ean_13", "upc_e", …)
 *   when available. Used only to disambiguate 8-digit codes, which can be a
 *   valid EAN-8 and a valid UPC-E at the same time.
 */
export function normalizeBarcode(
  raw: string,
  format?: string,
): NormalizedBarcode | null {
  const s = raw.trim();
  if (!/^\d+$/.test(s)) return null;
  if (!GTIN_LENGTHS.has(s.length)) return null;

  if (s.length === 8) {
    if (format === "upc_e") {
      const upca = expandUpcE(s);
      return upca ? { code: upca, trusted: true } : null;
    }
    if (format === "ean_8") {
      return gs1CheckDigitValid(s) ? { code: s, trusted: true } : null;
    }
    // Format unknown: try EAN-8 first (far more common on food packaging),
    // then UPC-E.
    if (gs1CheckDigitValid(s)) return { code: s, trusted: true };
    const upca = expandUpcE(s);
    return upca ? { code: upca, trusted: true } : null;
  }

  // 12, 13 and 14 digit codes all carry a GS1 check digit.
  if (!gs1CheckDigitValid(s)) return null;
  // A variable-length symbology reporting a GTIN-shaped payload is accepted,
  // but only once a second frame agrees with it.
  return {
    code: s,
    trusted: format === undefined || FIXED_LENGTH_FORMATS.has(format),
  };
}
