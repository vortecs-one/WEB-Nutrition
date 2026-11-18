// URLs of product photos and their OCR text on Open Food Facts. Plain module
// (no directives) so both server actions can share it.

const IMAGES_HOST = "https://images.openfoodfacts.org/images/products";

// Open Food Facts splits barcodes longer than 8 digits into folders after
// left-padding them to 13 digits: 3017624010701 -> 301/762/401/0701.
export function offBarcodePath(barcode: string): string {
  if (barcode.length <= 8) return barcode;
  const padded = barcode.padStart(13, "0");
  const match = /^(\d{3})(\d{3})(\d{3})(\d+)$/.exec(padded);
  return match ? match.slice(1).join("/") : padded;
}

export const offImageUrl = (barcode: string, imgid: number) =>
  `${IMAGES_HOST}/${offBarcodePath(barcode)}/${imgid}.jpg`;

export const offOcrUrl = (barcode: string, imgid: number) =>
  `${IMAGES_HOST}/${offBarcodePath(barcode)}/${imgid}.json`;

export type UploadedPhoto = {
  kind: "front" | "ingredients" | "nutrition" | "packaging";
  imgid: number;
};

export const BARCODE_RE = /^\d{8,14}$/;

// GTIN-8/12/13/14 check digit (weights 3,1 from the right, before the check digit).
// Keeps misread scans from being registered as new products.
export function isValidGtin(code: string): boolean {
  if (!/^(\d{8}|\d{12,14})$/.test(code)) return false;
  const digits = code.split("").map(Number);
  const check = digits.pop()!;
  const sum = digits
    .reverse()
    .reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

export function cleanUploadedPhotos(photos: unknown): UploadedPhoto[] {
  if (!Array.isArray(photos)) return [];
  const kinds = new Set(["front", "ingredients", "nutrition", "packaging"]);
  return photos
    .filter(
      (p): p is UploadedPhoto =>
        !!p &&
        typeof p === "object" &&
        kinds.has((p as UploadedPhoto).kind) &&
        Number.isInteger((p as UploadedPhoto).imgid) &&
        (p as UploadedPhoto).imgid > 0 &&
        (p as UploadedPhoto).imgid < 100000,
    )
    .slice(0, 8);
}
