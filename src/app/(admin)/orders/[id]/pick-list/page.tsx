import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";

export default async function PickListPage({ params }: PageProps<"/orders/[id]/pick-list">) {
  const { id } = await params;
  const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, id));
  if (!order) notFound();

  const lines = await db
    .select()
    .from(schema.orderLines)
    .where(eq(schema.orderLines.orderId, id))
    .orderBy(asc(schema.orderLines.sortOrder));

  const physicalLines = lines.filter((line) => line.type === "physical");
  const address = order.shippingAddress as {
    given_name?: string;
    family_name?: string;
    street_address?: string;
    postal_code?: string;
    city?: string;
  } | null;

  return (
    <div className="mx-auto max-w-xl p-8 font-body text-tran-black">
      <h1 className="text-3xl font-bold uppercase tracking-tight">Plocklista — order #{order.orderNumber}</h1>
      {address ? (
        <p className="mt-2 text-sm text-tran-muted">
          {address.given_name} {address.family_name} — {address.street_address}, {address.postal_code}{" "}
          {address.city}
        </p>
      ) : null}

      <table className="mt-8 w-full border-collapse text-sm">
        <thead>
          <tr className="tran-label border-b border-tran-black text-left text-xs">
            <th className="py-2 pr-4 font-medium">Antal</th>
            <th className="py-2 pr-4 font-medium">SKU</th>
            <th className="py-2 pr-4 font-medium">Namn</th>
          </tr>
        </thead>
        <tbody>
          {physicalLines.map((line) => (
            <tr key={line.id} className="border-b border-tran-hairline">
              <td className="tran-tabular py-3 pr-4 text-lg">{line.quantity}</td>
              <td className="tran-tabular py-3 pr-4">{line.reference}</td>
              <td className="py-3 pr-4">{line.name}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
