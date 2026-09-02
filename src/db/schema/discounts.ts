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
 * `value` är hundradels procent (10% = 1000) för typ percentage, öre för
 * typ fixed — samma mönster som produkternas tax_rate/priceOre så att alla
 * belopp i systemet konsekvent är heltal i minsta enhet.
 */
export const discountCodes = pgTable("discount_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  type: discountTypeEnum("type").notNull(),
  value: integer("value").notNull(),
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
