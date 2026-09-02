import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  jsonb,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { customers } from "./customers";
import { products } from "./catalog";

/**
 * `status` och `paymentStatus` är fritext, inte enum, tills vidare: Kustoms
 * faktiska statusvärden (t.ex. checkout_incomplete/checkout_complete,
 * capture-status) verifieras mot docs.kustom.co i fas 3 och dokumenteras i
 * docs/kustom.md innan de låses till en enum — se den filen för status.
 * fulfillmentStatus är vårt EGET fraktbegrepp och kan definieras nu.
 */
export const orderFulfillmentStatusEnum = pgEnum("order_fulfillment_status", [
  "unfulfilled",
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

  shippingAddress: jsonb("shipping_address"),
  billingAddress: jsonb("billing_address"),

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
