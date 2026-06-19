// Central role configuration.
// Mirrors the i18n pattern so it's easy to extend and later swap to
// session-derived roles (e.g. from the Thruxion API) without touching the UI.
//
// To add a new role in the future:
//   1. Add its code here.
//   2. Add labels in roleLabels / roleShortLabels.
//   3. Add nav + permissions handling where roles are consumed.

export const roles = ["nutritionist", "user"] as const;

export type Role = (typeof roles)[number];

// Default role when nothing is set yet.
// Everyone logs in as a normal "user" by default. Professional
// nutritionist accounts will be derived from the session/role later.
export const defaultRole: Role = "user";

// Human-readable labels (resolved through the dictionary at render time,
// these are just fallbacks / keys).
export const roleLabels: Record<Role, string> = {
  nutritionist: "Nutritionist",
  user: "User",
};

export const ROLE_COOKIE = "APP_ROLE";

export function isRole(value: string | undefined | null): value is Role {
  return !!value && (roles as readonly string[]).includes(value);
}

export function resolveRole(value: string | undefined | null): Role {
  return isRole(value) ? value : defaultRole;
}
