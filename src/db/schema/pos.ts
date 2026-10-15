import { pgTable, text, timestamp, uuid, integer, index, boolean } from "drizzle-orm/pg-core";
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
/**
 * Försäljningsställen - "Restaurang TRAN", "Event" och de event ni lägger
 * till själva (2026-10-15), så varje kassaköp kategoriseras efter var det
 * gjordes. Ett ställe arkiveras i stället för att tas bort, så gamla köp
 * behåller sin koppling.
 */
export const posLocations = pgTable("pos_locations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdByEmail: text("created_by_email"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
posLocations.enableRLS();

/**
 * Fast försäljningsställe per e-postadress (gemener) - den personen säljer
 * alltid där och kan varken välja eller lägga till andra ställen. Nyckel på
 * e-post, inte admin_users, så det kan ställas in innan personen loggat in.
 */
export const posLocationUsers = pgTable("pos_location_users", {
  email: text("email").primaryKey(),
  locationId: uuid("location_id")
    .notNull()
    .references(() => posLocations.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
posLocationUsers.enableRLS();

export const posSales = pgTable(
  "pos_sales",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    saleNumber: integer("sale_number").notNull().generatedAlwaysAsIdentity({ startWith: 1 }),
    status: text("status").notNull().default("pending"),
    /** Försäljningsstället (pos_locations) - null bara om stället skulle tas bort helt. */
    locationId: uuid("location_id").references(() => posLocations.id, { onDelete: "set null" }),
    /** Ställets namn vid försäljningen (visas även om stället senare döps om). */
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
    /**
     * Kundens namn, om kassabiträdet skrev in det (valfritt) - Swish Företag
     * skickar ingen uppgift om betalaren till oss, så den kan inte hämtas
     * automatiskt.
     */
    customerName: text("customer_name"),
    /** Kundens e-post - krävs innan Swish-koden visas (ägarens beslut 2026-10-15). Kvittot skickas hit om kunden vill. */
    customerEmail: text("customer_email"),
    /** Om kunden ville ha kvitto: true = ja (skickat), false = nej tack, null = inte frågat. */
    receiptRequested: boolean("receipt_requested"),
    /** Dit kvittot skickades, om kunden ville ha ett (se lib/email/pos-receipt.ts). */
    receiptEmail: text("receipt_email"),
    receiptSentAt: timestamp("receipt_sent_at", { withTimezone: true }),
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
