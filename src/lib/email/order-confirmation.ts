import "server-only";
import { Resend } from "resend";

export type OrderConfirmationEmailInput = {
  to: string;
  locale: string;
  orderNumber: number;
  totalOre: number;
  lines: { name: string; quantity: number }[];
};

export function renderEmail(input: OrderConfirmationEmailInput): {
  subject: string;
  text: string;
} {
  const isEnglish = input.locale.toLowerCase().startsWith("en");
  const total = (input.totalOre / 100).toLocaleString(isEnglish ? "en-US" : "sv-SE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const lines = input.lines.map((line) => `${line.quantity} × ${line.name}`).join("\n");

  if (isEnglish) {
    return {
      subject: `Order confirmation #${input.orderNumber} — TRAN Coffee Lab`,
      text: `Thank you for your order.\n\nOrder #${input.orderNumber}\n\n${lines}\n\nTotal: ${total} kr\n\n— TRAN Coffee Lab`,
    };
  }

  return {
    subject: `Orderbekräftelse #${input.orderNumber} — TRAN Coffee Lab`,
    text: `Tack för din beställning.\n\nOrder #${input.orderNumber}\n\n${lines}\n\nTotalt: ${total} kr\n\n— TRAN Coffee Lab`,
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
