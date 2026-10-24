import {
  ArrowDown,
  ArrowDownRight,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  ChevronsDown,
  ChevronsUp,
  type LucideIcon,
} from "lucide-react";
import type { TrendDirection } from "./types";

// Trend direction → lucide arrow icon. Double arrows use chevrons, 45° trends
// use the diagonal arrows, flat uses a straight right arrow. Non-computable /
// none directions render no icon.
export const TREND_ICON: Record<TrendDirection, LucideIcon | null> = {
  DoubleUp: ChevronsUp,
  SingleUp: ArrowUp,
  FortyFiveUp: ArrowUpRight,
  Flat: ArrowRight,
  FortyFiveDown: ArrowDownRight,
  SingleDown: ArrowDown,
  DoubleDown: ChevronsDown,
  "NOT COMPUTABLE": null,
  "RATE OUT OF RANGE": null,
  NONE: null,
};
