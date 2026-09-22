import { z } from "zod";

export const cartItemSchema = z.object({
  sku: z.string().trim().min(1),
  quantity: z.coerce.number().int().min(1).max(99),
});

export const cartRequestSchema = z.object({
  items: z.array(cartItemSchema).min(1, "Varukorgen är tom"),
  discountCode: z.string().trim().min(1).optional(),
  locale: z.enum(["sv-SE", "en-SE"]).default("sv-SE"),
});

export type CartRequest = z.infer<typeof cartRequestSchema>;
