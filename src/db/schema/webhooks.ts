import {
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
  boolean,
} from "drizzle-orm/pg-core";

/**
 * Rått, oförändrat innehåll för varje inkommande webhook-anrop, loggat
 * INNAN bearbetning. push-endpointen skriver raden här, svarar 200, och
 * bearbetar sedan asynkront — så ett fel efter mottagandet aldrig tappar
 * bort att anropet skedde.
 */
export const webhookEvents = pgTable("webhook_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  source: text("source").notNull(),
  kustomOrderId: text("kustom_order_id"),
  rawPayload: jsonb("raw_payload").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  processed: boolean("processed").notNull().default(false),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  errorMessage: text("error_message"),
});
webhookEvents.enableRLS();
