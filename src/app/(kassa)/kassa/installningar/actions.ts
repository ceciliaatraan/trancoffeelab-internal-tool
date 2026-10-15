"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCurrentAdmin } from "@/lib/current-admin";
import { describeError } from "@/lib/describe-error";
import { createLocation, saveLocationOrder, setFixedLocation, setLocationArchived } from "@/lib/kassa/locations";

const PAGE = "/kassa/installningar";

function done(): never {
  revalidatePath(PAGE);
  revalidatePath("/kassa");
  revalidatePath("/");
  redirect(`${PAGE}?saved=1`);
}

function failed(err: unknown): never {
  redirect(`${PAGE}?error=${encodeURIComponent(describeError(err))}`);
}

export async function createLocationFormAction(formData: FormData) {
  const admin = await requireCurrentAdmin();
  try {
    await createLocation(String(formData.get("name") ?? ""), admin.email);
  } catch (err) {
    failed(err);
  }
  done();
}

export async function setLocationArchivedAction(locationId: string, archived: boolean) {
  await requireCurrentAdmin();
  await setLocationArchived(locationId, archived);
  done();
}

export async function setFixedLocationFormAction(formData: FormData) {
  await requireCurrentAdmin();
  try {
    const locationId = String(formData.get("locationId") ?? "");
    if (!locationId) throw new Error("Välj ett försäljningsställe.");
    await setFixedLocation(String(formData.get("email") ?? ""), locationId);
  } catch (err) {
    failed(err);
  }
  done();
}

export async function removeFixedLocationAction(email: string) {
  await requireCurrentAdmin();
  await setFixedLocation(email, null);
  done();
}

/** Sparar ordningen efter dra och släpp - anropas direkt från listan, ingen omdirigering. */
export async function saveLocationOrderAction(orderedIds: string[]): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireCurrentAdmin();
    if (!Array.isArray(orderedIds) || orderedIds.some((id) => typeof id !== "string")) {
      return { ok: false, error: "Ogiltig ordning." };
    }
    await saveLocationOrder(orderedIds);
    revalidatePath("/kassa");
    revalidatePath(PAGE);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: describeError(err) };
  }
}
