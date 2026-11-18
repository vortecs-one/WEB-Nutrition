// Browser-side preparation of a product photo before sending it to Open Food
// Facts. Re-encoding to JPEG keeps phone photos (often 5–15 MB, sometimes
// HEIC) well under the 10 MB API limit and in a format the API accepts.

// Open Food Facts rejects images smaller than this.
const MIN_WIDTH = 640;
const MIN_HEIGHT = 160;
// Long-edge cap: plenty for OCR, a fraction of the original's bytes.
const MAX_EDGE = 2400;

export type PreparedPhoto =
  | { ok: true; file: File }
  | { ok: false; reason: "too-small" | "unreadable" };

export async function preparePhoto(input: File): Promise<PreparedPhoto> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(input, { imageOrientation: "from-image" });
  } catch {
    return { ok: false, reason: "unreadable" };
  }

  try {
    const { width, height } = bitmap;
    // Accept either orientation: a wide strip of ingredients is fine portrait.
    const long = Math.max(width, height);
    const short = Math.min(width, height);
    if (long < MIN_WIDTH || short < MIN_HEIGHT) {
      return { ok: false, reason: "too-small" };
    }

    const scale = Math.min(1, MAX_EDGE / long);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return { ok: false, reason: "unreadable" };
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.88),
    );
    if (!blob) return { ok: false, reason: "unreadable" };
    return { ok: true, file: new File([blob], "photo.jpg", { type: "image/jpeg" }) };
  } finally {
    bitmap.close();
  }
}
