// ZXing is ~550KB of JS, so it lives in its own module and is loaded with a
// dynamic import() only once the user actually opens the camera scanner.

import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType, NotFoundException } from "@zxing/library";

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

export type CanvasDecoder = (
  canvas: HTMLCanvasElement,
) => { text: string; format?: string } | null;

export function createCanvasDecoder(): CanvasDecoder {
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, PRODUCT_FORMATS);
  hints.set(DecodeHintType.TRY_HARDER, true);
  const reader = new BrowserMultiFormatReader(hints);

  return (canvas) => {
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
}
