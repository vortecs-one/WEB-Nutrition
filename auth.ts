import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { db } from "@/lib/db";
import { users } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcrypt"; // or "bcryptjs" if you switch later

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

        // Find user in DB
        const result = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        const user = result[0];
        if (!user) return null;

        // Compare password hash
        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) return null;

        // Return user object for session
        return {
          id: String(user.id),
          email: user.email,
        };
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
    async session({ session, token }) {
      if (session.user && token.sub) {
        // Safely assign custom id to the session user
        (session.user as any).id = token.sub;
      }
      return session;
    },
  },
});
