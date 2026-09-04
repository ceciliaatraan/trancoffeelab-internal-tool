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
      <div className="flex items-center justify-between border-b border-tran-black pb-6">
        <h1 className="text-4xl font-bold uppercase tracking-tight">Produkter</h1>
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
        <div className="grid grid-cols-1 border-t border-l border-tran-hairline-strong sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {products.map((product) => {
            const image = product.images[0];
            return (
              <Link
                key={product.id}
                href={`/products/${product.id}`}
                className="group flex flex-col border-r border-b border-tran-hairline-strong transition-colors hover:bg-tran-hairline/5"
              >
                <div className="relative aspect-square overflow-hidden bg-tran-hairline/10">
                  {image ? (
                    // eslint-disable-next-line @next/next/no-img-element -- externa Supabase Storage-URL:er, inte lokala byggda tillgångar
                    <img
                      src={image}
                      alt={product.nameSv}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="tran-label flex h-full items-center justify-center text-center text-[11px] text-tran-faint">
                      Ingen bild
                    </div>
                  )}
                  <div className="absolute top-3 left-3">
                    <StatusChip status={product.status} />
                  </div>
                </div>
                <div className="flex flex-1 flex-col gap-1 p-4">
                  <h2 className="text-base font-bold uppercase leading-tight group-hover:text-tran-red">
                    {product.nameSv}
                  </h2>
                  <p className="tran-tabular text-xs text-tran-muted">{product.sku}</p>
                  <p className="tran-tabular mt-auto pt-3 text-base font-medium">
                    {formatOre(product.priceOre)}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
