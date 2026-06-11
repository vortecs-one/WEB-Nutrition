"use client";

import { useSession } from "next-auth/react";
import { signOut } from "next-auth/react";
import { useI18n } from "@/lib/i18n/provider";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import RoleSwitcher from "@/components/RoleSwitcher";

function formatLocaleDate(locale: string) {
  const now = new Date();
  // Use a region-aware tag (es-CL keeps the original Chilean formatting).
  const tag = locale === "es" ? "es-CL" : locale;
  const formatted = now.toLocaleDateString(tag, {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

export default function Topbar({ onOpenMenu }: { onOpenMenu?: () => void }) {
  const { data: session } = useSession();
  const { locale, dict } = useI18n();
  const userEmail = session?.user?.email ?? "";
  const userName =
    session?.user?.name ?? userEmail.split("@")[0] ?? dict.topbar.defaultUser;
  const initial = (userName[0] ?? "U").toUpperCase();

  return (
    <header className="h-14 flex items-center justify-between gap-2 px-3 lg:px-6 border-b border-slate-200 bg-slate-900 text-slate-50">
      {/* Left: menu button (mobile) + logo */}
      <div className="flex items-center gap-2 min-w-0">
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label={dict.common.openMenu}
          className="lg:hidden inline-flex items-center justify-center w-9 h-9 rounded-md hover:bg-slate-800 transition shrink-0"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>

        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-full bg-purple-500 flex items-center justify-center text-xs font-bold shrink-0">
            TP
          </div>
          <div className="leading-tight min-w-0 hidden sm:block">
            <div className="font-semibold text-sm truncate">Team Peñalolén</div>
            <div className="text-[11px] text-slate-300">{dict.topbar.plan}</div>
          </div>
        </div>
      </div>

      {/* Center: date (desktop only) */}
      <div className="hidden xl:block text-xs text-slate-300 whitespace-nowrap">
        {formatLocaleDate(locale)}
      </div>

      {/* Right: role + language + user + logout */}
      <div className="flex items-center gap-2 lg:gap-3 shrink-0">
        {/* TEST control to preview each experience */}
        <RoleSwitcher variant="dark" />

        <LanguageSwitcher variant="dark" className="hidden sm:inline-flex" />

        <div className="hidden md:flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-sm font-bold">
            {initial}
          </div>
          <div className="hidden lg:flex flex-col text-right leading-tight">
            <span className="text-xs font-medium">{userName}</span>
            <span className="text-[11px] text-slate-300 truncate max-w-[160px]">
              {userEmail}
            </span>
          </div>
        </div>

        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          aria-label={dict.topbar.logout}
          className="bg-red-600/90 hover:bg-red-700 text-xs px-2.5 lg:px-3 py-1 rounded-full flex items-center gap-1 transition shrink-0"
        >
          <span aria-hidden="true">⏻</span>
          <span className="hidden sm:inline">{dict.topbar.logout}</span>
        </button>
      </div>
    </header>
  );
}
