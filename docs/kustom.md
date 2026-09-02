# Kustom Checkout-integration

Det här dokumentet listar exakt vilka fältnamn och statusvärden som är
**bekräftade** (antingen ur AGENTS.md-specen, som räknas som facit här,
eller ur dokumentationstext ni klistrat in från docs.kustom.co) kontra
**overifierade**. Nätverksåtkomst till docs.kustom.co/api.playground.kustom.co
är blockerad av sandboxens egress-policy under utveckling (samma
begränsning som för trancoffeelab.com i fas 1, se docs/branding.md) —
därför är vissa delar fortfarande inte kunnat läsas av direkt.

Skriv INTE av ett antagande här som om det vore bekräftat. Allt i
"Overifierat"-sektionen måste stämmas av innan produktion.

## Bekräftat

### Från AGENTS.md

- Auth: HTTP Basic. Två format stöds via `buildKustomAuthHeader`
  (`src/lib/kustom/auth.ts`): `base64(<nyckel>:)` (nyckeln som eget
  användarnamn, standard) eller `base64(<username>:<nyckel>)` när
  `KUSTOM_BASIC_AUTH_USERNAME` är satt.
- Base URL playground: `https://api.playground.kustom.co`
- Base URL produktion: `https://api.kustom.co`
- `createOrder`: `POST /checkout/v3/orders`
- `readOrder`: `GET /checkout/v3/orders/{order_id}`
- `updateOrder`: `POST /checkout/v3/orders/{order_id}` — går enligt spec
  bara medan `status` är `checkout_incomplete`.
- `merchant_urls.push`:
  `https://admin.trancoffeelab.com/api/kustom/push?order_id={checkout.order.id}`
  — `order_id` kommer som query-parameter, mallad av Kustom.
- `merchant_urls.validation`: `https://admin.trancoffeelab.com/api/kustom/validate`

### Från er inklistrade dokumentation (Order validation-referensen)

- **Validation-endpointen: `POST {merchant_urls.validation}`.** Kustom
  POSTar HELA orderrepresentationen som JSON-body — inte bara ett
  order-id. Vi läser `order_lines[]` direkt ur den bodyn
  (`src/app/api/kustom/validate/route.ts`), vilket är annorlunda än
  push (se nedan) där spec uttryckligen säger att bodyn INTE ska
  litas på.
- **Avslag = HTTP 400** med body
  `{ error_type: "unsupported_shipping_address" | "address_error" | "approval_failed", error_text: string }`.
- **Godkännande** = vilket icke-400-svar som helst (troligen 200; inga
  obligatoriska svarsfält dokumenterade). Vi svarar tom 200.
- `order_lines[].type` — fullständig enum bekräftad: `physical`,
  `discount`, `shipping_fee`, `sales_tax`, `digital`, `gift_card`,
  `store_credit`, `surcharge`. Vi använder bara `physical`,
  `shipping_fee`, `discount` (matchar AGENTS.md).
- `order_lines[].tax_rate`: "Non-negative... two implicit decimals...
  max 10000" — bekräftar hundradels-procent-representationen.
- `order_lines[].total_tax_amount`: **"Must be within ±1 of
  `total_amount - total_amount * 10000 / (10000 + tax_rate)`. Negative
  when type is discount."** Detta är EXAKT samma formel som
  `calculateTaxFromGross` i `src/lib/kustom/tax.ts` räknar ut
  (`taxAmount = gross - round(gross*10000/(10000+taxRate))`) —
  oberoende bekräftelse att momsuträkningen är rätt.
- `order_lines[].total_discount_amount`: "Non-negative... Includes tax"
  — alltså alltid ett positivt belopp (per-rad-rabatt), skilt från vår
  fristående `discount`-radtyp.
- Statusexempel i dokumentationen: `"CHECKOUT_INCOMPLETE"` (versaler) —
  observera skillnaden mot AGENTS.md:s `checkout_incomplete`
  (gemener). Vi behandlar `status`/`payment_status` som fritext i
  databasen just för att undvika att låsa fast fel skiftläge/värde.
