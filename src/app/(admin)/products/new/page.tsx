import Link from "next/link";
import { ProductForm } from "@/components/product-form";
import { createProduct } from "../actions";

export default async function NewProductPage({
  searchParams,
}: PageProps<"/products/new">) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : null;

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <div className="flex items-center gap-4">
        <Link href="/products" className="text-sm text-tran-muted hover:text-tran-red">
          ← Produkter
        </Link>
      </div>
      <h1 className="font-display text-4xl">Ny produkt</h1>
      {error ? (
        <p className="border border-tran-red px-4 py-3 text-sm text-tran-red">
          {error}
        </p>
      ) : null}
      <ProductForm action={createProduct} submitLabel="Skapa produkt" />
    </div>
  );
}
