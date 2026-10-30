"use client";

// Small chip telling the signed-in person whether they are the sensor owner
// or a health watcher with read-only remote access (see lib/glucose/access.ts).

import { Eye, UserRound } from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";
import type { GlucoseRole } from "@/lib/glucose/types";

export default function GlucoseRoleBadge({
  role,
  tinted = false,
}: {
  role: GlucoseRole;
  // On a surface colored by the glucose status (the companion card), take the
  // surface's ink instead of the sidebar palette.
  tinted?: boolean;
}) {
  const { dict } = useI18n();
  const isOwner = role === "owner";
  const Icon = isOwner ? UserRound : Eye;
  const palette = tinted
    ? "bg-black/10 text-current"
    : isOwner
      ? "bg-highlight/15 text-highlight"
      : "bg-sidebar-accent text-sidebar-foreground/80";

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold sm:text-xs ${palette}`}
    >
      <Icon className="h-3 w-3 sm:h-3.5 sm:w-3.5" aria-hidden="true" />
      {isOwner ? dict.glucose.roleOwner : dict.glucose.roleWatcher}
    </span>
  );
}
