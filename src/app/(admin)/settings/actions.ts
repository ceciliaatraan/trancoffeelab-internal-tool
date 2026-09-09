"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireOwner } from "@/lib/current-admin";
import { getShopSettings } from "@/lib/settings";
import { kronorToOre } from "@/lib/money-input";

export async function updateShippingSettingsAction(formData: FormData) {
  try {
    await requireOwner();
  } catch {
    redirect(`/settings?error=${encodeURIComponent("Endast ägare kan ändra inställningar.")}`);
  }

  const flatRate = kronorToOre(formData.get("shippingFlatRate")?.toString());
  const thresholdRaw = formData.get("freeShippingThreshold")?.toString().trim();
  const threshold = thresholdRaw ? kronorToOre(thresholdRaw) : null;

  if (!Number.isInteger(flatRate) || flatRate < 0) {
    redirect(`/settings?error=${encodeURIComponent("Ogiltig fraktkostnad.")}`);
  }
  if (threshold !== null && (!Number.isInteger(threshold) || threshold < 0)) {
    redirect(`/settings?error=${encodeURIComponent("Ogiltig gräns för fri frakt.")}`);
  }

  const settings = await getShopSettings();
  await db
    .update(schema.shopSettings)
    .set({
      shippingFlatRateOre: flatRate,
      freeShippingThresholdOre: threshold,
      updatedAt: new Date(),
    })
    .where(eq(schema.shopSettings.id, settings.id));

  revalidatePath("/settings");
  redirect("/settings?saved=1");
}
