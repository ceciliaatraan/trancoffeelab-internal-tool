import {
  pgTable,
  text,
  timestamp,
  uuid,
  pgEnum,
  integer,
  jsonb,
  index,
  boolean,
  date,
  unique,
} from "drizzle-orm/pg-core";
import { adminUsers } from "./admin";

export const productStatusEnum = pgEnum("product_status", [
  "draft",
  "published",
  "archived",
]);

/**
 * tax_rate är hundradels procent (25% = 2500, 12% = 1200) — samma
 * representation som Kustom förväntar sig i order_lines, så vi slipper
 * konvertera fram och tillbaka. Obligatoriskt fält: moms skiljer sig
 * mellan kaffe/kondenserad mjölk (livsmedel) och phin-filter (inte
 * livsmedel), så ingen sats får hårdkodas i applikationskoden.
 */
export const products = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  nameSv: text("name_sv").notNull(),
  nameEn: text("name_en").notNull(),
  descriptionSv: text("description_sv"),
  descriptionEn: text("description_en"),
  sku: text("sku").notNull().unique(),
  priceOre: integer("price_ore").notNull(),
  taxRate: integer("tax_rate").notNull(),
  weightGrams: integer("weight_grams").notNull(),
  status: productStatusEnum("status").notNull().default("draft"),
  images: jsonb("images").notNull().default([]).$type<string[]>(),
  sortOrder: integer("sort_order").notNull().default(0),
  /**
   * Förbeställning: en egenskap på produkten, inte på varianten
   * (`product_variants` ska INTE ha motsvarande fält). `expectedShipDate`
   * är ett ungefärligt datum — visas för kund som "Beräknad leverans:
   * ‹månad/period›", aldrig ett exakt löfte.
   */
  isPreorder: boolean("is_preorder").notNull().default(false),
  expectedShipDate: date("expected_ship_date"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
products.enableRLS();

/** Valfria varianter, t.ex. phin-filter i liten/stor. Ärver moms från produkten. */
export const productVariants = pgTable("product_variants", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  nameSv: text("name_sv").notNull(),
  nameEn: text("name_en").notNull(),
  sku: text("sku").notNull().unique(),
  priceOre: integer("price_ore").notNull(),
  weightGrams: integer("weight_grams").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
productVariants.enableRLS();

/**
 * En rad per lagerförd enhet: antingen en produkt utan varianter
 * (variantId null) eller en specifik variant (variantId satt).
 */
export const inventory = pgTable(
  "inventory",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id").references(() => productVariants.id, {
      onDelete: "cascade",
    }),
    quantity: integer("quantity").notNull().default(0),
    reservedQuantity: integer("reserved_quantity").notNull().default(0),
    alarmLevel: integer("alarm_level").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("inventory_product_idx").on(table.productId)],
);
inventory.enableRLS();

export const inventoryMovementReasonEnum = pgEnum(
  "inventory_movement_reason",
  ["manual_adjustment", "order_reserved", "order_released", "order_shipped", "return"],
);

/** Varje lagerförändring, med orsak och vem/vad som orsakade den. */
export const inventoryMovements = pgTable("inventory_movements", {
  id: uuid("id").primaryKey().defaultRandom(),
  inventoryId: uuid("inventory_id")
    .notNull()
    .references(() => inventory.id, { onDelete: "cascade" }),
  changeAmount: integer("change_amount").notNull(),
  reason: inventoryMovementReasonEnum("reason").notNull(),
  note: text("note"),
  orderId: uuid("order_id"),
  causedByAdminId: uuid("caused_by_admin_id").references(
    () => adminUsers.id,
    { onDelete: "set null" },
  ),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
inventoryMovements.enableRLS();

/**
 * Kit-produkter (t.ex. Komplett Kit) har inget eget lagersaldo att fylla i
 * manuellt — hur många som går att sätta ihop beräknas från
 * komponenternas fria lager (kvantitet minus reserverat). Bara
 * produktnivå stöds (ingen `componentVariantId` som pekar på en
 * kit-variant), eftersom inga av dagens kit har varianter — enkelt att
 * utöka om det behövs.
 */
export const productBundleItems = pgTable(
  "product_bundle_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bundleProductId: uuid("bundle_product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    componentProductId: uuid("component_product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    componentVariantId: uuid("component_variant_id").references(
      () => productVariants.id,
      { onDelete: "restrict" },
    ),
    quantity: integer("quantity").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("product_bundle_items_bundle_idx").on(table.bundleProductId),
    unique("product_bundle_items_component_unique").on(
      table.bundleProductId,
      table.componentProductId,
      table.componentVariantId,
    ),
  ],
);
productBundleItems.enableRLS();
