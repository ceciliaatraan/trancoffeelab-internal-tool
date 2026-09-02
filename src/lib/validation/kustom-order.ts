import { z } from "zod";

/**
 * Vi modellerar bara de fält vi faktiskt läser ur Kustoms
 * order-representation (validation-callbacken skickar hela ordern i
 * body:en, bekräftat mot docs.kustom.co — se docs/kustom.md). Övriga
 * fält i det verkliga svaret ignoreras utan att valideringen underkänns.
 */
export const kustomOrderLineSchema = z.object({
  type: z.string(),
  reference: z.string().optional(),
  quantity: z.coerce.number().int().nonnegative(),
});

export const kustomValidationRequestSchema = z.object({
  order_lines: z.array(kustomOrderLineSchema).default([]),
});

export type KustomValidationRequest = z.infer<typeof kustomValidationRequestSchema>;
