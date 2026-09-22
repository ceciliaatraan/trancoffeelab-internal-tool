import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

export type SwapCandidate = {
  sku: string;
  label: string;
  priceOre: number;
  taxRate: number;
};

/**
 * Alla SKU:er som går att byta en orderrad till - publicerade produkter
 * UTAN varianter, plus alla varianter av publicerade produkter (en
 * produkt MED varianter går inte att köpa på sin egen SKU, samma regel
 * som resten av lagersystemet - se /inventory:s hasVariants-filtrering,
 * lib/inventory/overview.ts). Inkluderar bundlar (kit) - ett kit kan
 * bytas mot ett annat kit av samma pris, precis som vilken annan SKU
 * som helst (se editOrderLineAction i orders/actions.ts, som avgör
 * lagerhanteringen via samma expandLineToInventoryTargets som resten
 * av systemet).
 */
export async function getSwapCandidates(): Promise<SwapCandidate[]> {
  const [baseProducts, variants] = await Promise.all([
    db
      .select({
        sku: schema.products.sku,
        label: schema.products.nameSv,
        priceOre: schema.products.priceOre,
        taxRate: schema.products.taxRate,
        productId: schema.products.id,
      })
      .from(schema.products)
      .where(eq(schema.products.status, "published")),
    db
      .select({
        sku: schema.productVariants.sku,
        productLabel: schema.products.nameSv,
        variantLabel: schema.productVariants.nameSv,
        priceOre: schema.productVariants.priceOre,
        taxRate: schema.products.taxRate,
        productId: schema.productVariants.productId,
      })
      .from(schema.productVariants)
      .innerJoin(schema.products, eq(schema.products.id, schema.productVariants.productId))
      .where(eq(schema.products.status, "published")),
  ]);

  const productIdsWithVariants = new Set(variants.map((v) => v.productId));

  const candidates: SwapCandidate[] = [
    ...baseProducts
      .filter((p) => !productIdsWithVariants.has(p.productId))
      .map((p) => ({ sku: p.sku, label: p.label, priceOre: p.priceOre, taxRate: p.taxRate })),
    ...variants.map((v) => ({
      sku: v.sku,
      label: `${v.productLabel} - ${v.variantLabel}`,
      priceOre: v.priceOre,
      taxRate: v.taxRate,
    })),
  ];

  return candidates.sort((a, b) => a.label.localeCompare(b.label, "sv"));
}
