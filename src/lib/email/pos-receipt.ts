import "server-only";
import { Resend } from "resend";
import { calculateTaxFromGross } from "@/lib/kustom/tax";
import { escapeHtml, formatPrice } from "./order-confirmation";

/** Säljaren som står på kvittot - samma uppgifter som i köpvillkoren på trancoffeelab.com. */
export const RECEIPT_SELLER = {
  name: "Systrarna TRAN AB",
  orgNumber: "559587-6037",
  vatNumber: "SE559587603701",
  address: "Vanadisvägen 26b, 113 46 Stockholm",
} as const;

export type PosReceiptEmailInput = {
  to: string;
  saleNumber: number;
  paidAt: Date;
  /** Försäljningsställets namn, t.ex. "Restaurang TRAN". */
  location: string;
  totalOre: number;
  storefrontUrl?: string;
  lines: {
    name: string;
    quantity: number;
    lineTotalOre: number;
    /** Hundradels procent, som i resten av systemet (600 = 6 %). */
    taxRate: number;
    imageUrl?: string | null;
    slug?: string | null;
  }[];
};

function formatVatRate(taxRate: number): string {
  return `${(taxRate / 100).toLocaleString("sv-SE")} %`;
}

function formatPaidAt(date: Date): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/** Moms per momssats, räknat ur radernas bruttobelopp (samma uträkning som när försäljningen sparades). */
export function vatBreakdown(lines: PosReceiptEmailInput["lines"]): { taxRate: number; taxOre: number }[] {
  const byRate = new Map<number, number>();
  for (const line of lines) {
    const tax = calculateTaxFromGross(line.lineTotalOre, line.taxRate).taxAmount;
    byRate.set(line.taxRate, (byRate.get(line.taxRate) ?? 0) + tax);
  }
  return [...byRate.entries()]
    .sort(([a], [b]) => a - b)
    .map(([taxRate, taxOre]) => ({ taxRate, taxOre }));
}

/**
 * Kvitto för ett köp i kassan - samma formspråk som orderbekräftelsen
 * (renderEmail i order-confirmation.ts), men rubricerat som kvitto och med
 * datum, försäljningsställe, betalsätt, moms per sats och säljarens
 * företagsuppgifter. Alltid på svenska, som kassan.
 */
