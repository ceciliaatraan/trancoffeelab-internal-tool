import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { asc, eq, inArray, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { ProductForm } from "@/components/product-form";
import { StatusChip } from "@/components/status-chip";
import { formatOre } from "@/lib/format";
import { oreToKronorInput } from "@/lib/money-input";
import { computeBundleAvailability } from "@/lib/inventory/bundles";
import { SubmitButton } from "@/components/submit-button";
import {
  addBundleItem,
  addProductImage,
  addVariant,
  addVariantImage,
  deleteVariant,
  removeBundleItem,
  removeProductImage,
  removeVariantImage,
  setProductStatus,
  updateBundleItemQuantity,
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

  const bundleItems = await db
    .select({
      id: schema.productBundleItems.id,
      quantity: schema.productBundleItems.quantity,
      componentProductName: schema.products.nameSv,
      componentVariantName: schema.productVariants.nameSv,
    })
    .from(schema.productBundleItems)
    .innerJoin(
      schema.products,
      eq(schema.productBundleItems.componentProductId, schema.products.id),
    )
    .leftJoin(
      schema.productVariants,
      eq(schema.productBundleItems.componentVariantId, schema.productVariants.id),
    )
    .where(eq(schema.productBundleItems.bundleProductId, id))
    .orderBy(asc(schema.products.nameSv));

  const bundleAvailability =
    bundleItems.length > 0 ? await computeBundleAvailability(db, id) : null;

  const otherProducts = await db
    .select({ id: schema.products.id, nameSv: schema.products.nameSv, sku: schema.products.sku })
    .from(schema.products)
    .where(ne(schema.products.id, id))
    .orderBy(asc(schema.products.nameSv));

  const otherVariants =
    otherProducts.length > 0
      ? await db
          .select({
            id: schema.productVariants.id,
            productId: schema.productVariants.productId,
            nameSv: schema.productVariants.nameSv,
            sku: schema.productVariants.sku,
          })
          .from(schema.productVariants)
          .where(
            inArray(
              schema.productVariants.productId,
              otherProducts.map((p) => p.id),
            ),
          )
          .orderBy(asc(schema.productVariants.sortOrder))
      : [];

  const variantsByProductId = new Map<string, typeof otherVariants>();
  for (const variant of otherVariants) {
    const list = variantsByProductId.get(variant.productId) ?? [];
    list.push(variant);
    variantsByProductId.set(variant.productId, list);
  }
  const componentOptions = otherProducts.map((p) => ({
    ...p,
    variants: variantsByProductId.get(p.id) ?? [],
  }));

  return (
    <div className="flex max-w-2xl flex-col gap-10">
      <div className="flex items-center gap-4">
        <Link href="/products" className="text-sm text-tran-muted hover:text-tran-red">
          ← Produkter
        </Link>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <h1 className="text-4xl font-bold uppercase tracking-tight">{product.nameSv}</h1>
          <StatusChip status={product.status} />
        </div>
        <div className="flex gap-2">
          {(["draft", "published", "coming_soon", "archived"] as const)
            .filter((status) => status !== product.status)
            .map((status) => (
              <form key={status} action={setProductStatus.bind(null, id, status)}>
                <SubmitButton className="tran-label border border-tran-black px-3 py-1.5 text-xs transition-colors hover:border-tran-red hover:text-tran-red">
                  {status === "draft"
                    ? "Sätt som utkast"
                    : status === "published"
                      ? "Publicera"
                      : status === "coming_soon"
                        ? "Sätt som 'Kommer snart'"
                        : "Arkivera"}
                </SubmitButton>
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
                  <SubmitButton className="tran-label text-[11px] text-tran-muted hover:text-tran-red">
                    Ta bort
                  </SubmitButton>
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
          <SubmitButton className="tran-label border border-tran-black px-3 py-1.5 text-xs transition-colors hover:border-tran-red hover:text-tran-red">
            Ladda upp
          </SubmitButton>
        </form>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="tran-label text-xs text-tran-muted">Varianter</h2>
        <p className="text-sm text-tran-muted">
          Valfritt - t.ex. phin-filter i liten/stor. Varje variant får en
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
                    name="price"
                    type="number"
                    min={0}
                    step="0.01"
                    defaultValue={oreToKronorInput(variant.priceOre)}
                    placeholder="Pris (kr)"
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
                    <SubmitButton className="tran-label text-[11px] hover:text-tran-red">
                      Spara variant
                    </SubmitButton>
                  </div>
                </form>

                <div className="mt-4 flex flex-col gap-3">
                  <h3 className="tran-label text-[11px] text-tran-muted">
                    Bild för denna variant
                  </h3>
                  <p className="text-xs text-tran-muted">
                    Visas när kunden väljer just den här varianten (t.ex. hela
                    bönor kontra malet). Ingen egen bild = produktens bild
                    visas istället.
                  </p>
                  {variant.images.length > 0 ? (
                    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                      {variant.images.map((url) => (
                        <div key={url} className="flex flex-col gap-2">
                          <div className="relative aspect-square border border-tran-hairline">
                            <Image src={url} alt="" fill className="object-cover" unoptimized />
                          </div>
                          <form action={removeVariantImage.bind(null, id, variant.id, url)}>
                            <SubmitButton className="tran-label text-[11px] text-tran-muted hover:text-tran-red">
                              Ta bort
                            </SubmitButton>
                          </form>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <form
                    action={addVariantImage.bind(null, id, variant.id)}
                    className="flex items-center gap-3"
                  >
                    <input type="file" name="image" accept="image/*" required className="text-sm" />
                    <SubmitButton className="tran-label border border-tran-black px-3 py-1.5 text-xs transition-colors hover:border-tran-red hover:text-tran-red">
                      Ladda upp
                    </SubmitButton>
                  </form>
                </div>

                <form action={deleteVariant.bind(null, id, variant.id)} className="mt-4">
                  <SubmitButton className="tran-label text-[11px] text-tran-muted hover:text-tran-red">
                    Ta bort variant
                  </SubmitButton>
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
            name="price"
            type="number"
            min={0}
            step="0.01"
            placeholder="Pris (kr)"
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
            <SubmitButton className="tran-label border border-tran-black px-3 py-1.5 text-xs transition-colors hover:border-tran-red hover:text-tran-red">
              Lägg till variant
            </SubmitButton>
          </div>
        </form>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="tran-label text-xs text-tran-muted">Kit-innehåll</h2>
        <p className="text-sm text-tran-muted">
          Om den här produkten är ett kit (t.ex. Komplett Kit) kopplar du
          ihop den med sina beståndsdelar här. Lagersaldot räknas då ut
          automatiskt från komponenternas fria lager istället för att
          fyllas i manuellt på lagersidan. Har en komponent egna varianter
          (t.ex. malet/kaffebönor) måste du välja exakt vilken - annars
          pekar kitet på fel lagerrad.
        </p>

        {bundleAvailability !== null ? (
          <p className="text-sm">
            <span className="tran-label text-[11px] text-tran-muted">
              Beräknat lagersaldo just nu:{" "}
            </span>
            <span className="tran-tabular font-bold">{bundleAvailability} st</span>
          </p>
        ) : null}

        {bundleItems.length > 0 ? (
          <div className="flex flex-col gap-3">
            {bundleItems.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 border border-tran-hairline p-3"
              >
                <span className="text-sm">
                  {item.componentProductName}
                  {item.componentVariantName ? ` - ${item.componentVariantName}` : ""}
                </span>
                <div className="flex items-center gap-3">
                  <form
                    action={updateBundleItemQuantity.bind(null, id, item.id)}
                    className="flex items-center gap-2"
                  >
                    <input
                      name="quantity"
                      type="number"
                      min={1}
                      defaultValue={item.quantity}
                      className="w-16 border border-tran-hairline bg-tran-white px-2 py-1 text-sm focus:border-tran-black focus:outline-none"
                    />
                    <span className="text-xs text-tran-muted">st/kit</span>
                    <SubmitButton className="tran-label text-[11px] hover:text-tran-red">
                      Spara
                    </SubmitButton>
                  </form>
                  <form action={removeBundleItem.bind(null, id, item.id)}>
                    <SubmitButton className="tran-label text-[11px] text-tran-muted hover:text-tran-red">
                      Ta bort
                    </SubmitButton>
                  </form>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-tran-muted">Inga komponenter kopplade.</p>
        )}

        {componentOptions.length > 0 ? (
          <form
            action={addBundleItem.bind(null, id)}
            className="flex flex-wrap items-center gap-3 border border-tran-hairline p-4"
          >
            <select name="component" required defaultValue="" className={inputClass}>
              <option value="" disabled>
                Välj komponent...
              </option>
              {componentOptions.map((product) =>
                product.variants.length > 0 ? (
                  <optgroup key={product.id} label={`${product.nameSv} (${product.sku})`}>
                    {product.variants.map((variant) => (
                      <option key={variant.id} value={`${product.id}:${variant.id}`}>
                        {variant.nameSv} ({variant.sku})
                      </option>
                    ))}
                  </optgroup>
                ) : (
                  <option key={product.id} value={product.id}>
                    {product.nameSv} ({product.sku})
                  </option>
                ),
              )}
            </select>
            <input
              name="quantity"
              type="number"
              min={1}
              defaultValue={1}
              placeholder="Antal/kit"
              required
              className="w-24 border border-tran-hairline bg-tran-white px-2 py-1.5 text-sm focus:border-tran-black focus:outline-none"
            />
            <SubmitButton className="tran-label border border-tran-black px-3 py-1.5 text-xs transition-colors hover:border-tran-red hover:text-tran-red">
              Lägg till komponent
            </SubmitButton>
          </form>
        ) : null}
      </section>
    </div>
  );
}
