"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireCurrentAdmin } from "@/lib/current-admin";
import { getBundleItemsForProduct } from "@/lib/inventory/bundles";
import {
  computeTrueReservedQuantities,
  computeTrueShippedQuantities,
} from "@/lib/inventory/order-line-totals";
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
      .select({
        productId: schema.inventory.productId,
        variantId: schema.inventory.variantId,
        quantity: schema.inventory.quantity,
      })
      .from(schema.inventory)
      .where(eq(schema.inventory.id, inventoryId))
      .for("update");

    if (!row) {
      throw new Error("Lagerraden finns inte.");
    }

    const bundleItems = await getBundleItemsForProduct(tx, row.productId);
    if (bundleItems.length > 0) {
      throw new Error(
        "Det här är ett kit - lagersaldot beräknas automatiskt utifrån komponenterna och kan inte ändras manuellt.",
      );
    }

    if (!row.variantId) {
      const [existingVariant] = await tx
        .select({ id: schema.productVariants.id })
        .from(schema.productVariants)
        .where(eq(schema.productVariants.productId, row.productId))
        .limit(1);
      if (existingVariant) {
        throw new Error(
          "Den här produkten säljs bara som variant - lagersaldot beräknas automatiskt utifrån varianterna och kan inte ändras manuellt.",
        );
      }
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

/**
 * Räknar om reserverat OCH skickat lager från grunden utifrån de
 * faktiska ordrarna (se order-line-totals.ts) och rättar reserved_
 * quantity/shipped_quantity där de inte stämmer - en knapp admin kan
 * klicka på för att självläka drift som uppstått av buggar i enskilda
 * kod-vägar (t.ex. avbokningar som tidigare inte släppte sin
 * reservation). De här två kolumnerna är de enda inventory-fälten
 * hemsidans kassa faktiskt läser (lib/queries/cart.ts,
 * lib/inventory/bundles.ts) - /inventory-sidan själv visar redan alltid
 * det rätträknade värdet oavsett, den här knappen är till för kassan.
 */
export async function reconcileReservedQuantitiesAction() {
  const adminUser = await requireCurrentAdmin();

  const [trueReserved, trueShipped] = await Promise.all([
    computeTrueReservedQuantities(),
    computeTrueShippedQuantities(),
  ]);

  const rows = await db
    .select({
      id: schema.inventory.id,
      productId: schema.inventory.productId,
      variantId: schema.inventory.variantId,
      reservedQuantity: schema.inventory.reservedQuantity,
      shippedQuantity: schema.inventory.shippedQuantity,
    })
    .from(schema.inventory);

  let correctedCount = 0;

  await db.transaction(async (tx) => {
    for (const row of rows) {
      const key = `${row.productId}|${row.variantId ?? ""}`;
      const trueReservedValue = trueReserved.expanded.get(key) ?? 0;
      const trueShippedValue = trueShipped.expanded.get(key) ?? 0;
      const reservedDelta = trueReservedValue - row.reservedQuantity;
      const shippedDelta = trueShippedValue - row.shippedQuantity;
      if (reservedDelta === 0 && shippedDelta === 0) continue;

      correctedCount += 1;

      await tx
        .update(schema.inventory)
        .set({
          reservedQuantity: trueReservedValue,
          shippedQuantity: trueShippedValue,
          updatedAt: new Date(),
        })
        .where(eq(schema.inventory.id, row.id));

      if (reservedDelta !== 0) {
        await tx.insert(schema.inventoryMovements).values({
          inventoryId: row.id,
          changeAmount: reservedDelta,
          reason: reservedDelta < 0 ? "order_released" : "order_reserved",
          note: `Avstämning: reserverat rättat från ${row.reservedQuantity} till ${trueReservedValue} (baserat på öppna ordrar).`,
          causedByAdminId: adminUser.id,
        });
      }
      if (shippedDelta !== 0) {
        await tx.insert(schema.inventoryMovements).values({
          inventoryId: row.id,
          changeAmount: shippedDelta,
          reason: "order_shipped",
          note: `Avstämning: skickat rättat från ${row.shippedQuantity} till ${trueShippedValue} (baserat på skickade ordrar).`,
          causedByAdminId: adminUser.id,
        });
      }
    }
  });

  revalidatePath("/inventory");
  revalidatePath("/");
  redirect(`/inventory?reconciled=${correctedCount}`);
}

/**
 * Registrerar en leverans/batch: lägger TILL angivna antal på befintligt
 * lagersaldo för flera produkter samtidigt (i stället för att behöva
 * räkna ut och skriva in den nya totalsumman per produkt via Justera).
 * Formulärfält namnges `qty_<inventoryId>` - se /inventory/batch.
 */
export async function receiveBatchAction(formData: FormData) {
  const adminUser = await requireCurrentAdmin();

  const label = formData.get("label")?.toString().trim() || null;
  const note = label ? `Ny leverans: ${label}` : "Ny leverans";

  const linesToApply: { inventoryId: string; amount: number }[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("qty_")) continue;
    const amount = Number(value);
    if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount <= 0) continue;
    linesToApply.push({ inventoryId: key.slice("qty_".length), amount });
  }

  if (linesToApply.length === 0) {
    redirect(
      `/inventory/batch?error=${encodeURIComponent("Fyll i minst ett antal (större än 0).")}`,
    );
  }

  await db.transaction(async (tx) => {
    for (const line of linesToApply) {
      const [row] = await tx
        .select({
          productId: schema.inventory.productId,
          variantId: schema.inventory.variantId,
          quantity: schema.inventory.quantity,
        })
        .from(schema.inventory)
        .where(eq(schema.inventory.id, line.inventoryId))
        .for("update");

      if (!row) continue;

      // Skyddar mot att räkna en kit- eller variant-förälders egen rad -
      // formuläret på /inventory/batch listar dem aldrig, men detta är
      // ett extra skydd om något ändå försöker skicka in deras id.
      const bundleItems = await getBundleItemsForProduct(tx, row.productId);
      if (bundleItems.length > 0) continue;
      if (!row.variantId) {
        const [existingVariant] = await tx
          .select({ id: schema.productVariants.id })
          .from(schema.productVariants)
          .where(eq(schema.productVariants.productId, row.productId))
          .limit(1);
        if (existingVariant) continue;
      }

      await tx
        .update(schema.inventory)
        .set({ quantity: row.quantity + line.amount, updatedAt: new Date() })
        .where(eq(schema.inventory.id, line.inventoryId));

      await tx.insert(schema.inventoryMovements).values({
        inventoryId: line.inventoryId,
        changeAmount: line.amount,
        reason: "manual_adjustment",
        note,
        causedByAdminId: adminUser.id,
      });
    }
  });

  revalidatePath("/inventory");
  revalidatePath("/inventory/batch");
  revalidatePath("/");
  redirect(`/inventory?batchReceived=${linesToApply.length}`);
}
