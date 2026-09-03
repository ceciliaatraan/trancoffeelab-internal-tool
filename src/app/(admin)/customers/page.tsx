import { desc, eq, ilike, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { formatOre } from "@/lib/format";

export default async function CustomersPage({ searchParams }: PageProps<"/customers">) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.trim() : "";

  const customers = await db
    .select({
      id: schema.customers.id,
      email: schema.customers.email,
      firstName: schema.customers.firstName,
      lastName: schema.customers.lastName,
      marketingConsent: schema.customers.marketingConsent,
      orderCount: sql<number>`count(${schema.orders.id})`,
      totalSpentOre: sql<number>`coalesce(sum(${schema.orders.orderAmountOre}), 0)`,
    })
    .from(schema.customers)
    .leftJoin(schema.orders, eq(schema.orders.customerId, schema.customers.id))
    .where(query ? ilike(schema.customers.email, `%${query}%`) : undefined)
    .groupBy(schema.customers.id)
    .orderBy(desc(schema.customers.createdAt))
    .limit(100);

  return (
    <div className="flex flex-col gap-8">
      <h1 className="font-display text-4xl">Kunder</h1>

      <form className="flex items-end gap-4">
        <div>
          <label className="tran-label mb-1.5 block text-xs text-tran-muted" htmlFor="q">
            Sök e-post
          </label>
          <input
            id="q"
            name="q"
            defaultValue={query}
            className="w-64 border border-tran-hairline bg-tran-white px-3 py-2 text-sm focus:border-tran-black focus:outline-none"
          />
        </div>
        <button
          type="submit"
          className="border border-tran-black px-4 py-2 text-sm font-medium transition-colors hover:border-tran-red hover:text-tran-red"
        >
          Sök
        </button>
      </form>

      {customers.length === 0 ? (
        <div className="border border-tran-hairline p-12 text-center text-tran-muted">
          Inga kunder än.
        </div>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="tran-label border-b border-tran-hairline text-left text-xs text-tran-muted">
              <th className="py-3 pr-4 font-medium">Namn</th>
              <th className="py-3 pr-4 font-medium">E-post</th>
              <th className="py-3 pr-4 font-medium">Ordrar</th>
              <th className="py-3 pr-4 font-medium">Totalt köpt</th>
              <th className="py-3 pr-4 font-medium">Nyhetsbrev</th>
              <th className="py-3 pr-4 font-medium">GDPR</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((customer) => (
              <tr key={customer.id} className="border-b border-tran-hairline">
                <td className="py-4 pr-4">
                  {customer.firstName} {customer.lastName}
                </td>
                <td className="py-4 pr-4 text-tran-muted">{customer.email}</td>
                <td className="tran-tabular py-4 pr-4">{customer.orderCount}</td>
                <td className="tran-tabular py-4 pr-4">{formatOre(customer.totalSpentOre)}</td>
                <td className="py-4 pr-4 text-tran-muted">
                  {customer.marketingConsent ? "Ja" : "Nej"}
                </td>
                <td className="py-4 pr-4">
                  <a
                    href={`/api/customers/${customer.id}/export`}
                    className="tran-label text-[11px] text-tran-muted hover:text-tran-red"
                  >
                    Exportera
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
