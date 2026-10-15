/** Kassan tar bara Swish (ägarens beslut 2026-10-15). */
export const PAYMENT_METHODS = [{ id: "swish", label: "Swish" }] as const;

export type PosPaymentMethod = (typeof PAYMENT_METHODS)[number]["id"];

export function paymentMethodLabel(id: string): string {
  return PAYMENT_METHODS.find((method) => method.id === id)?.label ?? id;
}

export const POS_STATUS_LABELS: Record<string, string> = {
  pending: "Väntar på betalning",
  paid: "Betald",
  cancelled: "Avbruten",
  refunded: "Ångrad",
};

/** Cookie med senast valda försäljningsställe och anteckning på enheten. */
export const KASSA_PLACE_COOKIE = "tran-kassa-place";

/**
 * Läser cookien. `locationId` är bara ett förslag - kassasidan kontrollerar
 * att stället fortfarande finns (och inte är arkiverat) innan det används.
 */
export function parseKassaPlace(raw: string | undefined): { locationId: string | null; note: string } {
  const fallback = { locationId: null, note: "" };
  if (!raw) return fallback;
  try {
    // Next avkodar ibland redan cookie-värdet - prova båda.
    let text = raw;
    try {
      text = decodeURIComponent(raw);
    } catch {
      // Redan avkodat (t.ex. ett "%" i anteckningen).
    }
    const parsed = JSON.parse(text) as { locationId?: unknown; note?: unknown };
    return {
      locationId: typeof parsed.locationId === "string" ? parsed.locationId : null,
      note: typeof parsed.note === "string" ? parsed.note.slice(0, 200) : "",
    };
  } catch {
    return fallback;
  }
}
