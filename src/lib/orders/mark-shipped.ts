import "server-only";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { expandLineToInventoryTargets } from "@/lib/inventory/bundles";
import { resolveCartLine } from "@/lib/queries/cart";

/**
 * Markerar en order som skickad: skapar en `shipments`-rad, sätter
 * fulfillment_status = shipped och flyttar lagret från reserverat till
 * skickat. Delad av "Markera som skickad"-knappen och den automatiska
 * PostNord-synken (postnord-auto-sync.ts).
 *
 * Statusbytet görs villkorat (bara från unfulfilled/label_created) INNE i
 * transaktionen, så två samtidiga anrop - t.ex. synken och en admin som
 * klickar samtidigt - aldrig kan skicka samma order två gånger och dra av
 * lagret dubbelt. Returnerar false om ordern redan var skickad/avbruten.
 */
export async function markOrderShipped(
  orderId: string,
  carrier: string,
  trackingNumber: string,
): Promise<boolean> {
  const lines = await db
    .select()
    .from(schema.orderLines)
    .where(eq(schema.orderLines.orderId, orderId));

  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(schema.orders)
      .set({ fulfillmentStatus: "shipped", updatedAt: new Date() })
      .where(
        and(
          eq(schema.orders.id, orderId),
          inArray(schema.orders.fulfillmentStatus, ["unfulfilled", "label_created"]),
        ),
      )
      .returning({ id: schema.orders.id });
    if (!updated) return false;

    await tx.insert(schema.shipments).values({ orderId, carrier, trackingNumber });

    for (const line of lines) {
      if (line.type !== "physical" || !line.reference) continue;
      const resolved = await resolveCartLine(line.reference, { requirePublished: false });
      if (!resolved) continue;

      const targets = await expandLineToInventoryTargets(
        tx,
        resolved.productId,
        resolved.variantId,
        line.quantity,
        line.id,
      );

      for (const target of targets) {
        const condition = target.variantId
          ? and(
              eq(schema.inventory.productId, target.productId),
              eq(schema.inventory.variantId, target.variantId),
            )
          : and(
              eq(schema.inventory.productId, target.productId),
              isNull(schema.inventory.variantId),
            );

        const [inventoryRow] = await tx
          .select({ id: schema.inventory.id })
          .from(schema.inventory)
          .where(condition);

        if (!inventoryRow) continue;

        // "I lager" (quantity) rörs INTE vid leverans - den är
        // ursprungslager, satt bara av admin (se schema/catalog.ts).
        // Reservationen släpps och skickat-räknaren ökar i stället, så
        // "Tillgängligt"/kassans lagerkoll (quantity - reserverat -
        // skickat) blir rätt automatiskt.
        await tx
          .update(schema.inventory)
          .set({
            reservedQuantity: sql`${schema.inventory.reservedQuantity} - ${target.quantity}`,
            shippedQuantity: sql`${schema.inventory.shippedQuantity} + ${target.quantity}`,
            updatedAt: new Date(),
          })
          .where(eq(schema.inventory.id, inventoryRow.id));

        await tx.insert(schema.inventoryMovements).values({
          inventoryId: inventoryRow.id,
          changeAmount: target.quantity,
          reason: "order_shipped",
          orderId,
          note:
            target.productId === resolved.productId
              ? `Skickad: ${carrier} ${trackingNumber}`
              : `Skickad: ${carrier} ${trackingNumber} (komponent i "${resolved.nameSv}")`,
        });
      }
    }

    return true;
  });
}
