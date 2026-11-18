"use client";

import type { Worker } from "tesseract.js";
import type { FoodPhotoResult } from "./photo-types";
import { matchMenuText } from "./menu-text";

// Tesseract (Apache-2.0) runs in a Web Worker on the device; only the language data is downloaded.
let workerPromise: Promise<Worker> | null = null;

function getWorker() {
  workerPromise ??= import("tesseract.js").then(({ createWorker }) => createWorker(["spa", "eng"]));
  workerPromise.catch(() => {
    workerPromise = null;
  });
  return workerPromise;
}

export async function analyzeMenuLocally(dataUrl: string, locale: "es" | "en"): Promise<FoodPhotoResult> {
  if (!dataUrl.startsWith("data:image/")) return { ok: false, reason: "invalid-image" };
  try {
    const worker = await getWorker();
    const { data } = await worker.recognize(dataUrl);
    return matchMenuText(data.text ?? "", locale);
  } catch {
    return { ok: false, reason: "error" };
  }
}
