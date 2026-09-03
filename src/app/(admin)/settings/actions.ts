"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireOwner } from "@/lib/current-admin";
import { getShopSettings } from "@/lib/settings";

export async function updateShippingSettingsAction(formData: FormData) {
  try {
    await requireOwner();
  } catch {
    redirect(`/settings?error=${encodeURIComponent("Endast ägare kan ändra inställningar.")}`);
  }

  const flatRate = Number(formData.get("shippingFlatRateOre"));
  const taxRate = Number(formData.get("shippingTaxRate"));
  const thresholdRaw = formData.get("freeShippingThresholdOre")?.toString().trim();
  const threshold = thresholdRaw ? Number(thresholdRaw) : null;

  if (!Number.isInteger(flatRate) || flatRate < 0) {
    redirect(`/settings?error=${encodeURIComponent("Ogiltig fraktkostnad.")}`);
  }
  if (!Number.isInteger(taxRate) || taxRate < 0 || taxRate > 10000) {
    redirect(`/settings?error=${encodeURIComponent("Ogiltig momssats för frakt.")}`);
  }
  if (threshold !== null && (!Number.isInteger(threshold) || threshold < 0)) {
    redirect(`/settings?error=${encodeURIComponent("Ogiltig gräns för fri frakt.")}`);
  }

  const settings = await getShopSettings();
  await db
    .update(schema.shopSettings)
    .set({
      shippingFlatRateOre: flatRate,
      shippingTaxRate: taxRate,
      freeShippingThresholdOre: threshold,
      updatedAt: new Date(),
    })
    .where(eq(schema.shopSettings.id, settings.id));

  revalidatePath("/settings");
  redirect("/settings?saved=1");
}
