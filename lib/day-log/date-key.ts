// Day keys (YYYY-MM-DD) in the user's local time zone. `toISOString()` is
// UTC, which put anything logged after 21:00 in Chile on the next day.
export function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** The YYYY-MM-DD key `days` days after (or before, if negative) `key`. */
export function shiftDateKey(key: string, days: number): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
