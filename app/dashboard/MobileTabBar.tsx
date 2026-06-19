"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n/provider";
import { useRole } from "@/lib/role/provider";
import { getNavItems } from "./nav";

// Native-style top tab navigation, shown only on small screens.
// Sits directly under the sticky header and surfaces each role's primary
// destinations with large, easy-to-tap targets.
export default function MobileTabBar() {
  const pathname = usePathname();
  const { dict } = useI18n();
  const role = useRole();
  const items = getNavItems(role, dict);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  return (
    <nav
      className="lg:hidden sticky top-0 z-30 border-b border-border bg-card"
      aria-label={dict.nav.sectionTitle}
    >
      <ul className="flex items-stretch justify-around">
        {items.map((item) => {
          const href = item.href ?? item.tabHref ?? "#";
          const active = isActive(item.href ?? item.tabHref ?? "");
          const Icon = item.icon;
          return (
            <li key={item.key} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={[
                  "flex flex-col items-center justify-center gap-1 min-h-16 px-1 text-[11px] font-medium transition-colors",
                  active
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground",
                ].join(" ")}
              >
                <span
                  className={[
                    "flex h-9 w-12 items-center justify-center rounded-full transition-colors",
                    active ? "bg-accent" : "bg-transparent",
                  ].join(" ")}
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="leading-none truncate max-w-full">
                  {item.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
