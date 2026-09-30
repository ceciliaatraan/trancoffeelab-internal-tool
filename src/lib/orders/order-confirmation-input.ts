import "server-only";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { OrderConfirmationEmailInput } from "@/lib/email/order-confirmation";
import { resolveCartLine } from "@/lib/queries/cart";

/**
 * Bygger orderbekräftelsemejlets innehåll för en redan sparad order, ur
 * vår egen databas - samma fält som process-kustom-order.ts skickar in när
 * ordern kommer in (orderrader med produktbild/länk, frakt, företags-
 * uppgifter). Produktinfo (bild, slug, förbeställning) slås upp som den ser
 * ut NU, inte som vid ordertillfället. Returnerar null om ordern saknas.
 */
export async function buildOrderConfirmationInputFromDb(
  orderId: string,
  to: string,
): Promise<OrderConfirmationEmailInput | null> {
  const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
  if (!order) return null;

  const lines = await db
    .select()
    .from(schema.orderLines)
    .where(eq(schema.orderLines.orderId, orderId))
    .orderBy(asc(schema.orderLines.sortOrder));

  const physicalLines = await Promise.all(
    lines
      .filter((line) => line.type === "physical")
      .map(async (line) => {
        const resolved = line.reference
          ? await resolveCartLine(line.reference, { requirePublished: false })
          : null;
        return {
          name: line.name,
          quantity: line.quantity,
          isPreorder: resolved?.isPreorder ?? false,
          expectedShipDate: resolved?.expectedShipDate ?? null,
          imageUrl: resolved?.imageUrl ?? null,
          lineTotalOre: line.totalAmountOre,
          slug: resolved?.slug ?? null,
        };
      }),
  );

  const shippingLine = lines.find((line) => line.type === "shipping_fee");

  return {
    to,
    locale: order.locale,
    orderNumber: order.orderNumber,
    totalOre: order.orderAmountOre,
    lines: physicalLines,
    shipping: shippingLine ? { name: shippingLine.name, amountOre: shippingLine.totalAmountOre } : null,
    business: order.businessName
      ? { name: order.businessName, vatNumber: order.businessVatNumber ?? "" }
      : null,
  };
}
