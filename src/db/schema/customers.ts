import { pgTable, text, timestamp, uuid, jsonb, boolean } from "drizzle-orm/pg-core";

/**
 * Kunder härleds från ordrar (ingen egen registrering). Raden skapas eller
 * uppdateras när en order sparas i push-endpointen, matchat på e-post.
 */
export const customers = pgTable("customers", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  phone: text("phone"),
  defaultShippingAddress: jsonb("default_shipping_address"),
  defaultBillingAddress: jsonb("default_billing_address"),
  marketingConsent: boolean("marketing_consent").notNull().default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
customers.enableRLS();
