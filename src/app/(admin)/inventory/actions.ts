"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireCurrentAdmin } from "@/lib/current-admin";
import { getBundleItemsForProduct } from "@/lib/inventory/bundles";
import { inventoryAdjustSchema } from "@/lib/validation/product";

export async function adjustInventory(formData: FormData) {
  const adminUser = await requireCurrentAdmin();

  const parsed = inventoryAdjustSchema.safeParse({
    inventoryId: formData.get("inventoryId"),
    newQuantity: formData.get("newQuantity"),
    reason: formData.get("reason"),
    note: formData.get("note"),
  });

  if (!parsed.success) {
    redirect(
      `/inventory?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Ogiltiga uppgifter")}`,
    );
  }

  const { inventoryId, newQuantity, reason, note } = parsed.data;

  await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ productId: schema.inventory.productId, quantity: schema.inventory.quantity })
      .from(schema.inventory)
      .where(eq(schema.inventory.id, inventoryId))
      .for("update");

    if (!row) {
      throw new Error("Lagerraden finns inte.");
    }

    const bundleItems = await getBundleItemsForProduct(tx, row.productId);
    if (bundleItems.length > 0) {
      throw new Error(
        "Det här är ett kit — lagersaldot beräknas automatiskt utifrån komponenterna och kan inte ändras manuellt.",
      );
    }

    const delta = newQuantity - row.quantity;
    if (delta === 0) {
      return;
    }

    await tx
      .update(schema.inventory)
      .set({ quantity: newQuantity, updatedAt: new Date() })
      .where(eq(schema.inventory.id, inventoryId));

    await tx.insert(schema.inventoryMovements).values({
      inventoryId,
      changeAmount: delta,
      reason,
      note,
      causedByAdminId: adminUser.id,
    });
  }).catch((err) => {
    const message = err instanceof Error ? err.message : "Något gick fel.";
    redirect(`/inventory?error=${encodeURIComponent(message)}`);
  });

  revalidatePath("/inventory");
  revalidatePath("/");
}
