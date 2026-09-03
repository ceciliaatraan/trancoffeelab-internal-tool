import { z } from "zod";

export const discountInputSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(1, "Kod krävs")
      .transform((value) => value.toUpperCase()),
    type: z.enum(["percentage", "fixed"]),
    value: z.coerce.number().int().min(1, "Värdet måste vara större än 0"),
    validFrom: z
      .string()
      .trim()
      .optional()
      .transform((value) => (value ? new Date(value) : undefined)),
    validUntil: z
      .string()
      .trim()
      .optional()
      .transform((value) => (value ? new Date(value) : undefined)),
    maxUses: z.coerce.number().int().min(1).optional(),
    minOrderValueOre: z.coerce.number().int().min(0).optional(),
    active: z.coerce.boolean().default(true),
  })
  .refine((data) => data.type !== "percentage" || data.value <= 10000, {
    message: "Procentrabatt kan inte överstiga 100% (10000)",
    path: ["value"],
  });

export type DiscountInput = z.infer<typeof discountInputSchema>;
