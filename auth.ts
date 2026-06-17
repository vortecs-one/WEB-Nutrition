import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { userLogin } from "@/lib/thruxion-api";
import { consumeHandoffToken } from "@/lib/handoff";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        // Explicitly type credentials so TS knows these are strings
        const { email, password } = credentials as {
          email: string;
          password: string;
        };

        // Authenticate against the external Thruxion "humans" API.
        // This performs the two-step flow: system-login -> user/login.
        try {
          const user = await userLogin(email, password);
          if (!user) return null;

          // Return user object for the session.
          return {
            id: String(user.id ?? user.email ?? email),
            email: user.email ?? email,
            name: user.name ?? null,
            role: user.role ?? null,
            platform: user.platform ?? null,
          };
        } catch (err) {
          console.log("[v0] Thruxion login error:", (err as Error).message);
          // Surface as a failed login rather than crashing the route.
          return null;
        }
      },
    }),

    // Native-app handoff: signs a user in from a single-use token issued by
    // /api/auth/app-handoff/issue. No password is involved here — the token
    // already represents a credential check performed at issue time.
    CredentialsProvider({
      id: "app-handoff",
      name: "App Handoff",
      credentials: {
        handoffToken: { label: "Handoff Token", type: "text" },
      },
      async authorize(credentials) {
        const handoffToken = (credentials as { handoffToken?: string })
          ?.handoffToken;
        if (!handoffToken) return null;

        try {
          // Atomically consumes the token (single-use, expiry-checked).
          const identity = await consumeHandoffToken(handoffToken);
          if (!identity) return null;

          return {
            id: String(identity.userId ?? identity.email),
            email: identity.email,
            name: identity.name ?? null,
            role: identity.role ?? null,
            platform: identity.platform ?? null,
          };
        } catch (err) {
          console.log("[v0] handoff authorize error:", (err as Error).message);
          return null;
        }
      },
    }),
  ],

  session: {
    strategy: "jwt",
  },

  pages: {
    signIn: "/login",
  },

  callbacks: {
    async jwt({ token, user }) {
      // Persist custom fields onto the JWT at sign-in time.
      if (user) {
        (token as any).role = (user as any).role ?? null;
        (token as any).platform = (user as any).platform ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        // Safely assign custom id + role + platform to the session user
        (session.user as any).id = token.sub;
        (session.user as any).role = (token as any).role ?? null;
        (session.user as any).platform = (token as any).platform ?? null;
      }
      return session;
    },
  },
});
