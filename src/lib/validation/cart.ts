import { z } from "zod";

export const cartItemSchema = z.object({
  sku: z.string().trim().min(1),
  quantity: z.coerce.number().int().min(1).max(99),
});

export const businessAddressSchema = z.object({
  street: z.string().trim().min(1),
  postalCode: z.string().trim().min(1),
  city: z.string().trim().min(1),
  country: z.string().trim().length(2).default("SE"),
});

/**
 * "Köper som företag"-tillägget - se orders.is_business_purchase i
 * schema/orders.ts för varför det här körs via vår egen kundvagn i
 * stället för Kustoms checkout.
 */
export const businessPurchaseSchema = z.object({
  name: z.string().trim().min(1),
  vatNumber: z.string().trim().min(1),
  address: businessAddressSchema,
});

export const cartRequestSchema = z.object({
  items: z.array(cartItemSchema).min(1, "Varukorgen är tom"),
  discountCode: z.string().trim().min(1).optional(),
  locale: z.enum(["sv-SE", "en-SE"]).default("sv-SE"),
  business: businessPurchaseSchema.optional(),
});

export type CartRequest = z.infer<typeof cartRequestSchema>;
