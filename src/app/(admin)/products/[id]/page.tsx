import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ProductForm } from "@/components/product-form";
import { StatusChip } from "@/components/status-chip";
import { formatOre } from "@/lib/format";
import {
  addProductImage,
  addVariant,
  deleteVariant,
  removeProductImage,
  setProductStatus,
  updateProduct,
  updateVariant,
} from "../actions";

const inputClass =
  "w-full border border-tran-hairline bg-tran-white px-2 py-1.5 text-sm focus:border-tran-black focus:outline-none";

export default async function EditProductPage({
  params,
  searchParams,
}: PageProps<"/products/[id]">) {
  const { id } = await params;
  const search = await searchParams;
  const error = typeof search.error === "string" ? search.error : null;
  const saved = "saved" in search;

  const [product] = await db
    .select()
    .from(schema.products)
    .where(eq(schema.products.id, id));

  if (!product) notFound();

  const variants = await db
    .select()
    .from(schema.productVariants)
    .where(eq(schema.productVariants.productId, id))
    .orderBy(asc(schema.productVariants.sortOrder));

  return (
    <div className="flex max-w-2xl flex-col gap-10">
      <div className="flex items-center gap-4">
        <Link href="/products" className="text-sm text-tran-muted hover:text-tran-red">
          ← Produkter
        </Link>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <h1 className="font-display text-4xl">{product.nameSv}</h1>
          <StatusChip status={product.status} />
        </div>
        <div className="flex gap-2">
          {(["draft", "published", "archived"] as const)
            .filter((status) => status !== product.status)
            .map((status) => (
              <form key={status} action={setProductStatus.bind(null, id, status)}>
                <button
                  type="submit"
                  className="tran-label border border-tran-black px-3 py-1.5 text-xs transition-colors hover:border-tran-red hover:text-tran-red"
                >
                  {status === "draft"
                    ? "Sätt som utkast"
                    : status === "published"
                      ? "Publicera"
                      : "Arkivera"}
                </button>
              </form>
            ))}
        </div>
      </div>

      {error ? (
        <p className="border border-tran-red px-4 py-3 text-sm text-tran-red">{error}</p>
      ) : null}
      {saved ? (
        <p className="border border-tran-hairline px-4 py-3 text-sm text-tran-muted">
          Sparat.
        </p>
      ) : null}

      <ProductForm
        action={updateProduct.bind(null, id)}
        values={product}
        submitLabel="Spara ändringar"
      />

      <section className="flex flex-col gap-4">
        <h2 className="tran-label text-xs text-tran-muted">Bilder</h2>
        {product.images.length > 0 ? (
          <div className="grid grid-cols-3 gap-4 sm:grid-cols-4">
            {product.images.map((url) => (
              <div key={url} className="flex flex-col gap-2">
                <div className="relative aspect-square border border-tran-hairline">
                  <Image src={url} alt="" fill className="object-cover" unoptimized />
                </div>
                <form action={removeProductImage.bind(null, id, url)}>
                  <button
                    type="submit"
                    className="tran-label text-[11px] text-tran-muted hover:text-tran-red"
                  >
                    Ta bort
                  </button>
                </form>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-tran-muted">Inga bilder uppladdade.</p>
        )}
        <form
          action={addProductImage.bind(null, id)}
          className="flex items-center gap-3"
        >
          <input type="file" name="image" accept="image/*" required className="text-sm" />
          <button
            type="submit"
            className="tran-label border border-tran-black px-3 py-1.5 text-xs transition-colors hover:border-tran-red hover:text-tran-red"
          >
            Ladda upp
          </button>
        </form>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="tran-label text-xs text-tran-muted">Varianter</h2>
        <p className="text-sm text-tran-muted">
          Valfritt — t.ex. phin-filter i liten/stor. Varje variant får en
          egen lagerrad.
        </p>

        {variants.length > 0 ? (
          <div className="flex flex-col gap-4">
            {variants.map((variant) => (
              <div key={variant.id} className="border border-tran-hairline p-4">
                <form
                  action={updateVariant.bind(null, id, variant.id)}
                  className="grid grid-cols-2 gap-3 sm:grid-cols-3"
                >
                  <input
                    name="nameSv"
                    defaultValue={variant.nameSv}
                    placeholder="Namn (sv)"
                    required
                    className={inputClass}
                  />
                  <input
                    name="nameEn"
                    defaultValue={variant.nameEn}
                    placeholder="Namn (en)"
                    required
                    className={inputClass}
                  />
                  <input
                    name="sku"
                    defaultValue={variant.sku}
                    placeholder="SKU"
                    required
                    className={inputClass}
                  />
                  <input
                    name="priceOre"
                    type="number"
                    min={0}
                    defaultValue={variant.priceOre}
                    placeholder="Pris (öre)"
                    required
                    className={inputClass}
                  />
                  <input
                    name="weightGrams"
                    type="number"
                    min={1}
                    defaultValue={variant.weightGrams}
                    placeholder="Vikt (g)"
                    required
                    className={inputClass}
                  />
                  <input
                    name="sortOrder"
                    type="number"
                    defaultValue={variant.sortOrder}
                    placeholder="Sortering"
                    className={inputClass}
                  />
                  <div className="col-span-2 flex items-center gap-4 sm:col-span-3">
                    <span className="tran-tabular text-xs text-tran-muted">
                      {formatOre(variant.priceOre)}
                    </span>
                    <button
                      type="submit"
                      className="tran-label text-[11px] hover:text-tran-red"
                    >
                      Spara variant
                    </button>
                  </div>
                </form>
                <form action={deleteVariant.bind(null, id, variant.id)} className="mt-2">
                  <button
                    type="submit"
                    className="tran-label text-[11px] text-tran-muted hover:text-tran-red"
                  >
                    Ta bort variant
                  </button>
                </form>
              </div>
            ))}
          </div>
        ) : null}

        <form
          action={addVariant.bind(null, id)}
          className="grid grid-cols-2 gap-3 border border-tran-hairline p-4 sm:grid-cols-3"
        >
          <input name="nameSv" placeholder="Namn (sv)" required className={inputClass} />
          <input name="nameEn" placeholder="Namn (en)" required className={inputClass} />
          <input name="sku" placeholder="SKU" required className={inputClass} />
          <input
            name="priceOre"
            type="number"
            min={0}
            placeholder="Pris (öre)"
            required
            className={inputClass}
          />
          <input
            name="weightGrams"
            type="number"
            min={1}
            placeholder="Vikt (g)"
            required
            className={inputClass}
          />
          <input name="sortOrder" type="number" placeholder="Sortering" className={inputClass} />
          <div className="col-span-2 sm:col-span-3">
            <button
              type="submit"
              className="tran-label border border-tran-black px-3 py-1.5 text-xs transition-colors hover:border-tran-red hover:text-tran-red"
            >
              Lägg till variant
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
