import "server-only";
import { db, schema } from "@/db";

export type ShopSettings = typeof schema.shopSettings.$inferSelect;

/** Singleton — skapar default-raden om ingen finns än. */
export async function getShopSettings(): Promise<ShopSettings> {
  const [existing] = await db.select().from(schema.shopSettings).limit(1);
  if (existing) return existing;

  const [created] = await db.insert(schema.shopSettings).values({}).returning();
  return created;
}
