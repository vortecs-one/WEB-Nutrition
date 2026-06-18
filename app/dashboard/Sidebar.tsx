// app/dashboard/Sidebar.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronDown, Leaf } from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";
import { useRole } from "@/lib/role/provider";
import { getNavItems } from "./nav";

export default function Sidebar({
  onNavigate,
}: {
  /** Called when a link is clicked — used to close any mobile drawer. */
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const { dict } = useI18n();
  const role = useRole();
  const navItems = getNavItems(role, dict);

  const [open, setOpen] = useState<Record<string, boolean>>({
    anthropometry: true,
    nutrition: true,
  });

  const toggle = (key: string) =>
    setOpen((prev) => ({ ...prev, [key]: !prev[key] }));

  const isActive = (href?: string) =>
    !!href && (pathname === href || pathname.startsWith(href + "/"));

  return (
    <aside className="w-64 h-full bg-sidebar text-sidebar-foreground flex flex-col">
      {/* Brand */}
      <div className="h-16 px-5 flex items-center gap-2.5 border-b border-sidebar-border shrink-0">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground">
          <Leaf className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="font-semibold tracking-tight text-base">
          {dict.common.appName}
        </span>
      </div>

      {/* Menu */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <p className="px-2 mb-3 text-[11px] font-medium uppercase tracking-wider text-sidebar-foreground/50">
          {dict.nav.sectionTitle}
        </p>

        <ul className="space-y-1.5">
          {navItems.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;

            // Simple link (no children)
            if (!item.children) {
              return (
                <li key={item.key}>
                  <Link
                    href={item.href ?? "#"}
                    onClick={onNavigate}
                    className={[
                      "flex items-center gap-3 px-3 min-h-12 rounded-xl text-sm font-medium transition-colors",
                      active
                        ? "bg-sidebar-primary text-sidebar-primary-foreground"
                        : "text-sidebar-foreground/80 hover:bg-sidebar-accent",
                    ].join(" ")}
                  >
                    <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            }

            // Item with submenu
            const opened = open[item.key] ?? false;
            const groupActive = isActive(item.tabHref);

            return (
              <li key={item.key}>
                <button
                  type="button"
                  onClick={() => toggle(item.key)}
                  aria-expanded={opened}
                  className={[
                    "w-full flex items-center justify-between gap-3 px-3 min-h-12 rounded-xl text-sm font-medium transition-colors",
                    groupActive && !opened
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent",
                  ].join(" ")}
                >
                  <span className="flex items-center gap-3">
                    <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                    <span>{item.label}</span>
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${
                      opened ? "rotate-180" : ""
                    }`}
                    aria-hidden="true"
                  />
                </button>

                {opened && (
                  <ul className="mt-1 space-y-1 pl-4">
                    {item.children.map((child) => {
                      const childActive = isActive(child.href);
                      return (
                        <li key={child.href}>
                          <Link
                            href={child.href}
                            onClick={onNavigate}
                            className={[
                              "flex items-center gap-2.5 px-3 min-h-10 rounded-lg text-[13px] transition-colors",
                              childActive
                                ? "bg-sidebar-primary/90 text-sidebar-primary-foreground"
                                : "text-sidebar-foreground/65 hover:bg-sidebar-accent",
                            ].join(" ")}
                          >
                            <span
                              className="h-1.5 w-1.5 rounded-full bg-current opacity-60"
                              aria-hidden="true"
                            />
                            <span>{child.label}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
