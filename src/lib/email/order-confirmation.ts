import "server-only";
import { Resend } from "resend";

export type OrderConfirmationEmailInput = {
  to: string;
  locale: string;
  orderNumber: number;
  totalOre: number;
  lines: {
    name: string;
    quantity: number;
    isPreorder?: boolean;
    expectedShipDate?: string | null;
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

export function renderEmail(input: OrderConfirmationEmailInput): {
  subject: string;
  text: string;
} {
  const isEnglish = input.locale.toLowerCase().startsWith("en");
  const total = (input.totalOre / 100).toLocaleString(isEnglish ? "en-US" : "sv-SE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const hasPreorder = input.lines.some((line) => line.isPreorder);
  const hasInStock = input.lines.some((line) => !line.isPreorder);
  const mixed = hasPreorder && hasInStock;

  // Blandade ordrar (förbeställning + lagervara) förklaras rad för rad
  // nedan — klumpas ALDRIG ihop som ett generellt "skickas senare".
  const lines = input.lines
    .map((line) => {
      const base = `${line.quantity} × ${line.name}`;
      if (!line.isPreorder) return base;
      const period = formatShipPeriod(line.expectedShipDate, isEnglish);
      return isEnglish
        ? `${base} — preorder, estimated ship: ${period}`
        : `${base} — förbeställning, beräknad leverans: ${period}`;
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

  if (isEnglish) {
    return {
      subject: `Order confirmation #${input.orderNumber} — TRAN Coffee Lab`,
      text: `${intro}\n\nOrder #${input.orderNumber}\n\n${lines}\n\nTotal: ${total} kr\n\n— TRAN Coffee Lab`,
    };
  }

  return {
    subject: `Orderbekräftelse #${input.orderNumber} — TRAN Coffee Lab`,
    text: `${intro}\n\nOrder #${input.orderNumber}\n\n${lines}\n\nTotalt: ${total} kr\n\n— TRAN Coffee Lab`,
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
  const { subject, text } = renderEmail(input);

  const { error } = await resend.emails.send({
    from,
    to: input.to,
    subject,
    text,
  });

  if (error) {
    throw new Error(`Kunde inte skicka orderbekräftelse: ${error.message}`);
  }
}
