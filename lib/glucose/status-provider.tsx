"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { GlucoseStatus, GlucoseUnit, TrendDirection } from "./types";

/** The latest glucose reading, as the glucose card shows it. */
export type GlucoseSnapshot = {
  status: GlucoseStatus;
  /** mg/dL, as read from the sensor. */
  sgv: number;
  /** The unit the user displays it in. */
  unit: GlucoseUnit;
  direction: TrendDirection;
  /** When the reading was taken (epoch ms). */
  date: number;
};

// Shares the latest glucose reading with the rest of the page (the companion
// takes its colors and its corner readout from it). The glucose card owns the
// data and its polling; it only publishes the reading here, so nothing else has
// to fetch glucose again.
const SnapshotContext = createContext<GlucoseSnapshot | null>(null);
// Defaults to a no-op so the glucose card also works outside a provider.
const PublishContext = createContext<(snapshot: GlucoseSnapshot | null) => void>(() => {});

function same(a: GlucoseSnapshot | null, b: GlucoseSnapshot | null) {
  if (a === b) return true;
  return (
    a !== null &&
    b !== null &&
    a.status === b.status &&
    a.sgv === b.sgv &&
    a.unit === b.unit &&
    a.direction === b.direction &&
    a.date === b.date
  );
}

export function GlucoseStatusProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<GlucoseSnapshot | null>(null);
  // The glucose card republishes on every render; only a change in the reading
  // itself should reach the consumers.
  const publish = useCallback(
    (next: GlucoseSnapshot | null) => setSnapshot((prev) => (same(prev, next) ? prev : next)),
    [],
  );
  return (
    <PublishContext.Provider value={publish}>
      <SnapshotContext.Provider value={snapshot}>{children}</SnapshotContext.Provider>
    </PublishContext.Provider>
  );
}

/** The latest reading; null while unknown (no glucose card, no reading yet). */
export function useGlucoseReading(): GlucoseSnapshot | null {
  return useContext(SnapshotContext);
}

/** Status of the latest reading; null while unknown. */
export function useGlucoseStatus(): GlucoseStatus | null {
  return useContext(SnapshotContext)?.status ?? null;
}

/**
 * For the glucose card: publishes its latest reading (null when there is none)
 * and clears it when the card goes away, so leaving the page can't leave a
 * stale color or value behind.
 */
export function usePublishGlucose(snapshot: GlucoseSnapshot | null) {
  const publish = useContext(PublishContext);
  useEffect(() => {
    publish(snapshot);
  }, [publish, snapshot]);
  useEffect(() => () => publish(null), [publish]);
}
