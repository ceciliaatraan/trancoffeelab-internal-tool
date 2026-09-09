"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireOwner } from "@/lib/current-admin";
import { discountInputSchema } from "@/lib/validation/discount";
import { kronorToOre, percentToHundredths } from "@/lib/money-input";

function friendlyDbError(err: unknown): string {
  if (err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "23505") {
    return "Koden används redan.";
  }
  return "Något gick fel. Försök igen.";
}

function parseForm(formData: FormData) {
  const type = formData.get("type")?.toString();
  const rawValue = formData.get("value")?.toString();
  const value = type === "percentage" ? percentToHundredths(rawValue) : kronorToOre(rawValue);

  const minOrderValueRaw = formData.get("minOrderValue")?.toString().trim();
  const minOrderValueOre = minOrderValueRaw ? kronorToOre(minOrderValueRaw) : undefined;

  return discountInputSchema.safeParse({
    code: formData.get("code"),
    type,
    value,
    appliesTo: formData.get("appliesTo") || undefined,
    validFrom: formData.get("validFrom") || undefined,
    validUntil: formData.get("validUntil") || undefined,
    maxUses: formData.get("maxUses") || undefined,
    minOrderValueOre,
    active: formData.get("active") === "on",
  });
}

export async function createDiscountAction(formData: FormData) {
  try {
    await requireOwner();
  } catch {
    redirect(`/discounts?error=${encodeURIComponent("Endast ägare kan skapa rabattkoder.")}`);
  }

  const parsed = parseForm(formData);
  if (!parsed.success) {
    redirect(
      `/discounts?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Ogiltiga uppgifter")}`,
    );
  }

  try {
    await db.insert(schema.discountCodes).values(parsed.data);
  } catch (err) {
    redirect(`/discounts?error=${encodeURIComponent(friendlyDbError(err))}`);
  }

  revalidatePath("/discounts");
  redirect("/discounts?saved=1");
}

export async function updateDiscountAction(discountId: string, formData: FormData) {
  try {
    await requireOwner();
  } catch {
    redirect(`/discounts?error=${encodeURIComponent("Endast ägare kan ändra rabattkoder.")}`);
  }

  const parsed = parseForm(formData);
  if (!parsed.success) {
    redirect(
      `/discounts?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Ogiltiga uppgifter")}`,
    );
  }

  try {
    await db
      .update(schema.discountCodes)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(schema.discountCodes.id, discountId));
  } catch (err) {
    redirect(`/discounts?error=${encodeURIComponent(friendlyDbError(err))}`);
  }

  revalidatePath("/discounts");
  redirect("/discounts?saved=1");
}
