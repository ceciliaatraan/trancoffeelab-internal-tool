import "server-only";

const POSTNORD_HOST = process.env.POSTNORD_API_HOST || "https://api2.postnord.com";

export class PostnordApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

export type PostnordTrackingEvent = {
  eventTime: string;
  eventCode: string;
  status: string;
  eventDescription: string;
  location?: { displayName?: string; city?: string; country?: string };
};

export type PostnordTrackingItem = {
  itemId: string;
  status: string;
  statusText: { header: string; body: string };
  deliveryDate: string | null;
  events: PostnordTrackingEvent[];
};

export type PostnordShipmentTracking = {
  shipmentId: string;
  status: string;
  statusText: { header: string; body: string };
  deliveryDate: string | null;
  items: PostnordTrackingItem[];
};

type FindByIdentifierResponse = {
  TrackingInformationResponse: {
    compositeFault?: {
      faults: { faultCode: string; explanationText: string }[];
    };
    shipments: {
      shipmentId: string;
      status: string;
      statusText: { header: string; body: string };
      deliveryDate?: string;
      items: {
        itemId: string;
        status: string;
        statusText: { header: string; body: string };
        deliveryDate?: string;
        events: PostnordTrackingEvent[];
      }[];
    }[];
  };
};

/**
 * Slår upp fraktstatus för ett spårningsnummer via PostNords Track &
 * Trace-API (GET, läser bara - bokar/ändrar aldrig något). Returnerar
 * null om PostNord inte känner igen numret (t.ex. inte ett riktigt
 * PostNord-spårningsnummer, eller ordern finns ännu inte i deras
 * system) - INTE ett fel, bara "ingen status att visa än".
 *
 * `revalidate: 300` (5 min) - PostNords API har en rate limit per
 * nyckel, och orderdetaljen skulle annars anropa detta vid VARJE
 * sidladdning.
 */
export async function trackPostnordShipment(
  trackingId: string,
  locale: "sv" | "en" = "sv",
): Promise<PostnordShipmentTracking | null> {
  const apiKey = process.env.POSTNORD_API_KEY;
  if (!apiKey) {
    throw new PostnordApiError("POSTNORD_API_KEY saknas.");
  }

  const url = `${POSTNORD_HOST}/rest/shipment/v5/trackandtrace/findByIdentifier.json?apikey=${encodeURIComponent(apiKey)}&id=${encodeURIComponent(trackingId)}&locale=${locale}`;

  let response: Response;
  try {
    response = await fetch(url, { next: { revalidate: 300 } });
  } catch (err) {
    throw new PostnordApiError(
      err instanceof Error ? err.message : "Kunde inte nå PostNords API.",
    );
  }

  if (!response.ok) {
    throw new PostnordApiError(`PostNord svarade med fel (${response.status}).`, response.status);
  }

  const data = (await response.json()) as FindByIdentifierResponse;
  const shipment = data.TrackingInformationResponse.shipments[0];
  if (!shipment) return null;

  return {
    shipmentId: shipment.shipmentId,
    status: shipment.status,
    statusText: shipment.statusText,
    deliveryDate: shipment.deliveryDate ?? null,
    items: shipment.items.map((item) => ({
      itemId: item.itemId,
      status: item.status,
      statusText: item.statusText,
      deliveryDate: item.deliveryDate ?? null,
      events: item.events,
    })),
  };
}

/**
 * Korta, svenska etiketter för PostNords `status`-fält - bara de värden
 * som faktiskt observerats i ett riktigt svar (DELIVERED/EN_ROUTE/OTHER,
 * se README/docs/kustom.md) har en översättning. Okända värden visas
 * som de är i stället för en gissad översättning.
 */
const SHORT_STATUS_LABELS: Record<string, string> = {
  DELIVERED: "Levererad",
  EN_ROUTE: "Under transport",
  OTHER: "Info",
};

export function shortPostnordStatusLabel(status: string): string {
  return SHORT_STATUS_LABELS[status] ?? status;
}
