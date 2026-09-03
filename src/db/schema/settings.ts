import { pgTable, integer, uuid, timestamp } from "drizzle-orm/pg-core";

/**
 * Singleton-tabell — appen läser/skapar alltid den första (och enda)
 * raden, se lib/settings.ts. shippingTaxRate är hundradels procent,
 * samma mönster som produkternas tax_rate. 2500 (25%) är standardsatsen
 * i Sverige och satt som ett rimligt default, INTE en verifierad
 * bokföringsfaktor — bekräfta i /settings innan skarp drift.
 */
export const shopSettings = pgTable("shop_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  shippingFlatRateOre: integer("shipping_flat_rate_ore").notNull().default(4900),
  shippingTaxRate: integer("shipping_tax_rate").notNull().default(2500),
  /** Null = ingen fri frakt-gräns. */
  freeShippingThresholdOre: integer("free_shipping_threshold_ore"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
shopSettings.enableRLS();
