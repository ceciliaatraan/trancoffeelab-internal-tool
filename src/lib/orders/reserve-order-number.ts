import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";

/**
 * Reserverar nästa ordernummer ur orders.order_number-sekvensen redan när
 * kassan öppnas, så det kan skickas till Kustom som merchant_reference1 och
 * följa med till Kustoms portal (och ev. PostNord-bokningen) - ordern får
 * annars sitt nummer först när den sparas efter köpet. Ett avbrutet köp
 * lämnar ett oanvänt nummer (en lucka), precis som sekvensen redan gör i
 * dag. Null om reservationen misslyckas - kassan fortsätter då utan.
 */
export async function reserveOrderNumber(): Promise<number | null> {
  try {
    const result = await db.execute<{ value: string }>(
      sql`select nextval(pg_get_serial_sequence('orders', 'order_number')) as value`,
    );
    const value = Number(result[0]?.value);
    return Number.isSafeInteger(value) ? value : null;
  } catch (err) {
    console.error("Kunde inte reservera ordernummer", err);
    return null;
  }
}
