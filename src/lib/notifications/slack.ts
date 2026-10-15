import "server-only";
import { formatOre } from "@/lib/format";
import { paymentMethodLabel } from "@/lib/kassa/options";
import type { PersistedOrder } from "@/lib/orders/persist-order";

/**
 * "Förnamn Efternamn (e-post)" - faller tillbaka till bara namnet eller
 * bara e-posten om det andra saknas, null om inget alls finns. Ren
 * funktion (inget Kustom-beroende) så den kan testas för sig.
 */
export function formatCustomerLabel(
  givenName: string | null | undefined,
  familyName: string | null | undefined,
  email: string | null | undefined,
): string | null {
  const name = [givenName, familyName].filter(Boolean).join(" ").trim();
  if (name && email) return `${name} (${email})`;
  return name || email || null;
}

/**
 * SLACK_WEBHOOK_URL är en Slack "Incoming Webhook" - kanalen den postar
 * till väljs när webhooken skapas i Slack, inte här. Se README för hur ni
 * skapar en pekandes på #beställningar.
 *
 * Skickar ALDRIG för playground-ordrar (KUSTOM_ENV !== "live") - annars
 * pingar varje testköp under utveckling kanalen.
 *
 * Fel här kastas ALDRIG vidare - en trasig/saknad Slack-webhook eller ett
 * nätverksfel ska aldrig få en riktig order att misslyckas med att sparas,
 * captureas eller mejla kunden. Loggas bara.
 */
export async function notifyNewOrderInSlack(
  order: PersistedOrder,
  totalOre: number,
  /** Kundens namn och/eller e-post, redan formaterat av anroparen (t.ex. "Cecilia Tran (cecilia@example.com)"). null om inget av det finns. */
  customer: string | null,
): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl || process.env.KUSTOM_ENV !== "live") return;

  const itemsText = order.physicalLines
    .map((line) => `${line.quantity} × ${line.name}`)
    .join("\n");
  // totalOre kommer redan rabatterad från Kustom (order_amount är beloppet
  // som faktiskt debiteras - original_order_amount vore pre-rabatt-referensen,
  // men den används inte här), så priset i notisen är alltid det kunden
  // faktiskt betalade/checkade ut med.
  const discountText = order.discount
    ? `🏷️ Rabattkod ${order.discount.code} (−${formatOre(order.discount.amountOre)})\n`
    : "";
  const adminUrl = process.env.NEXT_PUBLIC_ADMIN_URL ?? "https://admin.trancoffeelab.com";
  const orderUrl = `${adminUrl.replace(/\/$/, "")}/orders/${order.id}`;

  const payload = {
    text: `🎉 Ny beställning #${order.orderNumber} - ${formatOre(totalOre)}`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `🎉 *Ny beställning #${order.orderNumber}* - ${formatOre(totalOre)}${
            order.containsPreorder ? " _(innehåller förbeställning)_" : ""
          }\n${customer ? `👤 ${customer}\n` : ""}${discountText}${itemsText}`,
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "Visa order" },
            url: orderUrl,
          },
        ],
      },
    ],
  };

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      console.error("Slack-notis misslyckades", response.status, await response.text());
    }
  } catch (err) {
    console.error("Slack-notis misslyckades", err);
  }
}

export type PosSaleForSlack = {
  saleNumber: number;
  totalOre: number;
  /** Försäljningsställets namn. */
  location: string;
  note: string | null;
  paymentMethod: string;
  soldByEmail: string | null;
  /** Kundens namn, om kassabiträdet skrev in det. */
  customerName?: string | null;
  lines: { name: string; quantity: number }[];
};

/** Notistexten för en betald kassaförsäljning - ren funktion, testas för sig. */
export function formatPosSaleSlackText(sale: PosSaleForSlack): string {
  const place = sale.note ? `${sale.location} - ${sale.note}` : sale.location;
  const items = sale.lines.map((line) => `${line.quantity} × ${line.name}`).join("\n");
  const customer = sale.customerName ? `\n👤 ${sale.customerName}` : "";
  const seller = sale.soldByEmail ? `\n🧑‍🍳 Såld av ${sale.soldByEmail}` : "";
  return `🧾 *Kassa #${sale.saleNumber}* - ${formatOre(sale.totalOre)} (${paymentMethodLabel(
    sale.paymentMethod,
  )})${customer}\n📍 ${place}${seller}\n${items}`;
}

/**
 * Slack-notis när en kassaförsäljning markerats som betald. Samma regler
 * som notifyNewOrderInSlack: bara i live-miljön, och ett fel kastas aldrig
 * vidare - försäljningen är redan sparad.
 */
export async function notifyPosSaleInSlack(sale: PosSaleForSlack): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl || process.env.KUSTOM_ENV !== "live") return;

  const text = formatPosSaleSlackText(sale);
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `🧾 Kassa #${sale.saleNumber} - ${formatOre(sale.totalOre)}`,
        blocks: [{ type: "section", text: { type: "mrkdwn", text } }],
      }),
    });
    if (!response.ok) {
      console.error("Slack-notis (kassa) misslyckades", response.status, await response.text());
    }
  } catch (err) {
    console.error("Slack-notis (kassa) misslyckades", err);
  }
}
