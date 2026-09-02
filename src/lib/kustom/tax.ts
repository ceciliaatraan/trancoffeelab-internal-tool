export type TaxBreakdown = {
  grossAmount: number;
  netAmount: number;
  taxAmount: number;
};

/**
 * Räknar moms bakvägs från ett bruttobelopp (inkl. moms) i minsta
 * valutaenhet (öre). taxRate är hundradels procent (25% = 2500).
 *
 * taxAmount härleds som grossAmount - netAmount (inte avrundat separat)
 * så att netAmount + taxAmount ALLTID summerar exakt till grossAmount —
 * annars blir det bokföringsfel när flera rader summeras till en order.
 */
export function calculateTaxFromGross(
  grossAmount: number,
  taxRateHundredthsPercent: number,
): TaxBreakdown {
  if (!Number.isInteger(grossAmount)) {
    throw new Error("grossAmount måste vara ett heltal (öre).");
  }
  if (!Number.isInteger(taxRateHundredthsPercent) || taxRateHundredthsPercent < 0) {
    throw new Error("taxRateHundredthsPercent måste vara ett heltal >= 0.");
  }

  const netAmount = Math.round(
    (grossAmount * 10000) / (10000 + taxRateHundredthsPercent),
  );
  const taxAmount = grossAmount - netAmount;

  return { grossAmount, netAmount, taxAmount };
}
