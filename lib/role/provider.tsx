"use client";

import { createContext, useContext } from "react";
import type { Role } from "./config";

const RoleContext = createContext<Role | null>(null);

// Fed the role from a Server Component (root layout) so the first
// client render already knows which experience to show.
export function RoleProvider({
  role,
  children,
}: {
  role: Role;
  children: React.ReactNode;
}) {
  return <RoleContext.Provider value={role}>{children}</RoleContext.Provider>;
}

export function useRole(): Role {
  const ctx = useContext(RoleContext);
  if (!ctx) {
    throw new Error("useRole must be used within a RoleProvider");
  }
  return ctx;
}
