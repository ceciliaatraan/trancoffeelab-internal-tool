"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireCurrentAdmin } from "@/lib/current-admin";
import { inventoryAdjustSchema } from "@/lib/validation/product";

export async function adjustInventory(formData: FormData) {
  const adminUser = await requireCurrentAdmin();

  const parsed = inventoryAdjustSchema.safeParse({
    inventoryId: formData.get("inventoryId"),
    delta: formData.get("delta"),
    reason: formData.get("reason"),
    note: formData.get("note"),
  });

  if (!parsed.success) {
    redirect(
      `/inventory?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Ogiltiga uppgifter")}`,
    );
  }

  const { inventoryId, delta, reason, note } = parsed.data;

  await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ quantity: schema.inventory.quantity })
      .from(schema.inventory)
      .where(eq(schema.inventory.id, inventoryId))
      .for("update");

    if (!row) {
      throw new Error("Lagerraden finns inte.");
    }
    if (row.quantity + delta < 0) {
      throw new Error("Lagersaldot kan inte bli negativt.");
    }

    await tx
      .update(schema.inventory)
      .set({ quantity: sql`${schema.inventory.quantity} + ${delta}`, updatedAt: new Date() })
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
