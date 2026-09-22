import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  jsonb,
  pgEnum,
  index,
  boolean,
  unique,
} from "drizzle-orm/pg-core";
import { customers } from "./customers";
import { products, productVariants } from "./catalog";
import { adminUsers } from "./admin";

/**
 * `status` och `paymentStatus` är fritext, inte enum, tills vidare: Kustoms
 * faktiska statusvärden (t.ex. checkout_incomplete/checkout_complete,
 * capture-status) verifieras mot docs.kustom.co i fas 3 och dokumenteras i
 * docs/kustom.md innan de låses till en enum - se den filen för status.
 * fulfillmentStatus är vårt EGET fraktbegrepp och kan definieras nu.
 */
export const orderFulfillmentStatusEnum = pgEnum("order_fulfillment_status", [
  "unfulfilled",
  /**
   * En fraktsedel har skapats hos PostNord men paketet har inte
   * lämnats/hämtats än - räknas fortfarande som RESERVERAT lager, inte
   * skickat (se computeTrueReservedQuantities i order-line-totals.ts -
   * måste inkludera denna statusen, annars "läker" Synka lager bort
   * reservationen för ordrar i det här läget).
   */
  "label_created",
  "shipped",
  "cancelled",
]);

export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderNumber: integer("order_number")
    .notNull()
    .generatedAlwaysAsIdentity({ startWith: 1000 }),
  kustomOrderId: text("kustom_order_id").notNull().unique(),
  customerId: uuid("customer_id").references(() => customers.id, {
    onDelete: "set null",
  }),
  customerEmail: text("customer_email").notNull(),

  status: text("status").notNull(),
  paymentStatus: text("payment_status"),
  fulfillmentStatus: orderFulfillmentStatusEnum("fulfillment_status")
    .notNull()
    .default("unfulfilled"),

  purchaseCountry: text("purchase_country").notNull().default("SE"),
  currency: text("currency").notNull().default("SEK"),
  locale: text("locale").notNull(),

  orderAmountOre: integer("order_amount_ore").notNull(),
  orderTaxAmountOre: integer("order_tax_amount_ore").notNull(),
  /** Cachat från Kustoms Order Management - källan till sanning är alltid Kustom, vi synkar efter varje capture/refund/cancel. */
  capturedAmountOre: integer("captured_amount_ore").notNull().default(0),
  refundedAmountOre: integer("refunded_amount_ore").notNull().default(0),

  /**
   * Sätts av push-hanteraren: true om NÅGON orderrad pekade på en produkt
   * med `products.is_preorder = true` vid ordertillfället. Preorder-ordrar
   * captureas alltid direkt (se persist-order.ts/push/route.ts) - det
   * avviker medvetet från Klarnas normala "vänta med capture till fysisk
   * leverans"-mönster, eftersom varan inte finns i lager än.
   */
  containsPreorder: boolean("contains_preorder").notNull().default(false),

  /**
   * Sätts av push-hanteraren utifrån KUSTOM_ENV vid ordertillfället
   * (allt utom exakt "live" räknas som test) - låter testordrar från
   * Kustom Playground märkas ut i gränssnittet och tas bort separat,
   * utan att kunna blandas ihop med eller av misstag radera riktiga
   * ordrar. Se deleteTestOrderAction i orders/actions.ts.
   */
  isTest: boolean("is_test").notNull().default(false),

  /** Sparat när fulfillment_status sätts till "label_created" - se markLabelCreatedAction. */
  labelTrackingNumber: text("label_tracking_number"),

  shippingAddress: jsonb("shipping_address"),
  billingAddress: jsonb("billing_address"),

  /**
   * Eget "köper som företag"-tillägg, 2026-09-22 - INTE ett fält Kustom
   * skickar. Kustoms egen checkbox för detta i deras checkout-widget
   * kräver ett separat avtal ägaren inte skrivit under än (se
   * docs/kustom.md) - det här är en egen lösning runt omkring det tills
   * dess: fälten fylls i på VÅR kundvagnssida innan Kustoms checkout
   * öppnas, mellanlagras i pending_business_purchases (kustom_order_id
   * är inte känt förrän create-order-anropet svarat, se
   * checkout/session/route.ts) och flyttas hit när ordern landar
   * (persist-order.ts). ÄNDRAR INTE momsberäkningen - momsregnumret är
   * bara information på kvittot/fakturan, inte en signal om
   * omvänd skattskyldighet (den gäller normalt bara B2B-försäljning till
   * ANDRA EU-länder, inte inhemska svenska köp).
   */
  isBusinessPurchase: boolean("is_business_purchase").notNull().default(false),
  businessName: text("business_name"),
  businessVatNumber: text("business_vat_number"),
  businessAddress: jsonb("business_address"),

  /** Senaste rå orderdata hämtad FRÅN Kustom (push litar aldrig på egen body). */
  rawKustomOrder: jsonb("raw_kustom_order"),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
}, (table) => [index("orders_customer_email_idx").on(table.customerEmail)]);
orders.enableRLS();

