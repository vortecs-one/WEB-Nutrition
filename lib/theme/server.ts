import { cookies } from "next/headers";
import { THEME_COOKIE, resolveTheme, type Theme } from "./config";

export async function getCurrentTheme(): Promise<Theme> {
  const store = await cookies();
  return resolveTheme(store.get(THEME_COOKIE)?.value);
}
