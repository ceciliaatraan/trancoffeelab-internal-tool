import { NextResponse } from "next/server";
import { syncPostnordForOpenOrders } from "@/lib/orders/postnord-auto-sync";
import { refreshUnsettledOrdersFromKustom } from "@/lib/orders/kustom-refresh";

export const maxDuration = 60;

/**
 * Anropas av Vercel Cron (vercel.json) en gång per dygn - Vercel skickar
 * `Authorization: Bearer <CRON_SECRET>` när miljövariabeln CRON_SECRET är
 * satt. Går igenom ALLA öppna ordrar oavsett ålder. Utan satt hemlighet avvisas alla anrop, så ingen utomstående kan
 * trigga synken och bränna PostNords anropskvot.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const refreshedFromKustom = await refreshUnsettledOrdersFromKustom();
  const counts = await syncPostnordForOpenOrders({ maxAgeDays: null });
  return NextResponse.json({ refreshedFromKustom, ...counts });
}
