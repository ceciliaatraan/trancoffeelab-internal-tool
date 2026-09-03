import { z } from "zod";

const slugPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * taxRate är obligatoriskt utan default — moms skiljer sig mellan kaffe/
 * kondenserad mjölk (livsmedel) och phin-filter (inte livsmedel), så varje
 * produkt måste ta aktivt ställning. 0–10000 = 0–100% i hundradels procent.
 */
export const productInputSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1, "Slug krävs")
    .regex(slugPattern, "Slug får bara innehålla a-z, 0-9 och bindestreck"),
  nameSv: z.string().trim().min(1, "Namn (svenska) krävs"),
  nameEn: z.string().trim().min(1, "Namn (engelska) krävs"),
  descriptionSv: z.string().trim().optional(),
  descriptionEn: z.string().trim().optional(),
  sku: z.string().trim().min(1, "SKU krävs"),
  priceOre: z.coerce.number().int().min(0, "Pris kan inte vara negativt"),
  taxRate: z.coerce
    .number()
    .int()
    .min(0, "Moms kan inte vara negativ")
    .max(10000, "Moms kan inte överstiga 100%"),
  weightGrams: z.coerce.number().int().min(1, "Vikt krävs"),
  status: z.enum(["draft", "published", "archived"]),
  sortOrder: z.coerce.number().int().default(0),
  /** Förbeställning: egenskap på PRODUKTEN, inte på varianten. */
  isPreorder: z.coerce.boolean().default(false),
  /** Ungefärligt datum — visas för kund som "Beräknad leverans: ‹månad/period›". */
  expectedShipDate: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : undefined)),
});

export type ProductInput = z.infer<typeof productInputSchema>;

export const variantInputSchema = z.object({
  nameSv: z.string().trim().min(1, "Namn (svenska) krävs"),
  nameEn: z.string().trim().min(1, "Namn (engelska) krävs"),
  sku: z.string().trim().min(1, "SKU krävs"),
  priceOre: z.coerce.number().int().min(0, "Pris kan inte vara negativt"),
  weightGrams: z.coerce.number().int().min(1, "Vikt krävs"),
  sortOrder: z.coerce.number().int().default(0),
});

export type VariantInput = z.infer<typeof variantInputSchema>;

export const inventoryAdjustSchema = z.object({
  inventoryId: z.uuid(),
  delta: z.coerce.number().int().refine((v) => v !== 0, "Ange en ändring skild från noll"),
  reason: z.enum(["manual_adjustment", "return"]),
  note: z.string().trim().min(1, "Ange en orsak"),
});

export type InventoryAdjustInput = z.infer<typeof inventoryAdjustSchema>;
