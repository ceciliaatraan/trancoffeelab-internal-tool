import { calculateTaxFromGross } from "@/lib/kustom/tax";

/** En sak som går att sälja i kassan - en produkt utan varianter, eller en variant. */
export type KassaItem = {
  sku: string;
  productId: string;
  variantId: string | null;
  name: string;
  priceOre: number;
  taxRate: number;
};

export type SaleLine = {
  sku: string;
  productId: string;
  variantId: string | null;
  name: string;
  quantity: number;
  unitPriceOre: number;
  taxRate: number;
  totalOre: number;
  taxOre: number;
};

export const MAX_LINE_QUANTITY = 99;

/**
 * Räknar fram en försäljnings rader och summa ur katalogen - priset tas
 * alltid härifrån (serversidan), aldrig från det webbläsaren skickar.
 * Samma SKU två gånger slås ihop. Kastar på okänd vara eller orimligt antal.
 */
export function buildSaleLines(
  catalog: KassaItem[],
  requested: { sku: string; quantity: number }[],
): { lines: SaleLine[]; totalOre: number; taxOre: number } {
  const quantities = new Map<string, number>();
  for (const { sku, quantity } of requested) {
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new Error("Antalet måste vara ett heltal, minst 1.");
    }
    quantities.set(sku, (quantities.get(sku) ?? 0) + quantity);
  }
  if (quantities.size === 0) throw new Error("Lägg till minst en vara.");

  const lines: SaleLine[] = [];
  for (const [sku, quantity] of quantities) {
    const item = catalog.find((entry) => entry.sku === sku);
    if (!item) throw new Error(`Okänd vara (${sku}) - ladda om kassan.`);
    if (quantity > MAX_LINE_QUANTITY) {
      throw new Error(`Högst ${MAX_LINE_QUANTITY} st av samma vara per försäljning.`);
    }
    const totalOre = item.priceOre * quantity;
    lines.push({
      sku,
      productId: item.productId,
      variantId: item.variantId,
      name: item.name,
      quantity,
      unitPriceOre: item.priceOre,
      taxRate: item.taxRate,
      totalOre,
      taxOre: calculateTaxFromGross(totalOre, item.taxRate).taxAmount,
    });
  }

  return {
    lines,
    totalOre: lines.reduce((sum, line) => sum + line.totalOre, 0),
    taxOre: lines.reduce((sum, line) => sum + line.taxOre, 0),
  };
}
