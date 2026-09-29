import "server-only";
import { after } from "next/server";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import {
  PostnordApiError,
  findPostnordShipmentsByReference,
  trackPostnordShipment,
  type PostnordShipmentTracking,
} from "@/lib/postnord/client";
import { markOrderShipped } from "@/lib/orders/mark-shipped";
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
const FULL_RUN_INTERVAL_MS = 24 * 60 * 60 * 1000;
const CONCURRENCY = 4;

async function lookup(candidate: LookupCandidate): Promise<PostnordShipmentTracking[]> {
  try {
    if (candidate.kind === "identifier") {
      const result = await trackPostnordShipment(candidate.value, "sv");
      return result ? [result] : [];
    }
    return await findPostnordShipmentsByReference(candidate.value, "sv");
  } catch (err) {
    // Ett enskilt misslyckat uppslag (fel format, saknat kundnummer,
    // PostNord nere, timeout - getTrackAndTrace gör om alla nätverksfel
    // till PostnordApiError) ska aldrig stoppa resten av synken.
    if (err instanceof PostnordApiError) return [];
    throw err;
  }
}

async function findShipmentForOrder(order: OpenOrder): Promise<PostnordShipmentTracking | null> {
  const orderPostCode =
    (order.shippingAddress as { postal_code?: string } | null)?.postal_code ?? null;
  const candidates = postnordLookupCandidates(order);

  // Parallellt, så en order kostar ungefär ETT PostNord-anrops väntetid
  // (viktigt när det körs medan orderdetaljen renderas). Kandidaterna är
  // i prioritetsordning - den första med en godkänd träff vinner.
  const results = await Promise.all(candidates.map(lookup));
  for (const [index, shipments] of results.entries()) {
    const match = shipments.find((shipment) =>
      acceptsMatch(candidates[index], shipment.consigneePostCode, orderPostCode),
    );
    if (match) return match;
  }
  return null;
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
  if (!process.env.POSTNORD_API_KEY) return "unchanged";
  if (order.fulfillmentStatus !== "unfulfilled" && order.fulfillmentStatus !== "label_created") {
    return "unchanged";
  }

  const shipment = await findShipmentForOrder(order);
  if (!shipment) return "not_found";

  if (isHandedOverToPostnord(shipment)) {
    const shipped = await markOrderShipped(order.id, "PostNord", shipment.shipmentId);
    return shipped ? "shipped" : "unchanged";
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
let lastFullPostnordRun = 0;

/**
 * Startar bakgrundssynken (efter att sidan skickats) när orderlistan eller
 * startsidan öppnas:
 * - Kustom: läser om alla ej färdigdebiterade ordrar (så debiteringar/
 *   annulleringar gjorda i Kustoms portal syns hos oss) - högst varannan
 *   minut, oberoende av PostNord (refreshUnsettledOrdersFromKustomIfDue;
 *   orderlistan har redan väntat in den själv innan den visades).
 * - PostNord: kopplar öppna ordrar till sina skickningar - högst var 10:e
 *   minut, så sidvisningar inte bränner PostNords anropskvot. Vanligtvis de
 *   senaste 30 dagarnas ordrar; högst en gång per dygn (och första gången
 *   efter varje deploy) ALLA öppna ordrar oavsett ålder.
 * Komplement till den dagliga Vercel Cron-körningen (api/cron/postnord-sync).
 */
export function scheduleBackgroundSync(): void {
  const now = Date.now();
  const runPostnord = Boolean(process.env.POSTNORD_API_KEY) && now - lastPostnordRun >= THROTTLE_MS;
  let full = false;
  if (runPostnord) {
    lastPostnordRun = now;
    full = now - lastFullPostnordRun >= FULL_RUN_INTERVAL_MS;
    if (full) lastFullPostnordRun = now;
  }

  after(async () => {
    await refreshUnsettledOrdersFromKustomIfDue();
    if (runPostnord) {
      try {
        await syncPostnordForOpenOrders({ maxAgeDays: full ? null : RECENT_DAYS });
      } catch (err) {
        console.error("PostNord-synk i bakgrunden misslyckades", err);
      }
    }
  });
}
