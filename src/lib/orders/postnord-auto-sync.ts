import "server-only";
import { after } from "next/server";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import {
  PostnordApiError,
  lookupPostnordShipments,
  type PostnordShipmentTracking,
} from "@/lib/postnord/client";
import { markOrderShipped } from "@/lib/orders/mark-shipped";
import {
  captureOrderOnShipment,
  captureShippedButUncapturedOrders,
} from "@/lib/orders/capture-on-shipment";
import {
  forEachConcurrently,
  refreshOrderFromKustom,
  refreshUnsettledOrdersFromKustomIfDue,
} from "@/lib/orders/kustom-refresh";
import {
  acceptsMatch,
  isHandedOverToPostnord,
  postnordLookupCandidates,
  type LookupCandidate,
} from "@/lib/orders/postnord-matching";

type OpenOrder = typeof schema.orders.$inferSelect;

export type PostnordSyncOutcome = "not_found" | "label_created" | "shipped" | "unchanged";

type SyncCounts = Record<PostnordSyncOutcome, number>;

const RECENT_DAYS = 30;
const THROTTLE_MS = 10 * 60 * 1000;
const CAPTURE_CATCH_UP_INTERVAL_MS = 10 * 60 * 1000;
const FULL_RUN_INTERVAL_MS = 24 * 60 * 60 * 1000;
const CONCURRENCY = 4;

/** Vad en enskild sökning hos PostNord gav - visas på orderdetaljen. */
export type PostnordLookupAttempt = {
  label: string;
  value: string;
  kind: LookupCandidate["kind"];
  result: "match" | "no_hit" | "postcode_mismatch" | "error";
  /** PostNords förklaring eller felmeddelandet, när det finns. */
  detail: string | null;
};

async function lookup(
  candidate: LookupCandidate,
): Promise<{ shipments: PostnordShipmentTracking[]; detail: string | null; failed: boolean }> {
  try {
    const { shipments, fault } = await lookupPostnordShipments(candidate.kind, candidate.value, "sv");
    return { shipments, detail: fault, failed: false };
  } catch (err) {
    // Ett enskilt misslyckat uppslag (fel format, saknat kundnummer,
    // PostNord nere, timeout - getTrackAndTrace gör om alla nätverksfel
    // till PostnordApiError) ska aldrig stoppa resten av synken.
    if (err instanceof PostnordApiError) return { shipments: [], detail: err.message, failed: true };
    throw err;
  }
}

async function findShipmentForOrder(
  order: OpenOrder,
): Promise<{ match: PostnordShipmentTracking | null; attempts: PostnordLookupAttempt[] }> {
  const orderPostCode =
    (order.shippingAddress as { postal_code?: string } | null)?.postal_code ?? null;
  const candidates = postnordLookupCandidates(order);

  // Parallellt, så en order kostar ungefär ETT PostNord-anrops väntetid
  // (viktigt när det körs medan orderdetaljen renderas). Kandidaterna är
  // i prioritetsordning - den första med en godkänd träff vinner.
  const results = await Promise.all(candidates.map(lookup));
  let match: PostnordShipmentTracking | null = null;
  const attempts = results.map(({ shipments, detail, failed }, index): PostnordLookupAttempt => {
    const candidate = candidates[index];
    const accepted = shipments.find((shipment) =>
      acceptsMatch(candidate, shipment.consigneePostCode, orderPostCode),
    );
    if (accepted && !match) match = accepted;
    return {
      label: candidate.label,
      value: candidate.value,
      kind: candidate.kind,
      result: failed
        ? "error"
        : accepted
          ? "match"
          : shipments.length > 0
            ? "postcode_mismatch"
            : "no_hit",
      detail: accepted ? accepted.shipmentId : detail,
    };
  });
  return { match, attempts };
}

/**
 * Kopplar EN öppen order till dess PostNord-skickning, om den går att
 * hitta: fraktsedel skapad hos PostNord → "Fraktsedel skapad" + spårnings-
 * nummer; paketet lämnat/på väg → "Skickad" (med lagerflytt, precis som
 * knappen). Läser bara från PostNord - skriver aldrig dit. Använder den
 * Kustom-data ordern har - läs om den med refreshOrderFromKustom först
 * (Kustom pushar inte när KSA/PostNord uppdaterar frakten).
 */
export async function syncPostnordForOrder(order: OpenOrder): Promise<PostnordSyncOutcome> {
  return (await syncPostnordForOrderWithReport(order)).outcome;
}

/**
 * Som syncPostnordForOrder, men returnerar också vad varje sökning hos
 * PostNord gav (`attempts`, null om ingen sökning gjordes) - orderdetaljen
 * visar det, så det syns VARFÖR en order inte kopplats.
 */
export async function syncPostnordForOrderWithReport(
  order: OpenOrder,
): Promise<{ outcome: PostnordSyncOutcome; attempts: PostnordLookupAttempt[] | null }> {
  if (!process.env.POSTNORD_API_KEY) return { outcome: "unchanged", attempts: null };
  if (order.fulfillmentStatus !== "unfulfilled" && order.fulfillmentStatus !== "label_created") {
    return { outcome: "unchanged", attempts: null };
  }

  const { match: shipment, attempts } = await findShipmentForOrder(order);
  return { outcome: await applyShipment(order, shipment), attempts };
}

