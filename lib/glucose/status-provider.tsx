"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { GlucoseStatus } from "./types";

// Shares the status of the latest glucose reading with the rest of the page
// (the companion card takes its color from it). The glucose card owns the data
// and its polling; it only publishes the status here, so nothing else has to
// fetch glucose again.
const StatusContext = createContext<GlucoseStatus | null>(null);
// Defaults to a no-op so the glucose card also works outside a provider.
const PublishContext = createContext<(status: GlucoseStatus | null) => void>(() => {});

export function GlucoseStatusProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<GlucoseStatus | null>(null);
  return (
    <PublishContext.Provider value={setStatus}>
      <StatusContext.Provider value={status}>{children}</StatusContext.Provider>
    </PublishContext.Provider>
  );
}

/** Status of the latest reading; null while unknown (no glucose card, no reading yet). */
export function useGlucoseStatus(): GlucoseStatus | null {
  return useContext(StatusContext);
}

/**
 * For the glucose card: publishes the status of its latest reading (null when
 * there is none) and clears it when the card goes away, so leaving the page
 * can't leave a stale color behind.
 */
export function usePublishGlucoseStatus(status: GlucoseStatus | null) {
  const publish = useContext(PublishContext);
  useEffect(() => {
    publish(status);
  }, [publish, status]);
  useEffect(() => () => publish(null), [publish]);
}
