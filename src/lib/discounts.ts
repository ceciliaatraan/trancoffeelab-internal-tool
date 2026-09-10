import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { computeDiscountSplit, type DiscountAppliesTo } from "./discount-split";

export type { DiscountAppliesTo };

export type DiscountEvaluation =
  | {
      valid: true;
      code: string;
      type: "percentage" | "fixed";
      appliesTo: DiscountAppliesTo;
      /** Sum of the two below - convenient when the split doesn't matter. */
      amountOre: number;
      productsDiscountOre: number;
      shippingDiscountOre: number;
    }
  | { valid: false; reason: string };

/**
 * Rabattkoder behandlas skiftlägesokänsligt - lagras och slås upp i
 * versaler. `value` är hundradels procent för typ percentage (samma
 * mönster som tax_rate) eller öre för typ fixed. `shippingOre` ska vara
 * det belopp frakten faktiskt skulle kosta (0 om fri frakt redan gäller)
 * - annars kan en "shipping"/"both"-kod inte räknas ut korrekt.
 */
export async function evaluateDiscountCode(
  code: string,
  subtotalOre: number,
  shippingOre: number,
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

  const { productsDiscountOre, shippingDiscountOre } = computeDiscountSplit(
    row.type,
    row.value,
    row.appliesTo,
    subtotalOre,
    shippingOre,
  );

  return {
    valid: true,
    code: row.code,
    type: row.type,
    appliesTo: row.appliesTo,
    amountOre: productsDiscountOre + shippingDiscountOre,
    productsDiscountOre,
    shippingDiscountOre,
  };
}
