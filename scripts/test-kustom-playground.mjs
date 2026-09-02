#!/usr/bin/env node
/**
 * Fristående test mot Kustoms playground-API — skapar EN riktig
 * checkout-order med testdata och skriver ut det råa svaret.
 *
 * Använder den riktiga payload-byggaren och auth-header-hjälparen från
 * appen (src/lib/kustom/order-payload.ts och auth.ts) så testet
 * verifierar samma kod som körs i produktion — men gör själva
 * HTTP-anropet direkt i den här filen (inte via lib/kustom/client.ts)
 * för att slippa Next.js-specifika serverkrav och köras med bara Node.
 *
 * Körs INTE mot databasen och kräver ingen Supabase-uppkoppling —
 * bara ett Kustom playground-konto.
 *
 * Användning:
 *   KUSTOM_API_BASE_URL=https://api.playground.kustom.co \
 *   KUSTOM_API_KEY=kco_test_api_... \
 *   pnpm exec tsx scripts/test-kustom-playground.mjs
 *
 * Valfritt: KUSTOM_BASIC_AUTH_USERNAME om er nyckel kräver
 * användarnamn:nyckel-formatet i stället för nyckeln som eget
 * användarnamn (se docs/kustom.md).
 */
import { buildKustomAuthHeader } from "../src/lib/kustom/auth.ts";
import { buildCreateOrderPayload } from "../src/lib/kustom/order-payload.ts";

const baseUrl = process.env.KUSTOM_API_BASE_URL;
const apiKey = process.env.KUSTOM_API_KEY;
const username = process.env.KUSTOM_BASIC_AUTH_USERNAME || undefined;

if (!baseUrl || !apiKey) {
  console.error("Saknar KUSTOM_API_BASE_URL och/eller KUSTOM_API_KEY. Se filens header för exempel.");
  process.exit(1);
}

const payload = buildCreateOrderPayload({
  items: [
    {
      sku: "TEST-SKU-250",
      nameSv: "Testkaffe 250g",
      nameEn: "Test coffee 250g",
      quantity: 1,
      unitPriceOre: 14900,
      taxRateHundredthsPercent: 1200,
    },
  ],
  locale: "sv-SE",
  merchantUrls: {
    terms: "https://trancoffeelab.com/villkor",
    checkout: "https://trancoffeelab.com/checkout",
    confirmation: "https://trancoffeelab.com/tack?order_id={checkout.order.id}",
    // Placeholder-URL:er — det här scriptet slutför ingen riktig
    // betalning i iframen, så push/validate anropas aldrig av Kustom.
    push: "https://example.com/api/kustom/push?order_id={checkout.order.id}",
    validation: "https://example.com/api/kustom/validate",
  },
});

console.log(`POST ${baseUrl}/checkout/v3/orders\n`);
console.log("--- Payload som skickas ---");
console.log(JSON.stringify(payload, null, 2));

let response;
try {
  response = await fetch(`${baseUrl.replace(/\/$/, "")}/checkout/v3/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: buildKustomAuthHeader({ apiKey, username }),
    },
    body: JSON.stringify(payload),
  });
} catch (err) {
  console.error("\nNätverksanropet misslyckades (kunde inte nå Kustom alls):");
  console.error(err.cause ?? err);
  process.exit(1);
}

const text = await response.text();
let body;
try {
  body = JSON.parse(text);
} catch {
  body = text;
}

console.log(`\n--- Svar: HTTP ${response.status} ---`);
console.log(typeof body === "string" ? body : JSON.stringify(body, null, 2));

if (!response.ok) {
  console.error("\nAnropet misslyckades — se felmeddelandet ovan.");
  process.exit(1);
}

console.log("\n--- Tolkning ---");
const orderId = body.order_id ?? body.id;
console.log(
  orderId
    ? `order_id/id hittades: "${orderId}" (fältnamn: ${body.order_id ? "order_id" : "id"})`
    : "VARNING: varken order_id eller id hittades i svaret.",
);
console.log(
  typeof body.html_snippet === "string"
    ? `html_snippet hittades (${body.html_snippet.length} tecken).`
    : "VARNING: html_snippet hittades inte i svaret.",
);
if (body.status) {
  console.log(`status: "${body.status}"`);
}
