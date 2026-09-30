/**
 * Ren logik (ingen DB, inget nätverk) för den automatiska kopplingen
 * mellan en order och dess PostNord-skickning - se postnord-auto-sync.ts.
 */

/**
 * PostNord-statusar som betyder att paketet faktiskt lämnats in/hämtats
 * och är på väg (eller redan framme/tillbaka). Allt annat - framför allt
 * INFORMED/CREATED (bara EDI/fraktsedel, inget fysiskt paket än) och
 * okända värden - räknas som "fraktsedel skapad" så vi aldrig markerar en
 * order som skickad (och drar av lager) för tidigt. Statusvärdena är
 * PostNords Track & Trace-enum; bara DELIVERED/EN_ROUTE/OTHER har faktiskt
 * observerats i ett riktigt svar (se docs/kustom.md).
 */
const HANDED_OVER_STATUSES = new Set([
  "EN_ROUTE",
  "DELAYED",
  "EXPECTED_DELAY",
  "AVAILABLE_FOR_DELIVERY",
  "DELIVERY_IMPOSSIBLE",
  "DELIVERY_REFUSED",
  "DELIVERED",
  "RETURNED",
  "STOPPED",
]);

export function isHandedOverToPostnord(tracking: {
  status: string;
  items: { status: string }[];
}): boolean {
  return (
    HANDED_OVER_STATUSES.has(tracking.status) ||
    tracking.items.some((item) => HANDED_OVER_STATUSES.has(item.status))
  );
}

export type LookupCandidate = {
  value: string;
  /** findByIdentifier (spårnings-/skickningsnummer) eller findByReference (avsändarens referens). */
  kind: "identifier" | "reference";
  /**
   * Globalt unika värden (UUID, Kustoms egna referenser, ett redan känt
   * spårningsnummer) kan inte av misstag träffa en annan kunds paket - de
   * godtas även om PostNords svar saknar postnummer att jämföra med. Korta
   * värden som ordernumret kräver att postnumret faktiskt matchar.
   */
  unique: boolean;
};

type OrderForLookup = {
  orderNumber: number;
  kustomOrderId: string;
  labelTrackingNumber: string | null;
  rawKustomOrder: unknown;
};

function stringField(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Alla värden vi har som KAN vara det PostNord känner igen en Kustom
 * Shipping Assistant-bokad skickning på. Vilket av dem PostNord faktiskt
 * indexerar KSA-skickningar under är inte bekräftat (se docs/kustom.md) -
 * därför provas alla, och den första som ger en träff (med rätt
 * postnummer) vinner.
 */
export function postnordLookupCandidates(order: OrderForLookup): LookupCandidate[] {
  const raw =
    order.rawKustomOrder && typeof order.rawKustomOrder === "object"
      ? (order.rawKustomOrder as Record<string, unknown>)
      : {};
  const selected =
    raw.selected_shipping_option && typeof raw.selected_shipping_option === "object"
      ? (raw.selected_shipping_option as Record<string, unknown>)
      : {};

  const candidates: LookupCandidate[] = [];
  const add = (value: string | null, kind: LookupCandidate["kind"], unique: boolean) => {
    if (!value) return;
    if (candidates.some((c) => c.value === value && c.kind === kind)) return;
    candidates.push({ value, kind, unique });
  };

  add(order.labelTrackingNumber?.trim() || null, "identifier", true);
  // Exakt var Kustom lägger PostNords spårningsnummer när Kustom Shipping
  // Assistant bokat frakten är inte bekräftat - leta i alla fraktrelaterade
  // delar av ordern efter fält som ser ut som ett spårnings-/kollinummer.
  for (const value of collectTrackingValues([
    raw.shipping_info,
    raw.selected_shipping_option,
    raw.captures,
  ])) {
    add(value, "identifier", true);
  }

  const tmsReference = stringField(selected, "tms_reference");
  add(tmsReference, "identifier", true);
  add(tmsReference, "reference", true);
  add(order.kustomOrderId, "reference", true);
  add(stringField(raw, "klarna_reference"), "reference", true);
  add(stringField(raw, "merchant_reference1"), "reference", false);
  add(stringField(raw, "merchant_reference2"), "reference", false);
  add(`TRAN #${order.orderNumber}`, "reference", false);
  add(String(order.orderNumber), "reference", false);

  return candidates;
}

const TRACKING_KEY = /^(tracking_?(number|id|no)|shipment_?id|parcel_?(number|id)|item_?id|consignment_?(number|id))$/i;

function collectTrackingValues(roots: unknown[]): string[] {
  const found: string[] = [];
  const visit = (value: unknown, depth: number) => {
    if (depth > 5 || !value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry, depth + 1);
      return;
    }
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (TRACKING_KEY.test(key) && typeof entry === "string" && entry.trim()) {
        found.push(entry.trim());
      } else {
        visit(entry, depth + 1);
      }
    }
  };
  for (const root of roots) visit(root, 0);
  return found;
}

function normalizePostCode(value: string): string {
  return value.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
}

/** Om en hittad skickning får kopplas till ordern - se LookupCandidate.unique. */
export function acceptsMatch(
  candidate: LookupCandidate,
  consigneePostCode: string | null,
  orderPostCode: string | null,
): boolean {
  if (consigneePostCode && orderPostCode) {
    return normalizePostCode(consigneePostCode) === normalizePostCode(orderPostCode);
  }
  return candidate.unique;
}