async function applyShipment(
  order: OpenOrder,
  shipment: PostnordShipmentTracking | null,
): Promise<PostnordSyncOutcome> {
  if (!shipment) return "not_found";

  if (isHandedOverToPostnord(shipment)) {
    const shipped = await markOrderShipped(order.id, "PostNord", shipment.shipmentId);
    if (!shipped) return "unchanged";
    try {
      await captureOrderOnShipment(order.id);
    } catch (err) {
      // captureShippedButUncapturedOrders i bakgrundssynken försöker igen.
      console.error("Automatisk debitering misslyckades för order", order.orderNumber, err);
    }
    return "shipped";
  }

  if (
    order.fulfillmentStatus === "label_created" &&
    order.labelTrackingNumber === shipment.shipmentId
  ) {
    return "unchanged";
  }

  const [updated] = await db
    .update(schema.orders)
    .set({
      fulfillmentStatus: "label_created",
      labelTrackingNumber: shipment.shipmentId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.orders.id, order.id),
        inArray(schema.orders.fulfillmentStatus, ["unfulfilled", "label_created"]),
      ),
    )
    .returning({ id: schema.orders.id });
  return updated ? "label_created" : "unchanged";
}

/**
 * Kör synken för öppna (ej skickade/avbrutna) riktiga ordrar.
 * `maxAgeDays: null` = ALLA öppna ordrar oavsett ålder - t.ex. gamla
 * förbeställningar som skickats långt efter ordertillfället, eller ordrar
 * som skickades innan den automatiska kopplingen fanns.
 */
export async function syncPostnordForOpenOrders({
  maxAgeDays,
}: {
  maxAgeDays: number | null;
}): Promise<SyncCounts> {
  const counts: SyncCounts = {
    not_found: 0,
    label_created: 0,
    shipped: 0,
    unchanged: 0,
  };
  if (!process.env.POSTNORD_API_KEY) return counts;

  const conditions = [
    inArray(schema.orders.fulfillmentStatus, ["unfulfilled", "label_created"]),
    eq(schema.orders.isTest, false),
  ];
  if (maxAgeDays !== null) {
    conditions.push(
      gte(schema.orders.createdAt, new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000)),
    );
  }
  const openOrders = await db
    .select()
    .from(schema.orders)
    .where(and(...conditions))
    .orderBy(desc(schema.orders.createdAt));

  // Några ordrar i taget - en full genomgång av alla gamla ordrar ska
  // hinna klart inom funktionens tidsgräns, utan att skicka hundratals
  // PostNord-anrop på en gång.
  await forEachConcurrently(openOrders, CONCURRENCY, async (order) => {
    try {
      counts[await syncPostnordForOrder(await refreshOrderFromKustom(order))] += 1;
    } catch (err) {
      console.error("PostNord-synk misslyckades för order", order.orderNumber, err);
    }
  });

  return counts;
}

let lastPostnordRun = 0;
let lastCaptureCatchUpRun = 0;
let lastFullPostnordRun = 0;

/**
 * Startar bakgrundssynken (efter att sidan skickats) när orderlistan eller
 * startsidan öppnas:
 * - Kustom: läser om alla ej färdigdebiterade ordrar (så debiteringar/
 *   annulleringar gjorda i Kustoms portal syns hos oss) - högst varannan
 *   minut, oberoende av PostNord (refreshUnsettledOrdersFromKustomIfDue;
 *   orderlistan har redan väntat in den själv innan den visades).
 * - Debitering: debiterar skickade ordrar som ännu inte debiterats
 *   (captureShippedButUncapturedOrders) - högst var 10:e minut.
 * - PostNord: kopplar öppna ordrar till sina skickningar - högst var 10:e
 *   minut, så sidvisningar inte bränner PostNords anropskvot. Vanligtvis de
 *   senaste 30 dagarnas ordrar; högst en gång per dygn (och första gången
 *   efter varje deploy) ALLA öppna ordrar oavsett ålder.
 * Komplement till den dagliga Vercel Cron-körningen (api/cron/postnord-sync).
 */
export function scheduleBackgroundSync(): void {
  const now = Date.now();
  const runCaptureCatchUp = now - lastCaptureCatchUpRun >= CAPTURE_CATCH_UP_INTERVAL_MS;
  if (runCaptureCatchUp) lastCaptureCatchUpRun = now;
  const runPostnord = Boolean(process.env.POSTNORD_API_KEY) && now - lastPostnordRun >= THROTTLE_MS;
  let full = false;
  if (runPostnord) {
    lastPostnordRun = now;
    full = now - lastFullPostnordRun >= FULL_RUN_INTERVAL_MS;
    if (full) lastFullPostnordRun = now;
  }

  after(async () => {
    await refreshUnsettledOrdersFromKustomIfDue();
    if (runCaptureCatchUp) {
      try {
        await captureShippedButUncapturedOrders();
      } catch (err) {
        console.error("Automatisk debitering i bakgrunden misslyckades", err);
      }
    }
    if (runPostnord) {
      try {
        await syncPostnordForOpenOrders({ maxAgeDays: full ? null : RECENT_DAYS });
      } catch (err) {
        console.error("PostNord-synk i bakgrunden misslyckades", err);
      }
    }
  });
}