- `options.require_validate_callback_success` (boolean, default false)
  finns som inställning på ordern — vi sätter den INTE explicit i vår
  payload än (default-beteendet gäller). Se öppna punkter nedan.

## Overifierat — måste stämmas av innan produktion

1. **Order Management API — konkreta endpoints för capture/refund/
   cancel/acknowledge.** Er inklistrade text var översiktssidan ("What
   is Order Management") som beskriver konceptet och att det finns en
   "Order management API" och en "Kustom-portal" — inte själva
   API-referensen med paths/metoder/scheman. `src/lib/kustom/client.ts`
   innehåller därför INTE dessa anrop än. Push-endpointens krav
   "bekräfta ordern mot Kustoms Order Management API när vi sparat den"
   är därför inte implementerat.
2. **Fullständig lista över `status`-värden** utöver
   `checkout_incomplete`/`CHECKOUT_INCOMPLETE`. Vi vet fortfarande inte
   exakt vilket värde som betyder "klar/betald".
3. **Push-endpointens exakta kontrakt** (GET eller POST, förväntat
   svar). Mindre kritiskt eftersom spec redan säger att vi ska läsa
   ordern via `readOrder(order_id)` snarare än lita på push-bodyn, men
   fortfarande obekräftat.
4. **Exakt fältnamn för order-id i svaret från `createOrder`/
   `readOrder`.** `extractOrderId` provar `order_id` sedan `id` och
   kastar tydligt om inget hittas.
5. **Kundens e-post/adress-struktur i orderobjektet** (för
   `orders.customer_email`/adressfälten när push byggs). Validation-
   dokumentationen visar en trolig struktur (`billing_address.email`
   m.fl.) men det är request-schemat för validate, inte nödvändigtvis
   identiskt med vad `readOrder` returnerar.
6. **Vilket Basic-auth-format er faktiska nyckel kräver.**

## Designbeslut som INTE kommer från Kustom-dokumentationen

- **`error_type` vid slut-i-lager-avslag.** Ingen av de tre tillåtna
  värdena (`unsupported_shipping_address`/`address_error`/
  `approval_failed`) betyder uttryckligen "slut i lager". Vi använder
  `approval_failed` som mest generella alternativet.
  `src/app/api/kustom/validate/route.ts`.
- **Rabattradens momssats.** Ett kvantitetsviktat snitt av kundvagnens
  rader (`weightedAverageTaxRate` i
  `src/app/api/public/checkout/session/route.ts`) — inte hämtat från
  Kustom.
- **Frakt saknas i checkout-session helt.** Ingen fraktinställning
  finns i datamodellen än. `POST /api/public/checkout/session` skapar
  därför ordrar UTAN `shipping_fee`-rad tills en fraktkostnad/-policy
  är bestämd.

## Status i koden

| Del | Status |
| --- | --- |
| `lib/kustom/auth.ts` (Basic-auth-header) | Klar, testad |
| `lib/kustom/tax.ts` (moms bakvägs) | Klar, testad — formeln oberoende bekräftad mot er dokumentation |
| `lib/kustom/order-payload.ts` (orderrader/payload, inkl. `merchant_urls.validation`) | Klar, testad |
| `lib/kustom/client.ts` — createOrder/readOrder/updateOrder | Klar, testad (mockat fetch) |
| `lib/kustom/client.ts` — Order Management (capture/refund/cancel) | **Saknas — väntar på punkt 1 ovan** |
| `POST /api/public/cart/validate` | Klar, verifierad mot riktig Postgres |
| `POST /api/public/checkout/session` | Klar (utan frakt), verifierad mot riktig Postgres — anropet till Kustoms API kunde inte slutverifieras live (nätverksbegränsning) |
| `POST /api/kustom/validate` | **Klar, verifierad mot riktig Postgres** (godkänn/neka/okänd SKU/icke-fysisk rad) |
| `POST /api/kustom/push` | **Saknas — väntar på punkt 1, 2, 5 ovan** |
| `GET /api/public/checkout/[orderId]/confirmation` | Saknas — beror på push/orders-modellen ovan |
