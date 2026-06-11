// app/dashboard/Sidebar.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useI18n } from "@/lib/i18n/provider";
import type { Dictionary } from "@/lib/i18n/dictionaries";

// "key" is used for stable open/close state across languages.
type NavItem = {
  key: string;
  label: string;
  href?: string;
  icon?: React.ReactNode;
  children?: { label: string; href: string }[];
};

function buildNavItems(dict: Dictionary): NavItem[] {
  const t = dict.nav;
  return [
    {
      key: "groups",
      label: t.groups,
      href: "/dashboard/groups",
      icon: "👥",
    },
    {
      key: "patients",
      label: t.patients,
      href: "/dashboard/patients",
      icon: "👨‍👩‍👧‍👦",
    },
    {
      key: "anthropometry",
      label: t.anthropometry,
      icon: "📏",
      children: [
        { label: t.cutoffPoints, href: "/dashboard/antropometria/puntosdecorte" },
        { label: t.bicompartmental, href: "/dashboard/antropometria/bicompartimental" },
        { label: t.tetracompartmental, href: "/dashboard/antropometria/tetracompartimental" },
        { label: t.pentacompartmental, href: "/dashboard/antropometria/pentacompartimental" },
      ],
    },
    {
      key: "nutrition",
      label: t.nutrition,
      icon: "🍽️ ",
      children: [
        { label: t.food, href: "/dashboard/alimentacion/alimentacion" },
        { label: t.hydration, href: "/dashboard/alimentacion/hidratacion" },
      ],
    },
  ];
}

export default function Sidebar() {
  const pathname = usePathname();
  const { dict } = useI18n();
  const navItems = buildNavItems(dict);

  const [open, setOpen] = useState<Record<string, boolean>>({
    anthropometry: true,
    nutrition: true,
  });

  const toggle = (key: string) => {
    setOpen((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const isActive = (href?: string) =>
    href && (pathname === href || pathname.startsWith(href + "/"));

  return (
    <aside className="w-64 bg-slate-900 text-slate-50 border-r border-slate-800 flex flex-col">
      {/* top logo / title */}
      <div className="h-14 px-4 flex items-center border-b border-slate-800">
        <span className="font-bold tracking-wide text-sm">
          {dict.common.appName} · {dict.common.panel}
        </span>
      </div>

      {/* menu */}
      <nav className="flex-1 overflow-y-auto py-3">
        <p className="px-4 mb-2 text-xs uppercase text-slate-400 tracking-wide">
          {dict.nav.sectionTitle}
        </p>

        <ul className="space-y-1 text-sm">
          {navItems.map((item) => {
            const active = isActive(item.href);

            // simple link (no children)
            if (!item.children) {
              return (
                <li key={item.key}>
                  <Link
                    href={item.href ?? "#"}
                    className={[
                      "flex items-center gap-3 px-4 py-2 rounded-md transition-colors",
                      active
                        ? "bg-slate-800 text-white"
                        : "text-slate-200 hover:bg-slate-800/70",
                    ].join(" ")}
                  >
                    <span className="w-5 text-center">{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            }

            // item with submenu
            const opened = open[item.key] ?? false;

            return (
              <li key={item.key}>
                <button
                  type="button"
                  onClick={() => toggle(item.key)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-2 rounded-md text-slate-200 hover:bg-slate-800/70"
                >
                  <span className="flex items-center gap-3">
                    <span className="w-5 text-center">{item.icon}</span>
                    <span>{item.label}</span>
                  </span>
                  <span className="text-xs text-slate-400">
                    {opened ? "▾" : "▸"}
                  </span>
                </button>

                {opened && (
                  <ul className="mt-1 space-y-1 pl-9">
                    {item.children.map((child) => {
                      const childActive = isActive(child.href);
                      return (
                        <li key={child.href}>
                          <Link
                            href={child.href}
                            className={[
                              "flex items-center gap-2 px-3 py-1.5 rounded-md text-xs",
                              childActive
                                ? "bg-slate-800 text-white"
                                : "text-slate-300 hover:bg-slate-800/70",
                            ].join(" ")}
                          >
                            <span>•</span>
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
