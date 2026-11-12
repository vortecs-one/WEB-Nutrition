"use client";

import { useI18n } from "@/lib/i18n/provider";
import { useVTokens } from "@/lib/vtokens/use-vtokens";
import TokenBadge from "./TokenBadge";

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
    <TokenBadge
      label={dict.vtokens.label}
      hint={dict.vtokens.hint}
      value={formatted}
      unavailable={unavailable}
      iconSrc="/tokens/v-healthy.png"
      className={className}
    />
  );
}
