import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { toUserRow } from "@/lib/conversation-helpers";

/**
 * Option A — Auth:
 * - Primary session: NextAuth (Auth.js v5) JWT session.
 * - Credentials provider backed by local Postgres `users` table (email + bcrypt password).
 * - Supabase Auth users are synced INTO `users` on sign-up / sign-in
 *   (see /api/auth/signup), so both auth systems share the same profile
 *   rows and the chat keeps working. There is a single login path.
 */

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "pingchat-dev-secret-change-me",
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: {
    signIn: "/",
  },
  providers: [
    Credentials({
      name: "Email",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = String(credentials?.email || "").trim().toLowerCase();
        const password = String(credentials?.password || "");
        if (!email || !password) return null;

        const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
        if (!row || !row.passwordHash) return null;

        const ok = await bcrypt.compare(password, row.passwordHash);
        if (!ok) return null;

        // touch lastSeen
        await db.update(users).set({ lastSeen: new Date() }).where(eq(users.id, row.id));

        const profile = toUserRow(row);
        return {
          id: row.id,
          name: row.displayName,
          email: row.email,
          image: null,
          // custom fields carried through JWT
          chatUser: profile,
        } as unknown as { id: string; name: string; email: string };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.chatUserId = (user as { id: string }).id;
        const extra = user as unknown as { chatUser?: unknown };
        if (extra.chatUser) token.chatUser = extra.chatUser as never;
      }
      return token;
    },
    async session({ session, token }) {
      const t = token as unknown as {
        chatUserId?: string;
        chatUser?: import("@/lib/types").UserRow;
      };
      if (t.chatUserId) {
        (session.user as unknown as { id: string }).id = t.chatUserId;
        (session as unknown as { chatUserId: string }).chatUserId = t.chatUserId;
      }
      if (t.chatUser) {
        (session as unknown as { chatUser: unknown }).chatUser = t.chatUser;
      }
      return session;
    },
  },
});
