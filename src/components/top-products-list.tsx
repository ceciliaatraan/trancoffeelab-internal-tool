import type { TopProduct } from "@/lib/dashboard/stats";
import { formatOre } from "@/lib/format";

/** Horisontella stapelrader byggda med vanliga divs (inte SVG) - proportionerna kräver ingen viewBox-matematik här. */
export function TopProductsList({ products }: { products: TopProduct[] }) {
  if (products.length === 0) {
    return <p className="text-sm text-tran-muted">Inga sålda produkter i perioden.</p>;
  }

  const max = Math.max(...products.map((p) => p.quantity));

  return (
    <ul className="flex flex-col gap-3">
      {products.map((product) => (
        <li key={`${product.productId ?? "unknown"}-${product.name}`} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-4 text-sm">
            <span className="truncate">{product.name}</span>
            <span className="tran-tabular shrink-0 text-tran-muted">
              {product.quantity} st · {formatOre(product.revenueOre)}
            </span>
          </div>
          <div className="h-1.5 w-full bg-tran-hairline">
            <div
              className="h-1.5 bg-tran-black"
              style={{ width: `${Math.max(4, (product.quantity / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
