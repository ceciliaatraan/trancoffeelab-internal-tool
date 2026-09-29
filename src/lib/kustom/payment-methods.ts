/**
 * Betalsätt där kunden betalar DIREKT (kort, Swish m.m.) - de debiteras
 * direkt vid order (ägarens beslut 2026-09-29, se docs/kustom.md). Allt
 * annat - faktura, delbetalning, fasta avbetalningar (Klarnas "betala
 * senare"), OTHER och okända/saknade värden - lämnas reserverat och
 * debiteras först senare, via "Debitera" på ordern.
 *
 * Värdena är `initial_payment_method.type` ur Kustoms Order Management-
 * API (OpenAPI-schemat InitialPaymentMethodDto, delat av ägaren; APPLE_PAY_CARD
 * bekräftat i en riktig order).
 */
const PAY_NOW_METHODS = new Set([
  "CARD",
  "PAY_BY_CARD",
  "APPLE_PAY_CARD",
  "GOOGLE_PAY_CARD",
  "CARTES_BANCAIRES",
  "SWISH",
  "MOBILEPAY",
  "BANK_TRANSFER",
  "BLIK",
  "TWINT",
  "BANCONTACT",
]);

export function isPayNowMethod(type: string | null | undefined): boolean {
  return Boolean(type) && PAY_NOW_METHODS.has(type as string);
}
