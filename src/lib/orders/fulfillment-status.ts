import { shortPostnordStatusLabel } from "@/lib/postnord/client";

export type FraktStatusKind = "ej_skickad" | "under_transport" | "levererad" | "avbruten";

export type FraktStatus = { kind: FraktStatusKind; label: string };

/**
 * Räknar ut vad "Frakt"-kolumnen/badgen ska visa - både text och
 * färgkategori - så orderlistan och orderdetaljen aldrig kan visa olika
 * saker för samma order. "Levererad för hand" (carrier från
 * markShippedAction) räknas alltid som levererad direkt, utan att fråga
 * PostNord (det finns inget spårningsnummer att slå upp).
 */
export function resolveFraktStatus(
  fulfillmentStatus: string,
  latestShipmentCarrier: string | null,
  postnordStatus: string | null,
): FraktStatus {
  if (fulfillmentStatus === "cancelled") {
    return { kind: "avbruten", label: "Avbruten" };
  }
  if (fulfillmentStatus !== "shipped") {
    return { kind: "ej_skickad", label: "Ej skickad" };
  }
  if (latestShipmentCarrier === "Levererad för hand") {
    return { kind: "levererad", label: "Levererad" };
  }
  if (postnordStatus === "DELIVERED") {
    return { kind: "levererad", label: "Levererad" };
  }
  if (postnordStatus) {
    return { kind: "under_transport", label: shortPostnordStatusLabel(postnordStatus) };
  }
  return { kind: "under_transport", label: "Skickad" };
}
