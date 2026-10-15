/** Var kassan används - väljs vid varje försäljning. */
export const POS_LOCATIONS = [
  { id: "event", label: "Event" },
  { id: "restaurang_boras", label: "Restaurangen i Borås" },
] as const;

export type PosLocation = (typeof POS_LOCATIONS)[number]["id"];

/** Kassan tar bara Swish (ägarens beslut 2026-10-15). */
export const PAYMENT_METHODS = [{ id: "swish", label: "Swish" }] as const;

export type PosPaymentMethod = (typeof PAYMENT_METHODS)[number]["id"];

export function locationLabel(id: string): string {
  return POS_LOCATIONS.find((location) => location.id === id)?.label ?? id;
}

export function paymentMethodLabel(id: string): string {
  return PAYMENT_METHODS.find((method) => method.id === id)?.label ?? id;
}

export function isPosLocation(value: unknown): value is PosLocation {
  return POS_LOCATIONS.some((location) => location.id === value);
}

export const POS_STATUS_LABELS: Record<string, string> = {
  pending: "Väntar på betalning",
  paid: "Betald",
  cancelled: "Avbruten",
  refunded: "Ångrad",
};

/** Cookie med senast valda plats och anteckning på enheten. */
export const KASSA_PLACE_COOKIE = "tran-kassa-place";

export function parseKassaPlace(raw: string | undefined): { location: PosLocation; note: string } {
  const fallback = { location: POS_LOCATIONS[0].id as PosLocation, note: "" };
  if (!raw) return fallback;
  try {
    // Next avkodar ibland redan cookie-värdet - prova båda.
    let text = raw;
    try {
      text = decodeURIComponent(raw);
    } catch {
      // Redan avkodat (t.ex. ett "%" i anteckningen).
    }
    const parsed = JSON.parse(text) as { location?: unknown; note?: unknown };
    return {
      location: isPosLocation(parsed.location) ? parsed.location : fallback.location,
      note: typeof parsed.note === "string" ? parsed.note.slice(0, 200) : "",
    };
  } catch {
    return fallback;
  }
}
