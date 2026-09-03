import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { KustomOrderManagementOrder } from "@/lib/kustom/client";
import { resolveCartLine, type ResolvedCartLine } from "@/lib/queries/cart";

export type PersistedOrder = {
  id: string;
  orderNumber: number;
  alreadyExisted: boolean;
  /** True om NÅGON fysisk orderrad pekade på en produkt med is_preorder=true vid ordertillfället. */
  containsPreorder: boolean;
  /** Fysiska rader, för orderbekräftelsemailet — annat innehåll för preorder- kontra lagerrader. */
  physicalLines: {
    name: string;
    quantity: number;
    isPreorder: boolean;
    expectedShipDate: string | null;
  }[];
};

function sumTaxAmount(order: KustomOrderManagementOrder): number {
  return order.order_lines.reduce((sum, line) => sum + (line.total_tax_amount ?? 0), 0);
}

/**
 * Sparar en order från Kustom FÖRSTA gången den ses — idempotent på
 * kustom_order_id (INSERT ... ON CONFLICT DO NOTHING, sedan en läsning
 * om raden redan fanns). Reserverar lager och sparar orderrader bara om
 * det verkligen var första gången. Anropas från push-hanteraren, ALDRIG
 * med data från push-bodyn direkt — bara med det som lästs från Kustom
 * via getOrderManagementOrder.
 *
 * `changeAmount` i inventory_movements tolkas olika beroende på `reason`
 * (eget designbeslut, inte hämtat från Kustom): för order_reserved/
 * order_released ändras `reservedQuantity`, för manual_adjustment/return/
 * order_shipped ändras `quantity`. En order_shipped-rad (fas 4)
 * representerar BÅDA (fysiskt lager minskar och reservationen släpps
 * med samma belopp).
 */
export async function persistOrderFromKustom(
  order: KustomOrderManagementOrder,
): Promise<PersistedOrder> {
  return db.transaction(async (tx) => {
    const customerEmail = order.billing_address?.email;
    let customerId: string | null = null;

    if (customerEmail) {
      const [customer] = await tx
        .insert(schema.customers)
        .values({
          email: customerEmail,
          firstName: order.billing_address?.given_name,
          lastName: order.billing_address?.family_name,
          phone: order.billing_address?.phone,
          defaultShippingAddress: order.shipping_address ?? null,
          defaultBillingAddress: order.billing_address ?? null,
        })
        .onConflictDoUpdate({
          target: schema.customers.email,
          set: {
            firstName: order.billing_address?.given_name,
            lastName: order.billing_address?.family_name,
            phone: order.billing_address?.phone,
            updatedAt: new Date(),
          },
        })
        .returning({ id: schema.customers.id });
      customerId = customer.id;
    }

    const orderTaxAmountOre = sumTaxAmount(order);
    const isFinal = order.status !== "CANCELLED" && order.status !== "EXPIRED";

    /**
     * Slås upp INNAN orders-raden skapas så `containsPreorder` kan sättas
     * redan vid insert (ingen extra UPDATE efteråt), och återanvänds i
     * loopen nedan så varje orderrad bara slår upp sin produkt en gång.
     */
    const physicalLineResolutions: (ResolvedCartLine | null)[] = await Promise.all(
      order.order_lines.map((line) =>
        line.type === "physical" && line.reference ? resolveCartLine(line.reference) : Promise.resolve(null),
      ),
    );
    const containsPreorder = physicalLineResolutions.some((resolved) => resolved?.isPreorder === true);
    const physicalLines = order.order_lines
      .map((line, index) => ({ line, resolved: physicalLineResolutions[index] }))
      .filter(({ line }) => (line.type ?? "physical") === "physical")
      .map(({ line, resolved }) => ({
        name: line.name,
        quantity: line.quantity,
        isPreorder: resolved?.isPreorder ?? false,
        expectedShipDate: resolved?.expectedShipDate ?? null,
      }));

    const [inserted] = await tx
      .insert(schema.orders)
      .values({
        kustomOrderId: order.order_id,
        customerId,
        customerEmail: customerEmail ?? "okand@example.com",
        status: order.status,
        paymentStatus: order.status,
        purchaseCountry: order.purchase_country.toUpperCase(),
        currency: order.purchase_currency.toUpperCase(),
        locale: order.locale,
        orderAmountOre: order.order_amount,
        orderTaxAmountOre,
        containsPreorder,
        shippingAddress: order.shipping_address ?? null,
        billingAddress: order.billing_address ?? null,
        rawKustomOrder: order,
        paidAt: isFinal ? new Date() : null,
      })
      .onConflictDoNothing({ target: schema.orders.kustomOrderId })
      .returning({ id: schema.orders.id, orderNumber: schema.orders.orderNumber });

    if (!inserted) {
      const [existing] = await tx
        .select({
          id: schema.orders.id,
          orderNumber: schema.orders.orderNumber,
          containsPreorder: schema.orders.containsPreorder,
        })
        .from(schema.orders)
        .where(eq(schema.orders.kustomOrderId, order.order_id));
      return {
        id: existing.id,
        orderNumber: existing.orderNumber,
        alreadyExisted: true,
        containsPreorder: existing.containsPreorder,
        physicalLines: [],
      };
    }

    for (const [index, line] of order.order_lines.entries()) {
      const resolved = physicalLineResolutions[index];

      await tx.insert(schema.orderLines).values({
        orderId: inserted.id,
        productId: resolved?.productId ?? null,
        type: line.type ?? "physical",
        reference: line.reference ?? "",
        name: line.name,
        quantity: line.quantity,
        quantityUnit: line.quantity_unit ?? "st",
        unitPriceOre: line.unit_price,
        taxRate: line.tax_rate ?? 0,
        totalAmountOre: line.total_amount,
        totalDiscountAmountOre: line.total_discount_amount ?? 0,
        totalTaxAmountOre: line.total_tax_amount ?? 0,
      });

      if (resolved && isFinal) {
        const condition = resolved.variantId
          ? and(
              eq(schema.inventory.productId, resolved.productId),
              eq(schema.inventory.variantId, resolved.variantId),
            )
          : and(
              eq(schema.inventory.productId, resolved.productId),
              isNull(schema.inventory.variantId),
            );

        const [inventoryRow] = await tx
          .select({ id: schema.inventory.id })
          .from(schema.inventory)
          .where(condition);

        if (inventoryRow) {
          await tx
            .update(schema.inventory)
            .set({
              reservedQuantity: sql`${schema.inventory.reservedQuantity} + ${line.quantity}`,
              updatedAt: new Date(),
            })
            .where(eq(schema.inventory.id, inventoryRow.id));

          await tx.insert(schema.inventoryMovements).values({
            inventoryId: inventoryRow.id,
            changeAmount: line.quantity,
            reason: "order_reserved",
            orderId: inserted.id,
            note: "Reserverat vid orderbekräftelse från Kustom",
          });
        }
      }

      if (line.type === "discount" && line.reference) {
        await tx
          .update(schema.discountCodes)
          .set({ usedCount: sql`${schema.discountCodes.usedCount} + 1`, updatedAt: new Date() })
          .where(eq(schema.discountCodes.code, line.reference.toUpperCase()));
      }
    }

    return {
      id: inserted.id,
      orderNumber: inserted.orderNumber,
      alreadyExisted: false,
      containsPreorder,
      physicalLines,
    };
  });
}
