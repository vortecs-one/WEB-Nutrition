// app/dashboard/Sidebar.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

type NavItem = {
  label: string;
  href?: string;
  icon?: React.ReactNode;
  children?: { label: string; href: string }[];
};

const navItems: NavItem[] = [
  {
    label: "Puntos de corte",
    href: "/dashboard/cutoffs",
    icon: "📍",
  },
  {
    label: "Grupos de trabajo",
    href: "/dashboard/groups",
    icon: "👥",
  },
  {
    label: "Ficha paciente",
    href: "/dashboard/patients",
    icon: "👨‍👩‍👧‍👦",
  },
  {
    label: "Antropometría",
    icon: "📏",
    children: [
      { label: "Mediciones", href: "/dashboard/antropometria/mediciones" },
      { label: "Evolución", href: "/dashboard/antropometria/evolucion" },
    ],
  },
  {
    label: "Alimentación",
    icon: "🍽️",
    children: [
      { label: "Planes", href: "/dashboard/alimentacion/planes" },
      { label: "Registros", href: "/dashboard/alimentacion/registros" },
    ],
  },
  {
    label: "Hidratación",
    icon: "💧",
    children: [
      { label: "Registros", href: "/dashboard/hidratacion/registros" },
      { label: "Resumen", href: "/dashboard/hidratacion/resumen" },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  const [open, setOpen] = useState<Record<string, boolean>>({
    Antropometría: true,
    Alimentación: true,
    Hidratación: true,
  });

  const toggle = (label: string) => {
    setOpen((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  const isActive = (href?: string) =>
    href && (pathname === href || pathname.startsWith(href + "/"));

  return (
    <aside className="w-64 bg-slate-900 text-slate-50 border-r border-slate-800 flex flex-col">
      {/* top logo / title */}
      <div className="h-14 px-4 flex items-center border-b border-slate-800">
        <span className="font-bold tracking-wide text-sm">
          NutritionAI · Panel
        </span>
      </div>

      {/* menu */}
      <nav className="flex-1 overflow-y-auto py-3">
        <p className="px-4 mb-2 text-xs uppercase text-slate-400 tracking-wide">
          Dashboard
        </p>

        <ul className="space-y-1 text-sm">
          {navItems.map((item) => {
            const active = isActive(item.href);

            // simple link (no children)
            if (!item.children) {
              return (
                <li key={item.label}>
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
            const opened = open[item.label] ?? false;

            return (
              <li key={item.label}>
                <button
                  type="button"
                  onClick={() => toggle(item.label)}
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
