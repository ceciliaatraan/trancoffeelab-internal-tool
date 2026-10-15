import "server-only";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";

export type PosLocation = { id: string; name: string };

export const MAX_LOCATION_NAME = 60;

/** Försäljningsställen som går att välja i kassan (inte arkiverade), i den ordning ni valt. */
export async function getActiveLocations(): Promise<PosLocation[]> {
  return db
    .select({ id: schema.posLocations.id, name: schema.posLocations.name })
    .from(schema.posLocations)
    .where(isNull(schema.posLocations.archivedAt))
    .orderBy(asc(schema.posLocations.sortOrder), asc(schema.posLocations.name));
}

/** Personens fasta försäljningsställe (pos_location_users), eller null om hen får välja själv. */
export async function getFixedLocationForEmail(email: string): Promise<PosLocation | null> {
  const [row] = await db
    .select({ id: schema.posLocations.id, name: schema.posLocations.name })
    .from(schema.posLocationUsers)
    .innerJoin(schema.posLocations, eq(schema.posLocationUsers.locationId, schema.posLocations.id))
    .where(eq(schema.posLocationUsers.email, email.trim().toLowerCase()));
  return row ?? null;
}

export function normalizeLocationName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, MAX_LOCATION_NAME);
}

/**
 * Lägger till ett försäljningsställe (t.ex. ett event). Finns ett med samma
 * namn (oavsett versaler) återanvänds det - och plockas fram ur arkivet om
 * det var arkiverat - i stället för att skapa en dubblett.
 */
export async function createLocation(rawName: string, createdByEmail: string): Promise<PosLocation> {
  const name = normalizeLocationName(rawName);
  if (!name) throw new Error("Skriv ett namn på försäljningsstället.");

  const [existing] = await db
    .select({ id: schema.posLocations.id, name: schema.posLocations.name })
    .from(schema.posLocations)
    .where(sql`lower(${schema.posLocations.name}) = lower(${name})`);
  if (existing) {
    await db
      .update(schema.posLocations)
      .set({ archivedAt: null })
      .where(eq(schema.posLocations.id, existing.id));
    return existing;
  }

  // Ett nytt ställe hamnar sist - ordningen ändras på /kassa/installningar.
  const [{ maxOrder }] = await db
    .select({ maxOrder: sql<number>`coalesce(max(${schema.posLocations.sortOrder}), 0)::int` })
    .from(schema.posLocations);
  const [created] = await db
    .insert(schema.posLocations)
    .values({ name, createdByEmail, sortOrder: Number(maxOrder) + 1 })
    .returning({ id: schema.posLocations.id, name: schema.posLocations.name });
  return created;
}

/**
 * Den ordning som ska sparas: `requested` (från dra och släpp) i den ordning
 * den kom, men bara id:n som finns - och ställen som inte var med (t.ex.
 * nyss tillagda i en annan flik) läggs sist i sin nuvarande ordning. Ren
 * funktion - se saveLocationOrder.
 */
export function mergeLocationOrder(current: string[], requested: string[]): string[] {
  const known = new Set(current);
  const ordered = [...new Set(requested)].filter((id) => known.has(id));
  const placed = new Set(ordered);
  return [...ordered, ...current.filter((id) => !placed.has(id))];
}

/** Sparar ordningen ställena dragits i (1, 2, 3 …). */
export async function saveLocationOrder(requested: string[]): Promise<void> {
  await db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: schema.posLocations.id })
      .from(schema.posLocations)
      .orderBy(asc(schema.posLocations.sortOrder), asc(schema.posLocations.name))
      .for("update");
    const ordered = mergeLocationOrder(
      rows.map((row) => row.id),
      requested,
    );
    for (const [index, id] of ordered.entries()) {
      await tx.update(schema.posLocations).set({ sortOrder: index + 1 }).where(eq(schema.posLocations.id, id));
    }
  });
}

export async function setLocationArchived(locationId: string, archived: boolean): Promise<void> {
  await db
    .update(schema.posLocations)
    .set({ archivedAt: archived ? new Date() : null })
    .where(eq(schema.posLocations.id, locationId));
}

/** Sätter (eller tar bort, med locationId null) en persons fasta försäljningsställe. */
export async function setFixedLocation(rawEmail: string, locationId: string | null): Promise<void> {
  const email = rawEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Ogiltig e-postadress.");
  if (locationId === null) {
    await db.delete(schema.posLocationUsers).where(eq(schema.posLocationUsers.email, email));
    return;
  }
  await db
    .insert(schema.posLocationUsers)
    .values({ email, locationId })
    .onConflictDoUpdate({ target: schema.posLocationUsers.email, set: { locationId } });
}

export async function getFixedLocations(): Promise<{ email: string; locationName: string }[]> {
  return db
    .select({ email: schema.posLocationUsers.email, locationName: schema.posLocations.name })
    .from(schema.posLocationUsers)
    .innerJoin(schema.posLocations, eq(schema.posLocationUsers.locationId, schema.posLocations.id))
    .orderBy(asc(schema.posLocationUsers.email));
}

export type LocationStats = {
  id: string;
  name: string;
  archived: boolean;
  todayOre: number;
  monthOre: number;
  allTimeOre: number;
  saleCount: number;
};

/**
 * Alla försäljningsställen med betald försäljning idag, denna månad och
 * totalt (svensk tid) - så det syns var köpen kommer ifrån.
 */
export async function getLocationStats(): Promise<LocationStats[]> {
  const paid = and(
    eq(schema.posSales.locationId, schema.posLocations.id),
    eq(schema.posSales.status, "paid"),
  );
  const rows = await db
    .select({
      id: schema.posLocations.id,
      name: schema.posLocations.name,
      archivedAt: schema.posLocations.archivedAt,
      todayOre: sql<number>`coalesce(sum(${schema.posSales.totalOre}) filter (where date_trunc('day', ${schema.posSales.paidAt} at time zone 'Europe/Stockholm') = date_trunc('day', now() at time zone 'Europe/Stockholm')), 0)::int`,
      monthOre: sql<number>`coalesce(sum(${schema.posSales.totalOre}) filter (where date_trunc('month', ${schema.posSales.paidAt} at time zone 'Europe/Stockholm') = date_trunc('month', now() at time zone 'Europe/Stockholm')), 0)::int`,
      allTimeOre: sql<number>`coalesce(sum(${schema.posSales.totalOre}), 0)::int`,
      saleCount: sql<number>`count(${schema.posSales.id})::int`,
    })
    .from(schema.posLocations)
    .leftJoin(schema.posSales, paid)
    .groupBy(schema.posLocations.id)
    .orderBy(asc(schema.posLocations.sortOrder), asc(schema.posLocations.name));
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    archived: row.archivedAt !== null,
    todayOre: Number(row.todayOre),
    monthOre: Number(row.monthOre),
    allTimeOre: Number(row.allTimeOre),
    saleCount: Number(row.saleCount),
  }));
}
