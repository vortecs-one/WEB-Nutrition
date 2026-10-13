"use client";

import { createContext, useContext, useState, useTransition, type ReactNode } from "react";
import { applyThemeToDocument, type Theme } from "./config";
import { setTheme as persistTheme } from "./actions";

interface ThemeContextValue {
  theme: Theme;
  isPending: boolean;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ theme: initial, children }: { theme: Theme; children: ReactNode }) {
  const [theme, setLocalTheme] = useState<Theme>(initial);
  const [isPending, startTransition] = useTransition();

  function setTheme(next: Theme) {
    if (next === theme) return;
    const previous = theme;
    setLocalTheme(next);
    applyThemeToDocument(next);
    startTransition(async () => {
      const result = await persistTheme(next);
      if (!result.ok) {
        setLocalTheme(previous);
        applyThemeToDocument(previous);
      }
    });
  }

  return (
    <ThemeContext.Provider value={{ theme, isPending, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
