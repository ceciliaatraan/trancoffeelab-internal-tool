import "server-only";
import { SWISH_QR_URL, buildSwishQrRequest } from "./swish-qr";

/**
 * Hämtar en förifylld Swish-QR-kod från Swish (se swish-qr.ts) som
 * data-URL. null om Swish inte svarar - kassan visar då nummer, belopp och
 * meddelande att knappa in för hand i stället.
 */
export async function fetchSwishQrDataUrl(
  payee: string,
  amountOre: number,
  message: string,
): Promise<string | null> {
  try {
    const response = await fetch(process.env.SWISH_QR_API_URL || SWISH_QR_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildSwishQrRequest(payee, amountOre, message)),
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    if (!response.ok) {
      console.error("Swish-QR misslyckades", response.status, await response.text().catch(() => ""));
      return null;
    }
    const svg = await response.text();
    if (!svg.includes("<svg")) return null;
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  } catch (err) {
    console.error("Swish-QR misslyckades", err);
    return null;
  }
}
