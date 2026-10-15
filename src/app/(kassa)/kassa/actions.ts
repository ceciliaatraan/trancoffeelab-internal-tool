"use server";

import { revalidatePath } from "next/cache";
import { requireKassaUser } from "@/lib/current-admin";
import { describeError } from "@/lib/describe-error";
import { isPosLocation } from "@/lib/kassa/options";
import { cancelPendingSale, createPendingSale, markSalePaid, refundSale } from "@/lib/kassa/sales";
import { swishMessageForSale, swishPayeeNumber } from "@/lib/kassa/swish-qr";
import { fetchSwishQrDataUrl } from "@/lib/kassa/swish-qr-server";

export type StartSaleResult =
  | {
      ok: true;
      sale: { id: string; saleNumber: number; totalOre: number };
      swish: { payee: string; message: string; qrDataUrl: string | null };
    }
  | { ok: false; error: string };

/** Skapar försäljningen (väntar på betalning) och Swish-QR-koden. */
export async function startSaleAction(input: {
  lines: { sku: string; quantity: number }[];
  location: string;
  note: string;
}): Promise<StartSaleResult> {
  try {
    const seller = await requireKassaUser();
    if (!isPosLocation(input.location)) return { ok: false, error: "Välj var försäljningen sker." };
    const payee = swishPayeeNumber();
    if (!payee) return { ok: false, error: "Swish-numret saknas." };

    const sale = await createPendingSale({
      requested: input.lines,
      location: input.location,
      note: input.note.trim().slice(0, 200) || null,
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
    await requireKassaUser();
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
    const refunded = await refundSale(saleId, { id: seller.id, email: seller.email });
    revalidatePath("/kassa");
    revalidatePath("/");
    revalidatePath("/inventory");
    return refunded ? { ok: true } : { ok: false, error: "Bara betalda försäljningar kan ångras." };
  } catch (err) {
    return { ok: false, error: describeError(err) };
  }
}
