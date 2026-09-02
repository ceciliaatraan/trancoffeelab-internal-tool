import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

declare global {
  var __trancoffeelabClient: ReturnType<typeof postgres> | undefined;
}

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL saknas. Kopiera .env.example till .env.local.");
}

// Återanvänd samma anslutning mellan hot reloads i dev.
const client =
  global.__trancoffeelabClient ??
  postgres(connectionString, { prepare: false });

if (process.env.NODE_ENV !== "production") {
  global.__trancoffeelabClient = client;
}

export const db = drizzle(client, { schema });
export { schema };
