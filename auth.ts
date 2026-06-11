import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { userLogin } from "@/lib/thruxion-api";

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
          };
        } catch (err) {
          console.log("[v0] Thruxion login error:", (err as Error).message);
          // Surface as a failed login rather than crashing the route.
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
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        // Safely assign custom id + role to the session user
        (session.user as any).id = token.sub;
        (session.user as any).role = (token as any).role ?? null;
      }
      return session;
    },
  },
});
