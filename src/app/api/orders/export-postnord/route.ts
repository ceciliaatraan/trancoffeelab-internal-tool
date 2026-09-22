import { NextResponse } from "next/server";
import { and, eq, isNotNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireCurrentAdmin } from "@/lib/current-admin";
import {
  buildPostnordExportCsv,
  type PostnordExportShippingAddress,
} from "@/lib/orders/postnord-export";

/**
 * Exporterar oskickade (fulfillment_status = unfulfilled), riktiga
 * (is_test = false), betalda (paid_at satt) ordrar i PostNords eget
 * adressimport-format - för att kunna massimportera redan förbeställda
 * ordrar som såldes innan Kustom Shipping Assistant/PostNord-
 * integrationen var korrekt kopplad (se docs/kustom.md).
 */
export async function GET() {
  await requireCurrentAdmin();

  const orders = await db
    .select({
      orderNumber: schema.orders.orderNumber,
      customerEmail: schema.orders.customerEmail,
      shippingAddress: schema.orders.shippingAddress,
      businessName: schema.orders.businessName,
    })
    .from(schema.orders)
    .where(
      and(
        eq(schema.orders.fulfillmentStatus, "unfulfilled"),
        eq(schema.orders.isTest, false),
        isNotNull(schema.orders.paidAt),
      ),
    )
    .orderBy(schema.orders.orderNumber);

  const csv = buildPostnordExportCsv(
    orders.map((order) => ({
      orderNumber: order.orderNumber,
      customerEmail: order.customerEmail,
      shippingAddress: order.shippingAddress as PostnordExportShippingAddress | null,
      businessName: order.businessName,
    })),
  );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="postnord-adresser-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
