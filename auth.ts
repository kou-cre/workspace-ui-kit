import NextAuth, { type DefaultSession } from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "@/lib/db";

declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  // Vercel 以外の常駐ホスト（Railway/Render 等）でも host を信頼する（UntrustedHost 回避）。
  // Vercel では自動信頼されるため無害。
  trustHost: true,
  providers: [
    Google({}),
  ],
  session: { strategy: "database" },
  pages: { signIn: "/login" },
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
  events: {
    async signIn({ account, user }) {
      // Auth.js v5 does not update Account tokens on re-login, so we do it manually
      if (account?.provider === "google" && user.id) {
        const data: Record<string, unknown> = {};
        if (account.access_token) data.access_token = account.access_token;
        if (account.expires_at) data.expires_at = account.expires_at;
        if (account.scope) data.scope = account.scope;
        if (account.refresh_token) data.refresh_token = account.refresh_token;
        if (Object.keys(data).length > 0) {
          await db.account.updateMany({
            where: { userId: user.id, provider: "google" },
            data,
          });
        }
      }
    },
    async createUser({ user }) {
      if (!user.id || !user.email) return;
      const pending = await db.pendingInvite.findMany({ where: { email: user.email } });
      if (pending.length === 0) return;
      await db.$transaction([
        ...pending.map((inv) =>
          db.projectMember.upsert({
            where: { projectId_userId: { projectId: inv.projectId, userId: user.id! } },
            create: { projectId: inv.projectId, userId: user.id! },
            update: {},
          }),
        ),
        db.pendingInvite.deleteMany({ where: { email: user.email } }),
      ]);
    },
  },
});
