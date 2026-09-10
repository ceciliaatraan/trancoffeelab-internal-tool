import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  pgEnum,
  boolean,
} from "drizzle-orm/pg-core";

export const discountTypeEnum = pgEnum("discount_type", [
  "percentage",
  "fixed",
]);

/**
 * Vad rabatten räknas på. "products" (standard, tidigare det enda
 * beteendet) rör bara varuraderna - frakten kostar fullt pris. "shipping"
 * rör bara frakten - varorna kostar fullt pris. "both" räknas på summan av
 * båda (percentage: samma procentsats på varje del var för sig; fixed:
 * hela beloppet dras först från varorna, ett ev. överskott därefter från
 * frakten - se computeDiscountSplit i lib/discount-split.ts).
 */
export const discountAppliesToEnum = pgEnum("discount_applies_to", [
  "products",
  "shipping",
  "both",
]);

/**
 * `value` är hundradels procent (10% = 1000) för typ percentage, öre för
 * typ fixed - samma mönster som produkternas tax_rate/priceOre så att alla
 * belopp i systemet konsekvent är heltal i minsta enhet.
 */
export const discountCodes = pgTable("discount_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  type: discountTypeEnum("type").notNull(),
  value: integer("value").notNull(),
  appliesTo: discountAppliesToEnum("applies_to").notNull().default("products"),
  validFrom: timestamp("valid_from", { withTimezone: true }),
  validUntil: timestamp("valid_until", { withTimezone: true }),
  maxUses: integer("max_uses"),
  usedCount: integer("used_count").notNull().default(0),
  minOrderValueOre: integer("min_order_value_ore"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
discountCodes.enableRLS();
