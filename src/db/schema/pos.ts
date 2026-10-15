import { pgTable, text, timestamp, uuid, integer, index } from "drizzle-orm/pg-core";
import { adminUsers } from "./admin";
import { products, productVariants } from "./catalog";

/**
 * Kassan - försäljning på plats (event, restaurangen i Borås), 2026-10-15.
 * Helt skild från `orders` (webbshopens Kustom-ordrar): egna tabeller, egen
 * nummerserie, och kassabiträden (rollen "cashier") ser bara kassan. Det
 * enda som delas med resten av systemet är lagret (en såld vara dras från
 * "I lager" med orsaken pos_sale, se lib/kassa/stock.ts) och Slack.
 *
 * status: "pending" (QR-koden visas, kunden har inte betalat än), "paid",
 * "cancelled" (avbruten innan betalning) eller "refunded" (ångrad efter
 * betalning - lagret är tillbakalagt, pengarna betalas tillbaka i Swish-
 * appen för hand). Fritext som orders.status, kontrolleras i koden.
 */
export const posSales = pgTable(
  "pos_sales",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    saleNumber: integer("sale_number").notNull().generatedAlwaysAsIdentity({ startWith: 1 }),
    status: text("status").notNull().default("pending"),
    /** En av POS_LOCATIONS i lib/kassa/locations.ts. */
    location: text("location").notNull(),
    /** Valfri anteckning, t.ex. eventets namn. */
    note: text("note"),
    /** "swish" | "card" | "cash" */
    paymentMethod: text("payment_method").notNull(),
    totalOre: integer("total_ore").notNull(),
    taxOre: integer("tax_ore").notNull(),
    soldByAdminId: uuid("sold_by_admin_id").references(() => adminUsers.id, { onDelete: "set null" }),
    soldByEmail: text("sold_by_email"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  },
  (table) => [index("pos_sales_created_at_idx").on(table.createdAt)],
);
posSales.enableRLS();

export const posSaleLines = pgTable("pos_sale_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  saleId: uuid("sale_id")
    .notNull()
    .references(() => posSales.id, { onDelete: "cascade" }),
  productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
  variantId: uuid("variant_id").references(() => productVariants.id, { onDelete: "set null" }),
  sku: text("sku").notNull(),
  /** Namnet vid försäljningen (produkt + ev. variant). */
  name: text("name").notNull(),
  quantity: integer("quantity").notNull(),
  unitPriceOre: integer("unit_price_ore").notNull(),
  taxRate: integer("tax_rate").notNull(),
  totalOre: integer("total_ore").notNull(),
});
posSaleLines.enableRLS();
