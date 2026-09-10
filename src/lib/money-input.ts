/**
 * Converts what a human types into a form (kronor, whole/decimal percent)
 * into the integer öre/hundredths-of-a-percent the DB and Kustom's API
 * require - see db/schema/catalog.ts and lib/kustom/tax.ts for why those
 * stay integers. This file is the ONLY place that conversion happens; the
 * data model and Kustom payloads are never touched.
 */

function parseDecimal(input: string | null | undefined): number {
  if (input == null) return NaN;
  const trimmed = input.trim().replace(",", ".");
  if (trimmed === "") return NaN;
  return Number(trimmed);
}

/** "179" or "179,50" -> 17900 / 17950 öre. NaN if empty/invalid. */
export function kronorToOre(input: string | null | undefined): number {
  const kronor = parseDecimal(input);
  return Number.isFinite(kronor) ? Math.round(kronor * 100) : NaN;
}

/** "25" or "10,75" -> 2500 / 1075 hundredths-of-a-percent. NaN if empty/invalid. */
export function percentToHundredths(input: string | null | undefined): number {
  const percent = parseDecimal(input);
  return Number.isFinite(percent) ? Math.round(percent * 100) : NaN;
}

/** Inverse of kronorToOre, for prefilling a form field. */
export function oreToKronorInput(ore: number): string {
  return (ore / 100).toString();
}

/** Inverse of percentToHundredths, for prefilling a form field. */
export function hundredthsToPercentInput(hundredthsPercent: number): string {
  return (hundredthsPercent / 100).toString();
}