export function renderReceiptEmail(input: PosReceiptEmailInput): {
  subject: string;
  text: string;
  html: string;
} {
  const storefrontUrl = (input.storefrontUrl ?? "https://trancoffeelab.com").replace(/\/$/, "");
  const productUrl = (slug: string | null | undefined) =>
    slug ? `${storefrontUrl}/produkt/${encodeURIComponent(slug)}` : null;
  const total = formatPrice(input.totalOre, false);
  const paidAt = formatPaidAt(input.paidAt);
  const vat = vatBreakdown(input.lines);
  const seller = RECEIPT_SELLER;
  const closingLine = "Tack för att ni är med och sprider vietnamesiskt kaffe i Sverige.";
  const signature = "Cecilia Tran & Winnie Tran";

  const lineRows = input.lines
    .map((line) => {
      const url = productUrl(line.slug);
      const image = line.imageUrl
        ? `<img src="${escapeHtml(line.imageUrl)}" width="56" height="56" alt="" style="display:block;width:56px;height:56px;border:1px solid rgba(0,0,0,0.12);object-fit:cover;" />`
        : `<div style="width:56px;height:56px;"></div>`;
      const nameText = `${line.quantity} × ${escapeHtml(line.name)}`;
      return `
        <tr>
          <td width="56" style="padding:12px 12px 12px 0;border-bottom:1px solid rgba(0,0,0,0.12);">
            ${url ? `<a href="${escapeHtml(url)}">${image}</a>` : image}
          </td>
          <td style="padding:12px 0;border-bottom:1px solid rgba(0,0,0,0.12);font-size:14px;line-height:1.4;">
            ${url ? `<a href="${escapeHtml(url)}" style="color:#000000;text-decoration:none;">${nameText}</a>` : nameText}
          </td>
          <td style="padding:12px 0;border-bottom:1px solid rgba(0,0,0,0.12);font-size:14px;line-height:1.4;text-align:right;white-space:nowrap;">${formatPrice(line.lineTotalOre, false)} kr</td>
        </tr>`;
    })
    .join("");

  const vatRows = vat
    .map(
      (entry) => `<tr>
        <td style="font-size:13px;color:rgba(0,0,0,0.55);padding-top:6px;">Varav moms ${escapeHtml(formatVatRate(entry.taxRate))}</td>
        <td style="font-size:13px;color:rgba(0,0,0,0.55);text-align:right;padding-top:6px;">${formatPrice(entry.taxOre, false)} kr</td>
      </tr>`,
    )
    .join("");

  const detailRow = (label: string, value: string) => `<tr>
        <td style="font-size:13px;color:rgba(0,0,0,0.55);padding-bottom:4px;">${escapeHtml(label)}</td>
        <td style="font-size:13px;text-align:right;padding-bottom:4px;">${escapeHtml(value)}</td>
      </tr>`;

  const html = `<!doctype html>
<html lang="sv">
  <body style="margin:0;padding:0;background:#ffffff;">
    <div style="background:#ffffff;padding:32px 16px;font-family:'Space Grotesk',Helvetica,Arial,sans-serif;color:#000000;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;border-collapse:collapse;">
        <tr>
          <td style="padding-bottom:24px;border-bottom:1px solid #000000;">
            <a href="${storefrontUrl}">
              <img src="https://admin.trancoffeelab.com/logo/tran-wordmark-email.png" alt="TRAN" width="96" style="display:block;height:auto;border:0;" />
            </a>
          </td>
        </tr>
        <tr>
          <td style="padding-top:24px;padding-bottom:4px;">
            <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:rgba(0,0,0,0.55);">
              Kvitto #${input.saleNumber}
            </p>
            <h1 style="margin:6px 0 0;font-size:22px;font-weight:700;text-transform:uppercase;letter-spacing:-0.01em;line-height:1.2;">
              Tack för ditt köp
            </h1>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              ${detailRow("Datum", paidAt)}
              ${detailRow("Försäljningsställe", input.location)}
              ${detailRow("Betalsätt", "Swish")}
            </table>
          </td>
        </tr>
        <tr>
          <td>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-top:1px solid rgba(0,0,0,0.12);">
              ${lineRows}
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding-top:16px;border-top:1px solid #000000;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">Totalt</td>
                <td style="font-size:14px;font-weight:700;text-align:right;">${total} kr</td>
              </tr>
              ${vatRows}
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding-top:32px;font-size:13px;line-height:1.6;color:#000000;">
            ${escapeHtml(closingLine)}
            <br/><br/>
            ${escapeHtml(signature)}<br/>
            <span style="color:rgba(0,0,0,0.55);">TRAN Coffee Lab</span>
          </td>
        </tr>
        <tr>
          <td style="padding-top:24px;margin-top:24px;border-top:1px solid rgba(0,0,0,0.12);font-size:11px;line-height:1.6;color:rgba(0,0,0,0.55);">
            ${escapeHtml(seller.name)} · Org.nr ${escapeHtml(seller.orgNumber)} · Momsreg.nr ${escapeHtml(seller.vatNumber)}<br/>
            ${escapeHtml(seller.address)}
          </td>
        </tr>
      </table>
    </div>
  </body>
</html>`;

  const linesText = input.lines
    .map((line) => `${line.quantity} × ${line.name} - ${formatPrice(line.lineTotalOre, false)} kr`)
    .join("\n");
  const vatText = vat
    .map((entry) => `Varav moms ${formatVatRate(entry.taxRate)}: ${formatPrice(entry.taxOre, false)} kr`)
    .join("\n");
  const text = `Kvitto #${input.saleNumber}\nTack för ditt köp.\n\nDatum: ${paidAt}\nFörsäljningsställe: ${input.location}\nBetalsätt: Swish\n\n${linesText}\n\nTotalt: ${total} kr\n${vatText}\n\n${closingLine}\n\n${signature}\nTRAN Coffee Lab\n\n${seller.name}, org.nr ${seller.orgNumber}, momsreg.nr ${seller.vatNumber}\n${seller.address}`;

  return { subject: `Kvitto #${input.saleNumber} - TRAN Coffee Lab`, text, html };
}

/** Skickar kvittot via Resend - samma avsändare som orderbekräftelsen. */
export async function sendReceiptEmail(input: PosReceiptEmailInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    throw new Error("RESEND_API_KEY/RESEND_FROM_EMAIL saknas - kvittot kan inte skickas.");
  }

  const { subject, text, html } = renderReceiptEmail({
    ...input,
    storefrontUrl: input.storefrontUrl ?? process.env.NEXT_PUBLIC_STOREFRONT_URL,
  });
  const { error } = await new Resend(apiKey).emails.send({ from, to: input.to, subject, text, html });
  if (error) throw new Error(`Kunde inte skicka kvittot: ${error.message}`);
}
