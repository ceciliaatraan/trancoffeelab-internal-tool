import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import {
  getAllowedGoogleHd,
  isCashierEmail,
  isEmailAllowed,
  resolveLoginRole,
} from "@/lib/allowlist";

/**
 * Google-profilen har fler fält än next-auth's inbyggda Profile-typ
 * exponerar (email_verified, hd) - vi typar bara det vi faktiskt läser.
 */
type GoogleProfile = {
  email?: string;
  email_verified?: boolean;
  hd?: string;
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: schema.users,
    accountsTable: schema.accounts,
    sessionsTable: schema.sessions,
    verificationTokensTable: schema.verificationTokens,
  }),
  session: { strategy: "database" },
  providers: [Google],
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    async signIn({ user, profile }) {
      const email = user.email ?? profile?.email ?? null;
      const googleProfile = profile as GoogleProfile | undefined;

      const emailVerified = googleProfile?.email_verified === true;
      const allowedHd = getAllowedGoogleHd();
      const hdMatches = allowedHd === null || googleProfile?.hd === allowedHd;
      const listed = isEmailAllowed(email) || isCashierEmail(email);
      const allowed = listed && emailVerified && hdMatches;

      if (!allowed) {
        await db.insert(schema.auditLog).values({
          actorEmail: email,
          action: "signin_rejected",
          success: false,
          metadata: {
            reason: !listed
              ? "email_not_allowlisted"
              : !emailVerified
                ? "email_not_verified"
                : "hd_mismatch",
            hd: googleProfile?.hd ?? null,
          },
        });
        return false;
      }

      return true;
    },
    async session({ session, user }) {
      const [adminUser] = await db
        .select({ role: schema.adminUsers.role })
        .from(schema.adminUsers)
        .where(eq(schema.adminUsers.userId, user.id));

      if (adminUser) {
        session.user.role = adminUser.role;
      }
      return session;
    },
  },
  events: {
    /**
     * Körs bara för sign-ins som redan passerat signIn-callbacken ovan,
     * dvs. bara allowlistade konton. Skapar admin_users-raden första
     * gången. Rollen styrs av listorna via resolveLoginRole: ett konto som
     * bara står i ALLOWED_CASHIER_EMAILS är alltid kassabiträde, annars
     * rörs en redan satt roll inte.
     */
    async signIn({ user }) {
      if (!user.id || !user.email) return;

      const [existing] = await db
        .select({ role: schema.adminUsers.role })
        .from(schema.adminUsers)
        .where(eq(schema.adminUsers.userId, user.id));
      const role = resolveLoginRole(user.email, existing?.role ?? null);

      await db
        .insert(schema.adminUsers)
        .values({
          userId: user.id,
          email: user.email,
          lastLoginAt: new Date(),
          ...(role ? { role } : {}),
        })
        .onConflictDoUpdate({
          target: schema.adminUsers.userId,
          set: { lastLoginAt: new Date(), email: user.email, ...(role ? { role } : {}) },
        });
    },
  },
});
