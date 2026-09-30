/**
 * Betalsätt där kunden betalar DIREKT (kort, Swish m.m.) - de debiteras
 * direkt vid order (ägarens beslut 2026-09-29, se docs/kustom.md). Allt
 * annat - faktura, delbetalning, fasta avbetalningar (Klarnas "betala
 * senare"), OTHER och okända/saknade värden - lämnas reserverat och
 * debiteras först senare, via "Debitera" på ordern.
 *
 * Värdena är `initial_payment_method.type` ur Kustoms Order Management-
 * API (OpenAPI-schemat InitialPaymentMethodDto, delat av ägaren). Bekräftat
 * i riktiga ordrar 2026-09-29: CARD, APPLE_PAY_CARD, SWISH, DIRECT_DEBIT
 * (Klarnas "betala nu" - debiteras direkt enligt ägaren, finns INTE med i
 * OpenAPI-schemats uppräkning), INVOICE (Klarnas "betala senare") och
 * INVOICE_BUSINESS (företagsfaktura).
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
  "DIRECT_DEBIT",
  "BLIK",
  "TWINT",
  "BANCONTACT",
]);

export function isPayNowMethod(type: string | null | undefined): boolean {
  return Boolean(type) && PAY_NOW_METHODS.has(type as string);
}

/** Betala senare-sätt där kunden betalar till Klarna/fakturautgivaren först EFTER att ordern debiterats. */
const PAY_LATER_METHODS = new Set(["INVOICE", "INVOICE_BUSINESS", "PAY_LATER_IN_PARTS", "FIXED_AMOUNT"]);

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  INVOICE: "Klarna · Betala senare",
  PAY_LATER_IN_PARTS: "Klarna · Delbetalning",
  FIXED_AMOUNT: "Klarna · Delbetalning",
  DIRECT_DEBIT: "Klarna · Betala nu",
  INVOICE_BUSINESS: "Företagsfaktura",
  CARD: "Kort",
  PAY_BY_CARD: "Kort",
  APPLE_PAY_CARD: "Apple Pay",
  GOOGLE_PAY_CARD: "Google Pay",
  SWISH: "Swish",
  BANK_TRANSFER: "Banköverföring",
  MOBILEPAY: "MobilePay",
};

export type PaymentMethodInfo = {
  /** Kustoms typkod, t.ex. "INVOICE" - null om Kustom inte angav någon. */
  type: string | null;
  /** Läsbar etikett i stil med Kustoms portal, t.ex. "Klarna · Betala senare". */
  label: string;
  /** Kunden betalar först efter att ordern debiterats (Klarna betala senare/delbetalning, företagsfaktura). */
  payLater: boolean;
};

/**
 * Läser betalsättet ur Kustoms rådata (`initial_payment_method`). Okända
 * typkoder visar Kustoms egen beskrivning i stället för en gissad etikett.
 * Null om ordern saknar betalsätt helt (t.ex. äldre ordrar).
 */
export function paymentMethodInfo(rawKustomOrder: unknown): PaymentMethodInfo | null {
  if (!rawKustomOrder || typeof rawKustomOrder !== "object") return null;
  const method = (rawKustomOrder as Record<string, unknown>).initial_payment_method;
  if (!method || typeof method !== "object") return null;
  const record = method as Record<string, unknown>;
  const type = typeof record.type === "string" && record.type ? record.type : null;
  const description =
    typeof record.description === "string" && record.description ? record.description : null;
  const label = (type && PAYMENT_METHOD_LABELS[type]) || description || type;
  if (!label) return null;
  return { type, label, payLater: type !== null && PAY_LATER_METHODS.has(type) };
}
