import type { DefaultSession, DefaultUser } from "next-auth";
import type { DefaultJWT } from "next-auth/jwt";

// Custom fields attached to the user/session/token by the credentials
// providers in auth.ts (Thruxion login + native-app handoff).
declare module "next-auth" {
  interface User extends DefaultUser {
    role?: string | null;
    platform?: string | null;
    humanId?: string | null;
    locale?: string | null;
  }

  interface Session {
    user?: DefaultSession["user"] & {
      id?: string;
      role?: string | null;
      platform?: string | null;
      humanId?: string | null;
      locale?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    role?: string | null;
    platform?: string | null;
    humanId?: string | null;
    locale?: string | null;
  }
}
