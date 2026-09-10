import "server-only";
import { formatOre } from "@/lib/format";
import type { PersistedOrder } from "@/lib/orders/persist-order";

/**
 * SLACK_WEBHOOK_URL är en Slack "Incoming Webhook" — kanalen den postar
 * till väljs när webhooken skapas i Slack, inte här. Se README för hur ni
 * skapar en pekandes på #beställningar.
 *
 * Skickar ALDRIG för playground-ordrar (KUSTOM_ENV !== "live") — annars
 * pingar varje testköp under utveckling kanalen.
 *
 * Fel här kastas ALDRIG vidare — en trasig/saknad Slack-webhook eller ett
 * nätverksfel ska aldrig få en riktig order att misslyckas med att sparas,
 * captureas eller mejla kunden. Loggas bara.
 */
export async function notifyNewOrderInSlack(
  order: PersistedOrder,
  totalOre: number,
): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl || process.env.KUSTOM_ENV !== "live") return;

  const itemsText = order.physicalLines
    .map((line) => `${line.quantity} × ${line.name}`)
    .join("\n");
  const adminUrl = process.env.NEXT_PUBLIC_ADMIN_URL ?? "https://admin.trancoffeelab.com";
  const orderUrl = `${adminUrl.replace(/\/$/, "")}/orders/${order.id}`;

  const payload = {
    text: `🎉 Ny beställning #${order.orderNumber} — ${formatOre(totalOre)}`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `🎉 *Ny beställning #${order.orderNumber}* — ${formatOre(totalOre)}${
            order.containsPreorder ? " _(innehåller förbeställning)_" : ""
          }\n${itemsText}`,
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
