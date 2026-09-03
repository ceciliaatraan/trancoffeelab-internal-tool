import { NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireCurrentAdmin } from "@/lib/current-admin";

/**
 * GDPR-export: all data vi har om en kund, som JSON-nedladdning.
 * Skyddad av proxy.ts (allt utom /api/public/* och /api/kustom/* kräver
 * inloggning) — requireCurrentAdmin här är ett extra, explicit skydd.
 */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/customers/[id]/export">,
) {
  await requireCurrentAdmin();
  const { id } = await params;

  const [customer] = await db.select().from(schema.customers).where(eq(schema.customers.id, id));
  if (!customer) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const orders = await db.select().from(schema.orders).where(eq(schema.orders.customerId, id));
  const orderIds = orders.map((order) => order.id);
  const orderLines =
    orderIds.length > 0
      ? await db.select().from(schema.orderLines).where(inArray(schema.orderLines.orderId, orderIds))
      : [];

  const exportData = {
    exported_at: new Date().toISOString(),
    customer,
    orders: orders.map((order) => ({
      ...order,
      lines: orderLines.filter((line) => line.orderId === order.id),
    })),
  };

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="gdpr-export-${customer.email}.json"`,
    },
  });
}
