"use client";

import { Handshake } from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";
import { useH2HTokens } from "@/lib/h2h-tokens/use-h2h-tokens";
import TokenBadge from "./TokenBadge";

// The user's H2H token balance. Stays at 0 until its earning logic exists.
export default function H2HTokensBadge({ className = "" }: { className?: string }) {
  const { locale, dict } = useI18n();
  const { amount, decimals, loading, error } = useH2HTokens();
  const unavailable = loading || error;

  const formatted = unavailable
    ? "–"
    : new Intl.NumberFormat(locale === "es" ? "es-CL" : locale, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(amount);

  return (
    <TokenBadge
      tone="accent"
      label={dict.h2hTokens.label}
      hint={dict.h2hTokens.hint}
      value={formatted}
      unavailable={unavailable}
      icon={<Handshake className="h-4 w-4" aria-hidden="true" />}
      className={className}
    />
  );
}
