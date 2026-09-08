import "server-only";
import { Resend } from "resend";

export type OrderConfirmationEmailInput = {
  to: string;
  locale: string;
  orderNumber: number;
  totalOre: number;
  /** Bas-URL till kundsajten, för att länka produktbild/namn till produktsidan och loggan till startsidan. Default https://trancoffeelab.com om inte satt (se sendOrderConfirmationEmail). */
  storefrontUrl?: string;
  shipping?: { name: string; amountOre: number } | null;
  lines: {
    name: string;
    quantity: number;
    isPreorder?: boolean;
    expectedShipDate?: string | null;
    /** Produktbild — visas bara om satt, se docstringen på renderEmail. */
    imageUrl?: string | null;
    /** Radens totalpris (kvantitet × pris), inte à-pris. Visas bara om satt. */
    lineTotalOre?: number;
    /** Produktens slug på trancoffeelab.com — bild/namn länkas dit om satt. */
    slug?: string | null;
  }[];
};

/** "Beräknad leverans: ‹månad/period›" — aldrig ett exakt datumlöfte. */
function formatShipPeriod(expectedShipDate: string | null | undefined, isEnglish: boolean): string {
  const date = expectedShipDate ? new Date(expectedShipDate) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return isEnglish ? "to be announced" : "meddelas senare";
  }
  return new Intl.DateTimeFormat(isEnglish ? "en-US" : "sv-SE", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function formatPrice(ore: number, isEnglish: boolean): string {
  return (ore / 100).toLocaleString(isEnglish ? "en-US" : "sv-SE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Skrivet som handskriven, inline-stylad HTML (inte JSX/Tailwind) — det
 * enda som fungerar tillförlitligt över e-postklienter, som inte kör
 * någon byggprocess och ofta saknar stöd för <style>/flexbox/grid
 * (särskilt Outlook). Speglar adminets hairline/versal-formspråk
 * (docs/branding.md) så långt e-postklienter tillåter.
 */
export function renderEmail(input: OrderConfirmationEmailInput): {
  subject: string;
  text: string;
  html: string;
} {
  const isEnglish = input.locale.toLowerCase().startsWith("en");
  const total = formatPrice(input.totalOre, isEnglish);
  const storefrontUrl = (input.storefrontUrl ?? "https://trancoffeelab.com").replace(/\/$/, "");
  const productPathSegment = isEnglish ? "product" : "produkt";

  function productUrl(slug: string | null | undefined): string | null {
    return slug ? `${storefrontUrl}/${productPathSegment}/${encodeURIComponent(slug)}` : null;
  }

  const hasPreorder = input.lines.some((line) => line.isPreorder);
  const hasInStock = input.lines.some((line) => !line.isPreorder);
  const mixed = hasPreorder && hasInStock;

  // Blandade ordrar (förbeställning + lagervara) förklaras rad för rad
  // nedan — klumpas ALDRIG ihop som ett generellt "skickas senare".
  const lines = input.lines
    .map((line) => {
      const withPrice =
        line.lineTotalOre === undefined
          ? `${line.quantity} × ${line.name}`
          : `${line.quantity} × ${line.name} — ${formatPrice(line.lineTotalOre, isEnglish)} kr`;
      if (!line.isPreorder) return withPrice;
      const period = formatShipPeriod(line.expectedShipDate, isEnglish);
      return isEnglish
        ? `${withPrice} — preorder, estimated ship: ${period}`
        : `${withPrice} — förbeställning, beräknad leverans: ${period}`;
    })
    .join("\n");

  const intro = isEnglish
    ? mixed
      ? "Your order contains both in-stock items and a preorder. The in-stock items ship as usual. The preorder has been charged now and ships separately once it's in stock — see the estimated ship date per line below."
      : hasPreorder
        ? "This is a preorder. You've been charged now — the item ships once it's in stock, see the estimated ship date below."
        : "Thank you for your order."
    : mixed
      ? "Din order innehåller både lagervaror och en förbeställning. Lagervarorna skickas som vanligt. Förbeställningen är betald nu och skickas separat när den finns i lager — se beräknad leverans per rad nedan."
      : hasPreorder
        ? "Det här är en förbeställning. Du har betalat nu — varan skickas när den finns i lager, se beräknad leverans nedan."
        : "Tack för din beställning.";

  const heading = isEnglish ? "Thank you for your order" : "Tack för din beställning";
  const orderLabel = isEnglish ? "Order confirmation" : "Orderbekräftelse";
  const totalLabel = isEnglish ? "Total" : "Totalt";
  const preorderLabel = isEnglish ? "Preorder" : "Förbeställning";
  const shipLabel = isEnglish ? "Estimated ship" : "Beräknad leverans";
  const shippingLabel = isEnglish ? "Shipping" : "Frakt";
  const freeShippingLabel = isEnglish ? "Free shipping" : "Fri frakt";
  /**
   * `shipping` är null (inte undefined) för en riktig order utan
   * fraktkostnad — Kustom fick då ingen shipping_fee-rad alls (t.ex.
   * gränsen för fri frakt uppnådd, se checkout/session/route.ts). En
   * rad på exakt 0 kr räknas likadant. undefined betyder att anroparen
   * inte skickat med fraktinfo alls (äldre anrop/tester) — då visas
   * ingen rad, för att inte ljuga om en order vi inte vet något om.
   */
  function shippingValueText(shipping: { amountOre: number } | null): string {
    if (!shipping || shipping.amountOre === 0) return freeShippingLabel;
    return `${formatPrice(shipping.amountOre, isEnglish)} kr`;
  }
  const closingLine = isEnglish
    ? "Thank you for helping us spread Vietnamese coffee across Sweden."
    : "Tack för att ni är med och sprider vietnamesiskt kaffe i Sverige.";
  const signature = "Cecilia Tran & Winnie Tran";

  const lineRows = input.lines
    .map((line) => {
      const period = line.isPreorder ? formatShipPeriod(line.expectedShipDate, isEnglish) : null;
      const priceCell =
        line.lineTotalOre === undefined
          ? ""
          : `<td style="padding:12px 0;border-bottom:1px solid rgba(0,0,0,0.12);font-size:14px;line-height:1.4;text-align:right;white-space:nowrap;">${formatPrice(line.lineTotalOre, isEnglish)} kr</td>`;
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
            ${
              period
                ? `<br/><span style="display:inline-block;margin-top:4px;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#EB1C24;">${escapeHtml(preorderLabel)} — ${escapeHtml(shipLabel)}: ${escapeHtml(period)}</span>`
                : ""
            }
          </td>
          ${priceCell}
        </tr>`;
    })
    .join("");

  const shippingRow =
    input.shipping === undefined
      ? ""
      : `<tr>
        <td style="font-size:13px;color:rgba(0,0,0,0.55);padding-bottom:6px;">${escapeHtml(shippingLabel)}</td>
        <td style="font-size:13px;color:rgba(0,0,0,0.55);text-align:right;padding-bottom:6px;">${escapeHtml(shippingValueText(input.shipping))}</td>
      </tr>`;

  const html = `<!doctype html>
<html lang="${isEnglish ? "en" : "sv"}">
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
              ${escapeHtml(orderLabel)} #${input.orderNumber}
            </p>
            <h1 style="margin:6px 0 0;font-size:22px;font-weight:700;text-transform:uppercase;letter-spacing:-0.01em;line-height:1.2;">
              ${escapeHtml(heading)}
            </h1>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 0;font-size:14px;line-height:1.5;color:#000000;">
            ${escapeHtml(intro)}
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
              ${shippingRow}
              <tr>
                <td style="font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">${escapeHtml(totalLabel)}</td>
                <td style="font-size:14px;font-weight:700;text-align:right;">${total} kr</td>
              </tr>
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
      </table>
    </div>
  </body>
</html>`;

  const footer = `${closingLine}\n\n${signature}\nTRAN Coffee Lab`;
  const shippingText =
    input.shipping === undefined ? "" : `${shippingLabel}: ${shippingValueText(input.shipping)}\n`;

  if (isEnglish) {
    return {
      subject: `Order confirmation #${input.orderNumber} — TRAN Coffee Lab`,
      text: `${intro}\n\nOrder #${input.orderNumber}\n\n${lines}\n\n${shippingText}Total: ${total} kr\n\n${footer}`,
      html,
    };
  }

  return {
    subject: `Orderbekräftelse #${input.orderNumber} — TRAN Coffee Lab`,
    text: `${intro}\n\nOrder #${input.orderNumber}\n\n${lines}\n\n${shippingText}Totalt: ${total} kr\n\n${footer}`,
    html,
  };
}

/**
 * RESEND_FROM_EMAIL måste vara en avsändaradress på en domän som är
 * verifierad i ert Resend-konto — annars avvisas mejlet av Resend.
 * Ingen adress gissas här.
 */
export async function sendOrderConfirmationEmail(
  input: OrderConfirmationEmailInput,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !from) {
    throw new Error(
      "RESEND_API_KEY/RESEND_FROM_EMAIL saknas. Kopiera .env.example till .env.local.",
    );
  }

  const resend = new Resend(apiKey);
  const storefrontUrl = input.storefrontUrl ?? process.env.NEXT_PUBLIC_STOREFRONT_URL;
  const { subject, text, html } = renderEmail({ ...input, storefrontUrl });

  const { error } = await resend.emails.send({
    from,
    to: input.to,
    subject,
    text,
    html,
  });

  if (error) {
    throw new Error(`Kunde inte skicka orderbekräftelse: ${error.message}`);
  }
}
