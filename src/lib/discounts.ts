import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

export type DiscountEvaluation =
  | { valid: true; code: string; type: "percentage" | "fixed"; amountOre: number }
  | { valid: false; reason: string };

/**
 * Rabattkoder behandlas skiftlägesokänsligt — lagras och slås upp i
 * versaler. `value` är hundradels procent för typ percentage (samma
 * mönster som tax_rate) eller öre för typ fixed.
 */
export async function evaluateDiscountCode(
  code: string,
  subtotalOre: number,
): Promise<DiscountEvaluation> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return { valid: false, reason: "Ingen kod angavs." };

  const [row] = await db
    .select()
    .from(schema.discountCodes)
    .where(eq(schema.discountCodes.code, normalized));

  if (!row) return { valid: false, reason: "Koden finns inte." };
  if (!row.active) return { valid: false, reason: "Koden är inte aktiv." };

  const now = new Date();
  if (row.validFrom && now < row.validFrom) {
    return { valid: false, reason: "Koden gäller inte än." };
  }
  if (row.validUntil && now > row.validUntil) {
    return { valid: false, reason: "Koden har gått ut." };
  }
  if (row.maxUses !== null && row.usedCount >= row.maxUses) {
    return { valid: false, reason: "Koden är förbrukad." };
  }
  if (row.minOrderValueOre !== null && subtotalOre < row.minOrderValueOre) {
    return { valid: false, reason: "Ordervärdet är för lågt för den här koden." };
  }

  const amountOre =
    row.type === "percentage"
      ? Math.round((subtotalOre * row.value) / 10000)
      : Math.min(row.value, subtotalOre);

  return { valid: true, code: row.code, type: row.type, amountOre };
}
