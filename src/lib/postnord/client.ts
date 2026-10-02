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
  /** Mottagarens postnummer enligt PostNord, om svaret innehåller det - används för att bekräfta att en automatiskt hittad skickning hör till rätt order. */
  consigneePostCode: string | null;
  items: PostnordTrackingItem[];
};

type RawShipment = {
  shipmentId: string;
  status: string;
  statusText: { header: string; body: string };
  deliveryDate?: string;
  consignee?: { address?: { postCode?: string } };
  items?: {
    itemId: string;
    status: string;
    statusText: { header: string; body: string };
    deliveryDate?: string;
    events: PostnordTrackingEvent[];
  }[];
};

type TrackAndTraceResponse = {
  TrackingInformationResponse?: {
    compositeFault?: {
      faults: { faultCode: string; explanationText: string }[];
    };
    shipments?: RawShipment[];
  };
};

function toShipmentTracking(shipment: RawShipment): PostnordShipmentTracking {
  return {
    shipmentId: shipment.shipmentId,
    status: shipment.status,
    statusText: shipment.statusText,
    deliveryDate: shipment.deliveryDate ?? null,
    consigneePostCode: shipment.consignee?.address?.postCode ?? null,
    items: (shipment.items ?? []).map((item) => ({
      itemId: item.itemId,
      status: item.status,
      statusText: item.statusText,
      deliveryDate: item.deliveryDate ?? null,
      events: item.events,
    })),
  };
}

type TrackAndTraceResult = {
  shipments: RawShipment[];
  /** PostNords förklaring när inget hittades (compositeFault), t.ex. "Not found". */
  fault: string | null;
};

async function getTrackAndTrace(url: string): Promise<TrackAndTraceResult> {
  let response: Response;
  try {
    response = await fetch(url, {
      next: { revalidate: 300 },
      // Den automatiska synken (postnord-auto-sync.ts) körs bl.a. medan
      // orderdetaljen renderas - ett hängande PostNord-anrop får inte
      // hänga sidan.
      signal: AbortSignal.timeout(6000),
    });
  } catch (err) {
    throw new PostnordApiError(
      err instanceof Error ? err.message : "Kunde inte nå PostNords API.",
    );
  }

  if (!response.ok) {
    throw new PostnordApiError(`PostNord svarade med fel (${response.status}).`, response.status);
  }

  const data = (await response.json()) as TrackAndTraceResponse;
  // `?? []` snarare än att anta att fältet alltid finns - findByReference
  // bekräftades bara med ett 403-exempel (fel auth i PostNords egen
  // dokumentation), aldrig ett lyckat svar, så vi litar inte blint på att
  // svarsformen är identisk med findByIdentifier.
  const faults = data.TrackingInformationResponse?.compositeFault?.faults ?? [];
  return {
    shipments: data.TrackingInformationResponse?.shipments ?? [],
    fault:
      faults
        .map((f) => f.explanationText || f.faultCode)
        .filter(Boolean)
        .join("; ") || null,
  };
}

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
  const { shipments } = await lookupPostnordShipments("identifier", trackingId, locale);
  return shipments[0] ?? null;
}

/**
 * Söker upp skickningar via ER EGEN referens (t.ex. det ni skrev i
 * PostNords portal när en fraktsedel skapades) i stället för
 * spårningsnumret - för skickningar där vi inte redan har fått
 * spårningsnumret inmatat hos oss. Samma läsning-bara-princip som
 * `trackPostnordShipment`. Returnerar en tom lista (INTE ett fel) om
 * referensen inte matchar något, t.ex. om referensen aldrig skrevs in
 * vid bokningstillfället.
 *
 * `customerNumber` är ert PostNord-kundnummer (POSTNORD_CUSTOMER_NUMBER)
 * - ett separat fält som API:et kräver utöver apikey, se
 * README "PostNord-fraktstatus".
 */
export async function findPostnordShipmentsByReference(
  referenceValue: string,
  locale: "sv" | "en" = "sv",
): Promise<PostnordShipmentTracking[]> {
  return (await lookupPostnordShipments("reference", referenceValue, locale)).shipments;
}

export type PostnordLookupResult = {
  shipments: PostnordShipmentTracking[];
  fault: string | null;
};

/**
 * Samma uppslag som trackPostnordShipment/findPostnordShipmentsByReference,
 * men med PostNords egen förklaring när inget hittades - för den
 * automatiska kopplingen, så orderdetaljen kan visa VAD PostNord svarade
 * på varje sökning (se postnord-auto-sync.ts).
 */
export async function lookupPostnordShipments(
  kind: "identifier" | "reference",
  value: string,
  locale: "sv" | "en" = "sv",
): Promise<PostnordLookupResult> {
  if (kind === "identifier") {
    const apiKey = process.env.POSTNORD_API_KEY;
    if (!apiKey) {
      throw new PostnordApiError("POSTNORD_API_KEY saknas.");
    }
    const url = `${POSTNORD_HOST}/rest/shipment/v5/trackandtrace/findByIdentifier.json?apikey=${encodeURIComponent(apiKey)}&id=${encodeURIComponent(value)}&locale=${locale}`;
    const { shipments, fault } = await getTrackAndTrace(url);
    return { shipments: shipments.slice(0, 1).map(toShipmentTracking), fault };
  }

  const apiKey = process.env.POSTNORD_API_KEY;
  const customerNumber = process.env.POSTNORD_CUSTOMER_NUMBER;
  if (!apiKey) {
    throw new PostnordApiError("POSTNORD_API_KEY saknas.");
  }
  if (!customerNumber) {
    throw new PostnordApiError("POSTNORD_CUSTOMER_NUMBER saknas.");
  }

  const url = `${POSTNORD_HOST}/rest/shipment/v5/trackandtrace/findByReference.json?apikey=${encodeURIComponent(apiKey)}&customerNumber=${encodeURIComponent(customerNumber)}&referenceValue=${encodeURIComponent(value)}&locale=${locale}`;
  const { shipments, fault } = await getTrackAndTrace(url);
  return { shipments: shipments.map(toShipmentTracking), fault };
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
