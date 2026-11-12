"use client";

import { Coins } from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";
import { useVTokens } from "@/lib/vtokens/use-vtokens";

// The user's v-healthy token wallet balance, shown at the top of the dashboard.
export default function VTokensBadge({ className = "" }: { className?: string }) {
  const { locale, dict } = useI18n();
  const { amount, decimals, loading, error } = useVTokens();
  const unavailable = loading || error;

  const formatted = unavailable
    ? "–"
    : new Intl.NumberFormat(locale === "es" ? "es-CL" : locale, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(amount);

  return (
    <div
      role="status"
      aria-label={`${dict.vtokens.label}: ${formatted}`}
      title={dict.vtokens.hint}
      className={`inline-flex items-center gap-2 rounded-full bg-primary/15 py-1 pl-1 pr-3.5 ${className}`}
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <Coins className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="flex flex-col leading-none">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {dict.vtokens.label}
        </span>
        <span
          className={`mt-1 text-base font-semibold tabular-nums text-foreground ${unavailable ? "opacity-40" : ""}`}
        >
          {formatted}
        </span>
      </span>
    </div>
  );
}
