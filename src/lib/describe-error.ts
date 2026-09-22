/**
 * Drizzle wrappar databasfel i en DrizzleQueryError vars `.message` bara
 * är "Failed query: <sql>\nparams: <params>" - den FAKTISKA Postgres-
 * felorsaken (t.ex. "null value in column ... violates not-null
 * constraint") ligger i `.cause`, inte `.message`. Utan den här
 * uppackningen loggade webhook_events.error_message bara SQL-frågan om
 * och om igen, aldrig anledningen till att den misslyckades - omöjligt
 * att felsöka i efterhand. Används av push/confirmation-webhookarnas
 * felhantering.
 */
export function describeError(err: unknown): string {
  if (!(err instanceof Error)) return "Okänt fel";
  const cause = err.cause;
  if (cause instanceof Error && cause.message && cause.message !== err.message) {
    return `${err.message}\n\norsak: ${cause.message}`;
  }
  return err.message;
}
