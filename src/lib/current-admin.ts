import "server-only";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db, schema } from "@/db";

export class UnauthorizedError extends Error {
  constructor() {
    super("Inte inloggad.");
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "Kräver ägarbehörighet.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/**
 * Inloggad användare med tillgång till ADMIN (ägare eller personal) -
 * kassabiträden nekas. Varje server action utanför kassan anropar den här,
 * så ett kassabiträde inte kan köra dem ens med ett handgjort anrop (proxy.ts
 * stoppar bara sidvisningar).
 */
export async function requireCurrentAdmin() {
  const adminUser = await requireSignedInUser();
  if (adminUser.role === "cashier") {
    throw new ForbiddenError("Kassabiträden har bara tillgång till kassan.");
  }
  return adminUser;
}

/** Inloggad användare med valfri roll - för kassan, som även kassabiträden får använda. */
export async function requireKassaUser() {
  return requireSignedInUser();
}

/** Kastar om ingen session finns - alla anrop hit sker bakom proxy.ts skydd ändå. */
async function requireSignedInUser() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new UnauthorizedError();
  }

  const [adminUser] = await db
    .select()
    .from(schema.adminUsers)
    .where(eq(schema.adminUsers.userId, session.user.id));

  if (!adminUser) {
    throw new UnauthorizedError();
  }

  return adminUser;
}

/**
 * Rabattkoder och inställningar är ägar-only (spec: "staff får inte
 * ändra rabattkoder eller inställningar") - kontrollen sitter här,
 * server-side, inte bara genom att dölja knappar i UI:t.
 */
export async function requireOwner() {
  const adminUser = await requireCurrentAdmin();
  if (adminUser.role !== "owner") {
    throw new ForbiddenError();
  }
  return adminUser;
}
