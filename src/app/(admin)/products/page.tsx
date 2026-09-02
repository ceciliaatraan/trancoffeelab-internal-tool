import Link from "next/link";
import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import { formatOre } from "@/lib/format";
import { StatusChip } from "@/components/status-chip";

export default async function ProductsPage() {
  const products = await db
    .select()
    .from(schema.products)
    .orderBy(asc(schema.products.sortOrder), asc(schema.products.nameSv));

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-4xl">Produkter</h1>
        <Link
          href="/products/new"
          className="border border-tran-black bg-tran-black px-4 py-2 text-sm font-medium text-tran-white transition-colors hover:border-tran-red hover:bg-tran-red"
        >
          Ny produkt
        </Link>
      </div>

      {products.length === 0 ? (
        <div className="border border-tran-hairline p-12 text-center text-tran-muted">
          Inga produkter än.
        </div>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="tran-label border-b border-tran-hairline text-left text-xs text-tran-muted">
              <th className="py-3 pr-4 font-medium">Namn</th>
              <th className="py-3 pr-4 font-medium">SKU</th>
              <th className="py-3 pr-4 font-medium">Pris</th>
              <th className="py-3 pr-4 font-medium">Moms</th>
              <th className="py-3 pr-4 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id} className="border-b border-tran-hairline">
                <td className="py-4 pr-4">
                  <Link
                    href={`/products/${product.id}`}
                    className="hover:text-tran-red"
                  >
                    {product.nameSv}
                  </Link>
                </td>
                <td className="tran-tabular py-4 pr-4 text-tran-muted">
                  {product.sku}
                </td>
                <td className="tran-tabular py-4 pr-4">
                  {formatOre(product.priceOre)}
                </td>
                <td className="tran-tabular py-4 pr-4 text-tran-muted">
                  {(product.taxRate / 100).toLocaleString("sv-SE")}%
                </td>
                <td className="py-4 pr-4">
                  <StatusChip status={product.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
