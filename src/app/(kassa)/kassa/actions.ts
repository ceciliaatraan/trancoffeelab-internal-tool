"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { requireKassaUser } from "@/lib/current-admin";
import { describeError } from "@/lib/describe-error";
import {
  createLocation,
  getActiveLocations,
  getFixedLocationForEmail,
  type PosLocation,
} from "@/lib/kassa/locations";
import {
  cancelPendingSale,
  createPendingSale,
  declineSaleReceipt,
  markSalePaid,
  refundSale,
  sendSaleReceipt,
} from "@/lib/kassa/sales";
import { swishMessageForSale, swishPayeeNumber } from "@/lib/kassa/swish-qr";
import { fetchSwishQrDataUrl } from "@/lib/kassa/swish-qr-server";

/**
 * Den som har ett fast försäljningsställe får bara röra försäljningar från
 * det stället (de ser bara dem i listan, men kontrollen sitter här).
 */
async function assertSaleAccessible(sellerEmail: string, saleId: string): Promise<void> {
  const fixed = await getFixedLocationForEmail(sellerEmail);
  if (!fixed) return;
  const [sale] = await db
    .select({ locationId: schema.posSales.locationId })
    .from(schema.posSales)
    .where(eq(schema.posSales.id, saleId));
  if (!sale || sale.locationId !== fixed.id) {
    throw new Error("Försäljningen hör till ett annat försäljningsställe.");
  }
}

export type StartSaleResult =
  | {
      ok: true;
      sale: { id: string; saleNumber: number; totalOre: number; customerEmail: string };
      swish: { payee: string; message: string; qrDataUrl: string | null };
    }
  | { ok: false; error: string };

/** Skapar försäljningen (väntar på betalning) och Swish-QR-koden. */
export async function startSaleAction(input: {
  lines: { sku: string; quantity: number }[];
  locationId: string;
  note: string;
  customerEmail: string;
}): Promise<StartSaleResult> {
  try {
    const seller = await requireKassaUser();
    // Den som har ett fast försäljningsställe säljer alltid där, oavsett
    // vad webbläsaren skickar.
    const location =
      (await getFixedLocationForEmail(seller.email)) ??
      (await getActiveLocations()).find((option) => option.id === input.locationId);
    if (!location) return { ok: false, error: "Välj var försäljningen sker." };
    const payee = swishPayeeNumber();
    if (!payee) return { ok: false, error: "Swish-numret saknas." };

    const sale = await createPendingSale({
      requested: input.lines,
      location,
      note: input.note.trim().slice(0, 200) || null,
      customerEmail: input.customerEmail,
      paymentMethod: "swish",
      seller: { id: seller.id, email: seller.email },
    });

    const message = swishMessageForSale(sale.saleNumber);
    return {
      ok: true,
      sale,
      swish: { payee, message, qrDataUrl: await fetchSwishQrDataUrl(payee, sale.totalOre, message) },
    };
  } catch (err) {
    return { ok: false, error: describeError(err) };
  }
}

export async function markSalePaidAction(saleId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const seller = await requireKassaUser();
    await assertSaleAccessible(seller.email, saleId);
    const updated = await markSalePaid(saleId, { id: seller.id, email: seller.email });
    revalidatePath("/kassa");
    revalidatePath("/");
    return updated ? { ok: true } : { ok: false, error: "Försäljningen väntar inte längre på betalning." };
  } catch (err) {
    return { ok: false, error: describeError(err) };
  }
}

export async function cancelSaleAction(saleId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const seller = await requireKassaUser();
    await assertSaleAccessible(seller.email, saleId);
    await cancelPendingSale(saleId);
    revalidatePath("/kassa");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: describeError(err) };
  }
}

export async function refundSaleAction(saleId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const seller = await requireKassaUser();
    await assertSaleAccessible(seller.email, saleId);
    const refunded = await refundSale(saleId, { id: seller.id, email: seller.email });
    revalidatePath("/kassa");
    revalidatePath("/");
    revalidatePath("/inventory");
    return refunded ? { ok: true } : { ok: false, error: "Bara betalda försäljningar kan ångras." };
  } catch (err) {
    return { ok: false, error: describeError(err) };
  }
}

/** Lägger till ett försäljningsställe (t.ex. ett event) direkt från kassan. */
export async function addLocationAction(
  name: string,
): Promise<{ ok: true; location: PosLocation } | { ok: false; error: string }> {
  try {
    const seller = await requireKassaUser();
    if (await getFixedLocationForEmail(seller.email)) {
      return { ok: false, error: "Du säljer alltid på ditt fasta försäljningsställe." };
    }
    const location = await createLocation(name, seller.email);
    revalidatePath("/kassa");
    return { ok: true, location };
  } catch (err) {
    return { ok: false, error: describeError(err) };
  }
}

/** Skickar (eller skickar om) kvittot för en betald försäljning. */
export async function sendReceiptAction(
  saleId: string,
  email: string,
): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
  try {
    const seller = await requireKassaUser();
    await assertSaleAccessible(seller.email, saleId);
    const result = await sendSaleReceipt(saleId, email);
    revalidatePath("/kassa");
    return { ok: true, email: result.email };
  } catch (err) {
    return { ok: false, error: describeError(err) };
  }
}

/** Kunden ville inte ha kvitto - sparas för kolumnen Kvitto i listan. */
export async function declineReceiptAction(saleId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const seller = await requireKassaUser();
    await assertSaleAccessible(seller.email, saleId);
    await declineSaleReceipt(saleId);
    revalidatePath("/kassa");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: describeError(err) };
  }
}
