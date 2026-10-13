"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, Palette } from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";
import { useTheme } from "@/lib/theme/provider";
import { themeMeta, themes } from "@/lib/theme/config";

export default function ThemeSelector({
  className = "",
  placement = "down",
}: {
  className?: string;
  placement?: "down" | "up";
}) {
  const { dict } = useI18n();
  const { theme, isPending, setTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!isOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className={className || "relative"}>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-label={dict.theme.label}
        aria-expanded={isOpen}
        aria-controls={menuId}
        className={`inline-flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-secondary-foreground transition hover:bg-accent hover:text-accent-foreground ${
          isPending ? "opacity-60" : ""
        }`}
      >
        <Palette className="h-4 w-4" aria-hidden="true" />
      </button>

      {isOpen && (
        <div
          id={menuId}
          role="radiogroup"
          aria-label={dict.theme.label}
          className={`absolute right-0 ${placement === "up" ? "bottom-12" : "top-12"} z-50 flex w-48 flex-col gap-1 rounded-2xl border border-border bg-popover p-2 text-popover-foreground shadow-xl`}
        >
          <p className="px-2 pb-1 pt-0.5 text-xs font-medium text-muted-foreground">
            {dict.theme.label}
          </p>
          {themes.map((option) => {
            const active = option === theme;
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => {
                  setTheme(option);
                  setIsOpen(false);
                }}
                className={`flex items-center gap-3 rounded-xl px-2 py-2 text-left text-sm transition ${
                  active ? "bg-secondary" : "hover:bg-secondary"
                }`}
              >
                <span
                  aria-hidden="true"
                  className="h-5 w-5 shrink-0 rounded-full border border-border"
                  style={{ backgroundColor: themeMeta[option].swatch }}
                />
                <span className="flex-1">{dict.theme[option]}</span>
                {active && <Check className="h-4 w-4 text-primary" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