export const orderLines = pgTable("order_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  productId: uuid("product_id").references(() => products.id, {
    onDelete: "set null",
  }),

  /** Kustom order_lines.type (physical/shipping_fee/discount/…), se docs/kustom.md. */
  type: text("type").notNull(),
  reference: text("reference").notNull(),
  name: text("name").notNull(),
  quantity: integer("quantity").notNull(),
  quantityUnit: text("quantity_unit").notNull(),
  unitPriceOre: integer("unit_price_ore").notNull(),
  taxRate: integer("tax_rate").notNull(),
  totalAmountOre: integer("total_amount_ore").notNull(),
  totalDiscountAmountOre: integer("total_discount_amount_ore")
    .notNull()
    .default(0),
  totalTaxAmountOre: integer("total_tax_amount_ore").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});
orderLines.enableRLS();

/**
 * Per-order-substitution av EN komponent i en kit-orderrad - t.ex. en
 * kund som ändrat sig och vill ha helböna i stället för malet i ett
 * redan köpt Komplett Kit. Kitets EGEN orderrad (SKU/pris/summa) rörs
 * aldrig - bara VILKEN lagervara som faktiskt reserveras/skickas för
 * just den komponent-"platsen" i kitet, för den här specifika ordern.
 *
 * `originalComponentProductId` identifierar "platsen" i kitets recept
 * (från product_bundle_items) - stabil även om själva bytet i sig byts
 * igen. Unik per (orderLineId, originalComponentProductId): en kit-
 * komponent kan bara ha EN aktiv substitution åt gången (ett nytt byte
 * skriver över/ersätter, se swapLineComponentAction).
 *
 * VIKTIGT: expandLineToInventoryTargets (lib/inventory/bundles.ts) och
 * den "sanna" reserverat/skickat-beräkningen (lib/inventory/order-line-
 * totals.ts) MÅSTE slå upp och tillämpa den här tabellen vid kit-
 * expansion - annars "läker" Synka lager bort bytet, och skickad/
 * annullerad-hanteringen skulle träffa fel lagervara.
 */
export const orderLineComponentSwaps = pgTable(
  "order_line_component_swaps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderLineId: uuid("order_line_id")
      .notNull()
      .references(() => orderLines.id, { onDelete: "cascade" }),
    originalComponentProductId: uuid("original_component_product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    newProductId: uuid("new_product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    newVariantId: uuid("new_variant_id").references(() => productVariants.id, {
      onDelete: "restrict",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("order_line_component_swaps_unique").on(
      table.orderLineId,
      table.originalComponentProductId,
    ),
  ],
);
orderLineComponentSwaps.enableRLS();

export const shipments = pgTable("shipments", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  carrier: text("carrier").notNull(),
  trackingNumber: text("tracking_number").notNull(),
  shippedAt: timestamp("shipped_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
shipments.enableRLS();

/**
 * Mellanlagring av företagsuppgifter från VÅR egen kundvagnssida (inte
 * från Kustom, se orders.is_business_purchase ovan) - kundvagnen känner
 * inte till Kustoms order_id förrän EFTER att create-order-anropet
 * svarat, så uppgifterna sparas här nyckelt på kustom_order_id
 * (checkout/session/route.ts) och flyttas in i orders-raden när push-
 * webhooken faktiskt sparar ordern (persist-order.ts), som sedan tar
 * bort raden härifrån. En rad för en övergiven kundvagn (kunden avbryter
 * innan betalning) blir kvarliggande skräp - ofarligt (ingen
 * betalningsdata), men städas inte bort automatiskt ännu.
 */
export const pendingBusinessPurchases = pgTable("pending_business_purchases", {
  kustomOrderId: text("kustom_order_id").primaryKey(),
  businessName: text("business_name").notNull(),
  businessVatNumber: text("business_vat_number").notNull(),
  businessAddress: jsonb("business_address"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
pendingBusinessPurchases.enableRLS();

export const orderEventTypeEnum = pgEnum("order_event_type", [
  "capture",
  "refund",
  "cancel",
]);

/** Betalningshändelser (capture/refund/cancel) - visas i orderdetaljen. */
export const orderEvents = pgTable("order_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  type: orderEventTypeEnum("type").notNull(),
  /** Null för cancel. */
  amountOre: integer("amount_ore"),
  note: text("note"),
  causedByAdminId: uuid("caused_by_admin_id").references(() => adminUsers.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
orderEvents.enableRLS();
