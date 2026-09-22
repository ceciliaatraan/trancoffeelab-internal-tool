"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireCurrentAdmin } from "@/lib/current-admin";
import { processKustomOrder } from "@/lib/orders/process-kustom-order";
import { describeError } from "@/lib/describe-error";

/**
 * Kör om en order manuellt efter ett misslyckat push/bekräftelse-
 * försök (t.ex. ett tillfälligt Kustom-fel, eller ett fel som nu är
 * fixat i koden - se persist-order.ts locale-fallbacken 2026-09-22).
 * processKustomOrder är idempotent på kustom_order_id
 * (persistOrderFromKustom), så det är ofarligt att köra om - finns
 * ordern redan skapas inget nytt, bara ännu en loggrad. Skriver en NY
 * webhook_events-rad (source: manual_reprocess) i stället för att
 * skriva över den gamla, så historiken över vad som faktiskt hände
 * bevaras.
 */
export async function reprocessWebhookEventAction(eventId: string) {
  await requireCurrentAdmin();

  const [event] = await db
    .select()
    .from(schema.webhookEvents)
    .where(eq(schema.webhookEvents.id, eventId));

  if (!event || !event.kustomOrderId) {
    redirect(`/logs?error=${encodeURIComponent("Ingen order-id att bearbeta om.")}`);
  }

  const [newEvent] = await db
    .insert(schema.webhookEvents)
    .values({
      source: "manual_reprocess",
      kustomOrderId: event.kustomOrderId,
      rawPayload: { reprocessedFromEventId: eventId },
      processed: false,
    })
    .returning({ id: schema.webhookEvents.id });

  try {
    await processKustomOrder(event.kustomOrderId);
    await db
      .update(schema.webhookEvents)
      .set({ processed: true, processedAt: new Date(), errorMessage: null })
      .where(eq(schema.webhookEvents.id, newEvent.id));
  } catch (err) {
    await db
      .update(schema.webhookEvents)
      .set({ processed: false, processedAt: new Date(), errorMessage: describeError(err) })
      .where(eq(schema.webhookEvents.id, newEvent.id));
    redirect(
      `/logs?error=${encodeURIComponent("Bearbetning om misslyckades igen - se den nya raden i loggen för felmeddelandet.")}`,
    );
  }

  revalidatePath("/logs");
  revalidatePath("/orders");
  revalidatePath("/");
  redirect("/logs?saved=1");
}
