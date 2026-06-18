"use client";

import { useSession, signOut } from "next-auth/react";
import { Leaf, LogOut } from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import RoleSwitcher from "@/components/RoleSwitcher";

function formatLocaleDate(locale: string) {
  const now = new Date();
  const tag = locale === "es" ? "es-CL" : locale;
  const formatted = now.toLocaleDateString(tag, {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

export default function Topbar() {
  const { data: session } = useSession();
  const { locale, dict } = useI18n();
  const userEmail = session?.user?.email ?? "";
  const userName =
    session?.user?.name ?? userEmail.split("@")[0] ?? dict.topbar.defaultUser;
  const initial = (userName[0] ?? "U").toUpperCase();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-2 border-b border-border bg-card/90 px-4 backdrop-blur lg:px-8">
      {/* Left: brand on mobile, date on desktop */}
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground lg:hidden">
          <Leaf className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="hidden min-w-0 leading-tight sm:block">
          <p className="truncate text-sm font-semibold lg:text-base">
            {dict.common.appName}
          </p>
          <p className="hidden text-xs text-muted-foreground lg:block">
            {formatLocaleDate(locale)}
          </p>
        </div>
      </div>

      {/* Right: controls */}
      <div className="flex shrink-0 items-center gap-2">
        {/* TEST control to preview each experience */}
        <RoleSwitcher variant="light" />
        <LanguageSwitcher variant="light" className="hidden sm:inline-flex" />

        <div className="hidden items-center gap-2 sm:flex">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">
            {initial}
          </span>
          <span className="hidden flex-col text-right leading-tight lg:flex">
            <span className="text-xs font-medium">{userName}</span>
            <span className="max-w-[160px] truncate text-[11px] text-muted-foreground">
              {userEmail}
            </span>
          </span>
        </div>

        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          aria-label={dict.topbar.logout}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-secondary px-3 text-xs font-medium text-secondary-foreground transition hover:bg-accent"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">{dict.topbar.logout}</span>
        </button>
      </div>
    </header>
  );
}
