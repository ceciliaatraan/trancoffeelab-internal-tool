/**
 * Nyhetsbrevsrutan i Kustoms kassa (`options.additional_checkbox`, samma
 * modell som Klarna Checkout v3). Kunden kryssar i den INNE i Kustoms
 * iframe; svaret kommer tillbaka på ordern som
 * `merchant_requested.additional_checkbox` och sparas som
 * customers.marketing_consent (se process-kustom-order.ts).
 */
export const MARKETING_CHECKBOX_TEXT = {
  "sv-SE": "Ja tack, skicka nyheter och erbjudanden från TRAN Coffee Lab till min e-post.",
  "en-SE": "Yes please, send me news and offers from TRAN Coffee Lab by email.",
} as const;

/**
 * Om kunden kryssade i nyhetsbrevsrutan, enligt en Kustom-order (Checkout-
 * eller Order Management-svaret). Tål både `additional_checkbox` (en ruta)
 * och `additional_checkboxes` (lista) - vilket Kustom skickar tillbaka är
 * inte bekräftat. Allt annat än ett tydligt "ikryssad" räknas som nej.
 */
export function hasMarketingConsent(order: unknown): boolean {
  if (!order || typeof order !== "object") return false;
  const requested = (order as Record<string, unknown>).merchant_requested;
  if (!requested || typeof requested !== "object") return false;
  const { additional_checkbox, additional_checkboxes } = requested as Record<string, unknown>;
  if (additional_checkbox === true) return true;
  return (
    Array.isArray(additional_checkboxes) &&
    additional_checkboxes.some(
      (box) => Boolean(box) && typeof box === "object" && (box as { checked?: unknown }).checked === true,
    )
  );
}
