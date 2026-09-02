"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireCurrentAdmin } from "@/lib/current-admin";
import { uploadProductImage, deleteProductImage } from "@/lib/supabase";
import { productInputSchema, variantInputSchema } from "@/lib/validation/product";

function friendlyDbError(err: unknown): string {
  if (
    err &&
    typeof err === "object" &&
    "code" in err &&
    (err as { code?: string }).code === "23505"
  ) {
    return "Slug eller SKU används redan av en annan produkt.";
  }
  return "Något gick fel. Försök igen.";
}

function parseProductForm(formData: FormData) {
  return productInputSchema.safeParse({
    slug: formData.get("slug"),
    nameSv: formData.get("nameSv"),
    nameEn: formData.get("nameEn"),
    descriptionSv: formData.get("descriptionSv") || undefined,
    descriptionEn: formData.get("descriptionEn") || undefined,
    sku: formData.get("sku"),
    priceOre: formData.get("priceOre"),
    taxRate: formData.get("taxRate"),
    weightGrams: formData.get("weightGrams"),
    status: formData.get("status"),
    sortOrder: formData.get("sortOrder") || 0,
  });
}

export async function createProduct(formData: FormData) {
  await requireCurrentAdmin();
  const parsed = parseProductForm(formData);
  if (!parsed.success) {
    redirect(
      `/products/new?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Ogiltiga uppgifter")}`,
    );
  }

  let productId: string;
  try {
    const [product] = await db
      .insert(schema.products)
      .values(parsed.data)
      .returning({ id: schema.products.id });
    productId = product.id;
    await db.insert(schema.inventory).values({ productId });
  } catch (err) {
    redirect(`/products/new?error=${encodeURIComponent(friendlyDbError(err))}`);
  }

  revalidatePath("/products");
  redirect(`/products/${productId}`);
}

export async function updateProduct(productId: string, formData: FormData) {
  await requireCurrentAdmin();
  const parsed = parseProductForm(formData);
  if (!parsed.success) {
    redirect(
      `/products/${productId}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Ogiltiga uppgifter")}`,
    );
  }

  try {
    await db
      .update(schema.products)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(schema.products.id, productId));
  } catch (err) {
    redirect(`/products/${productId}?error=${encodeURIComponent(friendlyDbError(err))}`);
  }

  revalidatePath("/products");
  revalidatePath(`/products/${productId}`);
  redirect(`/products/${productId}?saved=1`);
}

export async function setProductStatus(
  productId: string,
  status: "draft" | "published" | "archived",
) {
  await requireCurrentAdmin();
  await db
    .update(schema.products)
    .set({ status, updatedAt: new Date() })
    .where(eq(schema.products.id, productId));

  revalidatePath("/products");
  revalidatePath(`/products/${productId}`);
}

export async function addProductImage(productId: string, formData: FormData) {
  await requireCurrentAdmin();
  const file = formData.get("image");

  if (!(file instanceof File) || file.size === 0) {
    redirect(`/products/${productId}?error=${encodeURIComponent("Välj en bildfil")}`);
  }

  try {
    const url = await uploadProductImage(productId, file);
    const [product] = await db
      .select({ images: schema.products.images })
      .from(schema.products)
      .where(eq(schema.products.id, productId));

    await db
      .update(schema.products)
      .set({ images: [...(product?.images ?? []), url], updatedAt: new Date() })
      .where(eq(schema.products.id, productId));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Kunde inte ladda upp bild.";
    redirect(`/products/${productId}?error=${encodeURIComponent(message)}`);
  }

  revalidatePath(`/products/${productId}`);
}

export async function removeProductImage(productId: string, url: string) {
  await requireCurrentAdmin();
  const [product] = await db
    .select({ images: schema.products.images })
    .from(schema.products)
    .where(eq(schema.products.id, productId));

  await db
    .update(schema.products)
    .set({
      images: (product?.images ?? []).filter((image) => image !== url),
      updatedAt: new Date(),
    })
    .where(eq(schema.products.id, productId));

  await deleteProductImage(url);
  revalidatePath(`/products/${productId}`);
}

function parseVariantForm(formData: FormData) {
  return variantInputSchema.safeParse({
    nameSv: formData.get("nameSv"),
    nameEn: formData.get("nameEn"),
    sku: formData.get("sku"),
    priceOre: formData.get("priceOre"),
    weightGrams: formData.get("weightGrams"),
    sortOrder: formData.get("sortOrder") || 0,
  });
}

export async function addVariant(productId: string, formData: FormData) {
  await requireCurrentAdmin();
  const parsed = parseVariantForm(formData);
  if (!parsed.success) {
    redirect(
      `/products/${productId}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Ogiltiga uppgifter")}`,
    );
  }

  try {
    const [variant] = await db
      .insert(schema.productVariants)
      .values({ ...parsed.data, productId })
      .returning({ id: schema.productVariants.id });
    await db.insert(schema.inventory).values({ productId, variantId: variant.id });
  } catch (err) {
    redirect(`/products/${productId}?error=${encodeURIComponent(friendlyDbError(err))}`);
  }

  revalidatePath(`/products/${productId}`);
}

export async function updateVariant(
  productId: string,
  variantId: string,
  formData: FormData,
) {
  await requireCurrentAdmin();
  const parsed = parseVariantForm(formData);
  if (!parsed.success) {
    redirect(
      `/products/${productId}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Ogiltiga uppgifter")}`,
    );
  }

  try {
    await db
      .update(schema.productVariants)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(schema.productVariants.id, variantId));
  } catch (err) {
    redirect(`/products/${productId}?error=${encodeURIComponent(friendlyDbError(err))}`);
  }

  revalidatePath(`/products/${productId}`);
}

export async function deleteVariant(productId: string, variantId: string) {
  await requireCurrentAdmin();
  await db.delete(schema.productVariants).where(eq(schema.productVariants.id, variantId));
  revalidatePath(`/products/${productId}`);
}
