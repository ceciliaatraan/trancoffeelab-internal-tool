import { pgTable, integer, uuid, timestamp } from "drizzle-orm/pg-core";

/**
 * Singleton-tabell - appen läser/skapar alltid den första (och enda)
 * raden, se lib/settings.ts. Frakten har ingen egen momssats: den ärver
 * kundvagnens kvantitetsviktade snitt (samma weightedAverageTaxRate som
 * rabattraden använder, se checkout/session/route.ts) - ett kit blandar
 * 6 %/25 % till ungefär 11-12 %, ren kaffe/mjölk blir 6 %, ett phin-filter
 * för sig blir 25 %, osv. Fanns tidigare en separat shipping_tax_rate-
 * kolumn med ett fast 25%-default, borttagen till förmån för detta.
 */
export const shopSettings = pgTable("shop_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  shippingFlatRateOre: integer("shipping_flat_rate_ore").notNull().default(4900),
  /** Null = ingen fri frakt-gräns. */
  freeShippingThresholdOre: integer("free_shipping_threshold_ore"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
shopSettings.enableRLS();
