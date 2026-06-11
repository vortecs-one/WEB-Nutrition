"use client";

import { useTransition } from "react";
import { roles, type Role } from "@/lib/role/config";
import { useRole } from "@/lib/role/provider";
import { setRole } from "@/lib/role/actions";
import { useI18n } from "@/lib/i18n/provider";

type Props = {
  /** "dark" suits dark backgrounds (topbar), "light" suits light pages. */
  variant?: "dark" | "light";
  className?: string;
};

// TEST control: lets us preview the nutritionist vs. normal-user experience.
// In production the role comes from the authenticated session instead.
export default function RoleSwitcher({ variant = "dark", className = "" }: Props) {
  const current = useRole();
  const { dict } = useI18n();
  const [isPending, startTransition] = useTransition();

  const onChange = (next: Role) => {
    if (next === current) return;
    startTransition(async () => {
      await setRole(next);
    });
  };

  const base =
    "inline-flex items-center gap-0.5 rounded-full p-0.5 text-xs font-medium border";
  const skin =
    variant === "dark"
      ? "bg-slate-800 border-slate-700"
      : "bg-muted border-border";

  return (
    <div
      className={`${base} ${skin} ${isPending ? "opacity-60" : ""} ${className}`}
      role="group"
      aria-label={dict.common.role}
    >
      {roles.map((code) => {
        const active = code === current;
        const activeSkin =
          variant === "dark"
            ? "bg-slate-50 text-slate-900"
            : "bg-primary text-primary-foreground";
        const idleSkin =
          variant === "dark"
            ? "text-slate-300 hover:text-white"
            : "text-muted-foreground hover:text-foreground";

        return (
          <button
            key={code}
            type="button"
            onClick={() => onChange(code)}
            disabled={isPending}
            aria-pressed={active}
            className={`px-2.5 py-1 rounded-full transition-colors whitespace-nowrap ${
              active ? activeSkin : idleSkin
            }`}
          >
            {dict.roles[code]}
          </button>
        );
      })}
    </div>
  );
}
