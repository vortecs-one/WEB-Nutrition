export const THEME_COOKIE = "app_theme";

/**
 * Dark-tinted themes only: many existing components hard-code light text
 * for dark surfaces, so a light theme would break contrast until they are
 * migrated to semantic tokens.
 */
export const themes = ["midnight", "ocean", "forest", "cocoa"] as const;
export type Theme = (typeof themes)[number];

export const DEFAULT_THEME: Theme = "midnight";

interface ThemeMeta {
  /** Classes applied to <html>; dark variants layer on top of `.dark`. */
  htmlClass: string;
  /** Browser UI color (mobile address bar) and picker swatch. */
  background: string;
  swatch: string;
  colorScheme: "dark" | "light";
}

export const themeMeta: Record<Theme, ThemeMeta> = {
  midnight: { htmlClass: "dark", background: "#0e0f12", swatch: "#0e0f12", colorScheme: "dark" },
  ocean: { htmlClass: "dark theme-ocean", background: "#0b1520", swatch: "#1b2a3c", colorScheme: "dark" },
  forest: { htmlClass: "dark theme-forest", background: "#0c1511", swatch: "#1d2c24", colorScheme: "dark" },
  cocoa: { htmlClass: "dark theme-cocoa", background: "#16110e", swatch: "#2c231d", colorScheme: "dark" },
};

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (themes as readonly string[]).includes(value);
}

export function resolveTheme(value: unknown): Theme {
  return isTheme(value) ? value : DEFAULT_THEME;
}

export function applyThemeToDocument(theme: Theme) {
  const root = document.documentElement;
  for (const t of themes) {
    for (const cls of themeMeta[t].htmlClass.split(" ").filter(Boolean)) {
      root.classList.remove(cls);
    }
  }
  for (const cls of themeMeta[theme].htmlClass.split(" ").filter(Boolean)) {
    root.classList.add(cls);
  }
  root.style.colorScheme = themeMeta[theme].colorScheme;
}
