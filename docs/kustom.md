# Kustom Checkout-integration

Det här dokumentet listar exakt vilka fältnamn och statusvärden som är
**bekräftade** (ur AGENTS.md-specen, ur dokumentation/OpenAPI-spec ni
klistrat in från docs.kustom.co, eller ur ett riktigt liveanrop mot
playground) kontra **overifierade**. Nätverksåtkomst till docs.kustom.co/
api.playground.kustom.co är blockerad av sandboxens egress-policy under
utveckling (samma begränsning som för trancoffeelab.com i fas 1, se
docs/branding.md) — koden har därför testats mot en riktig Kustom-miljö
genom att NI kört `pnpm test:kustom` lokalt och skickat hit resultatet,
inte av Claude direkt.

Skriv INTE av ett antagande här som om det vore bekräftat. Allt i
"Overifierat"-sektionen måste stämmas av innan produktion.

## Bekräftat

### Auth-format — uppdaterat 2026-09-04 (ny nyckel)

Den nyckel som testades 2026-09-02 (se nedan) slutade fungera (401 på
alla anrop, både lokalt och i produktion) och ersattes 2026-09-04 med
en ny nyckel från Kustom Playground. **Den nya nyckeln kräver DET ANDRA
formatet**, till skillnad från den gamla:

- **`base64(<username>:<nyckel>)`, med `KUSTOM_BASIC_AUTH_USERNAME`
  satt till nyckelns "Key ID" från Kustom Playground-gränssnittet** —
  bekräftat med ett lyckat `201`-svar (order skapad) 2026-09-04.
- Slutsats: vilket av de två formaten som krävs verkar bero på den
  specifika nyckeln/kontot, inte vara en global konstant för alla
  Kustom-konton. Anta INTE att en ny nyckel automatiskt fungerar med
  samma format som en tidigare — testa alltid båda vid en nyckelrotation
  (se `scripts/test-kustom-playground.mjs`, kör en gång med
  `KUSTOM_BASIC_AUTH_USERNAME` satt och en gång utan).

### Live mot playground (kört av er, 2026-09-02, `pnpm test:kustom` — gammal nyckel, se ovan)

`POST /checkout/v3/orders` med vår riktiga payload-byggare gav ett lyckat
svar (order skapad) med den nyckel som var aktiv då. Det här bekräftar
fortfarande (oberoende av vilket auth-format som råkar krävas):

- **Order-id-fältet i svaret heter `order_id`**, inte `id` — t.ex.
  `"f949a813-c5b3-2b3b-ad40-04d2584eb641"`. `extractOrderId`
  (`src/lib/kustom/client.ts`) provar `order_id` först så den fungerar
  redan korrekt, men vi vet nu att fallbacken till `id` aldrig kommer
  att behövas i praktiken.
- **`html_snippet` finns i svaret** från `createOrder` (bekräftat
  4624 tecken lång HTML/JS för Kustoms checkout-iframe).
- **`status: "checkout_incomplete"`** (gemener) bekräftat som det
  faktiska värdet direkt efter att en order skapats — matchar
  AGENTS.md, inte valideringsdokumentationens versala exempel
  (`"CHECKOUT_INCOMPLETE"`), som alltså bara var ett dokumentations-
  exempel och inte det riktiga värdet.

### Checkout v3 API (från AGENTS.md)

- Auth: HTTP Basic. Två format stöds via `buildKustomAuthHeader`
  (`src/lib/kustom/auth.ts`): `base64(<nyckel>:)` (nyckeln som eget
  användarnamn, utan `KUSTOM_BASIC_AUTH_USERNAME`) eller
  `base64(<username>:<nyckel>)` när `KUSTOM_BASIC_AUTH_USERNAME` är
  satt — **vilket av de två som krävs beror på den specifika nyckeln,
  se "Auth-format — uppdaterat 2026-09-04" ovan. Anta inte ett format,
  testa.**
- Base URL playground: `https://api.playground.kustom.co`. Produktion:
  `https://api.kustom.co` (bekräftat även i Order Management-specens
  `servers`-fält).
- `createOrder`: `POST /checkout/v3/orders` — **bekräftat fungerande
  live, se ovan.**
- `readOrder`: `GET /checkout/v3/orders/{order_id}`
- `updateOrder`: `POST /checkout/v3/orders/{order_id}` — går bara medan
  `status` är `checkout_incomplete`.
- `merchant_urls.push`:
  `.../api/kustom/push?order_id={checkout.order.id}` — `order_id` som
  query-parameter.
- `merchant_urls.validation`: `.../api/kustom/validate`

### Order validation (er inklistrade dokumentationstext)

- **`POST {merchant_urls.validation}`.** Kustom POSTar HELA
  orderrepresentationen som JSON-body — vi läser `order_lines[]` direkt
  ur den bodyn (`src/app/api/kustom/validate/route.ts`), till skillnad
  från push där bodyn INTE litas på.
- **Avslag = HTTP 400** med
  `{ error_type: "unsupported_shipping_address" | "address_error" | "approval_failed", error_text }`.
  **Godkännande** = valfritt icke-400-svar (vi svarar tom 200).
- `order_lines[].total_tax_amount`: **"Must be within ±1 of
  `total_amount - total_amount * 10000 / (10000 + tax_rate)`."** —
  exakt samma formel `calculateTaxFromGross` (`src/lib/kustom/tax.ts`)
  räknar ut. Oberoende bekräftelse att momsuträkningen är rätt.

### Order Management API (er inklistrade OpenAPI-specifikation)

Fullständig, maskinläsbar specifikation — alla nedanstående är därför
högt tillförlitliga, implementerade i `src/lib/kustom/client.ts`:

- `GET /ordermanagement/v1/orders/{order_id}` — `getOrderManagementOrder`.
  **`status`-enum bekräftad:** `AUTHORIZED`, `PART_CAPTURED`,
  `CAPTURED`, `CANCELLED`, `EXPIRED`, `CLOSED`. `AUTHORIZED` tolkas som
  "betalning godkänd, redo att reservera lager" — det är statusen en
  ny order har direkt efter att kunden slutfört Kustoms checkout-flöde.
- `POST /ordermanagement/v1/orders/{order_id}/acknowledge` — 204.
  Måste anropas för varje ny order (annars flaggas den som väntande
  hos Kustom). Detta ÄR "bekräfta ordern mot Kustoms Order Management
  API" från spec.
- `POST /ordermanagement/v1/orders/{order_id}/captures` — body
  `{ captured_amount, description?, reference?, order_lines?, ... }`,
  201 vid lyckat anrop. Alla Order Management-POST-anrop stöder en
  valfri `Klarna-Idempotency-Key`-header, som våra klientfunktioner
  skickar med när ett värde ges.
- `POST /ordermanagement/v1/orders/{order_id}/refunds` — body
  `{ refunded_amount, description?, reference?, order_lines? }`, 201.
- `POST /ordermanagement/v1/orders/{order_id}/cancel` — 204. Nekas
  (403 `CANCEL_NOT_ALLOWED`) om ordern redan har captures eller är
  stängd.
- Adressfält (`billing_address`/`shipping_address`) bekräftade:
  `given_name`, `family_name`, `email`, `phone`, `street_address`,
  `postal_code`, `city`, `region`, `country`, m.fl. — används för
  `orders.customer_email`/adressfälten i `persistOrderFromKustom`.
- `order_lines[].type`-enum (Order Management-varianten) bekräftad:
  `physical`, `discount`, `shipping_fee`, `sales_tax`, `store_credit`,
  `gift_card`, `digital`, `surcharge`, `return_fee`, `package` — fler
  värden än checkout v3-validate-dokumentationens lista (som saknade
  `return_fee`/`package`). Vi använder fortfarande bara `physical`,
  `shipping_fee`, `discount`.

## Overifierat — måste stämmas av innan produktion

1. **Push-endpointens exakta HTTP-metod (GET/POST) och ev. förväntat
   svar.** Vi antar POST (i linje med validation-callbacken). Kan bara
   stämmas av genom att faktiskt slutföra ett testköp så Kustom anropar
   push på riktigt (kräver att appen är nåbar från internet — Vercel-
   preview eller en tunnel, se README "Testa mot Kustom playground"
   punkt 4).
2. **Om checkout v3:s `readOrder` fortfarande returnerar `html_snippet`
   efter att ordern slutförts.** `pnpm test:kustom`-körningen testade
   bara `createOrder` (en ny, ofullständig order), inte `readOrder` på
   en KLAR order — så antagandet i
   `GET /api/public/checkout/[orderId]/confirmation` är fortfarande
   inte separat bekräftat.
3. **Hela push/validate-flödet end-to-end** (kundvagn → checkout-iframe
   → betalning med Kustoms testkort → Kustom anropar `/api/kustom/push`
   och `/api/kustom/validate` → order sparad i databasen). Kräver att
   appen är nåbar från internet, se README.

## Designbeslut som INTE kommer från Kustom-dokumentationen

- **`error_type` vid slut-i-lager-avslag i validate:** `approval_failed`
  (mest generella av de tre tillåtna värdena).
- **Rabattradens momssats i checkout-session:** kvantitetsviktat snitt
  av kundvagnens rader (`weightedAverageTaxRate`).
- **Fraktkostnad och momssats för frakten** (`shop_settings`-tabellen,
  redigerbar i `/settings` av ägare) — standardvärden 49,00 kr / 25%
  moms är rimliga gissningar, INTE bekräftade priser. Bekräfta/ändra i
  `/settings` innan skarp drift. Fri frakt-gräns är valfri (null =
  ingen fri frakt).
- **`inventory_movements.change_amount`-tolkning:** för
  `order_reserved`/`order_released` avser den `reservedQuantity`, för
  `manual_adjustment`/`return`/`order_shipped` avser den `quantity` —
  vår egen tabell, inget Kustom-fält.
- **`RESEND_FROM_EMAIL`** måste sättas till en avsändaradress på en
  domän verifierad i ert Resend-konto — ingen adress är förvald/gissad.
- **"The Full Kit"s blandade momssats (`taxRate: 1190`, se
  `scripts/seed-products.ts`):** kaffe (179 kr) + kondenserad mjölk
  (49 kr) = 228 kr till 6 % livsmedelsmoms, resterande 349−228 = 121 kr
  till 25 %, omräknat till en enda blandad sats (≈11,90 %) eftersom
  `products.taxRate` bara har ETT fält per produkt. Ni bekräftade själva
  denna fördelningsmetod (hela kit-rabatten läggs på icke-matvaran,
  inte proportionerligt fördelad) — värt att stämma av med revisor
  innan skarp drift, det är en mer offensiv tolkning än Skatteverkets
  vanliga proportionering efter marknadsvärde.
- **Preorder-ordrar (`orders.contains_preorder`) captureas alltid direkt
  vid order, oavsett betalmetod** (`src/lib/orders/capture-preorder.ts`,
  anropas från push-hanteraren). Ett medvetet undantag från Klarnas
  normala mönster där fakturaköp/delbetalning väntar med capture till
  fysisk leverans — den senareläggningen skyddar kunden vid KORT tid
  till leverans, vilket inte gäller en förbeställning där varan inte
  ens finns i lager än. Icke-preorder-ordrar är helt orörda av detta:
  de captureas fortsatt manuellt via "Debitera"-knappen i
  `/orders/[id]` (`captureOrderAction`), precis som innan.

## Status i koden

| Del | Status |
| --- | --- |
| `lib/kustom/auth.ts` | Klar, testad |
| `lib/kustom/tax.ts` | Klar, testad — formeln oberoende bekräftad |
| `lib/kustom/order-payload.ts` | Klar, testad |
| `lib/kustom/client.ts` — `createOrder` | **Klar, verifierad LIVE mot playground** (se ovan) — inte bara mockat fetch längre |
| `lib/kustom/client.ts` — `readOrder`/`updateOrder` | Klar, testad (mockat fetch) — inte liveverifierade än |
| `lib/kustom/client.ts` — Order Management (get/acknowledge/capture/refund/cancel) | Klar, testad (mockat fetch) — inte liveverifierade än (kräver en order som gått igenom hela checkout-flödet) |
| `lib/orders/persist-order.ts` (idempotent orderpersistens + lagerreservation) | **Klar, verifierad mot riktig Postgres** — dubbelanrop med samma order-id testat: exakt en order, en lagerreservation |
| `lib/email/order-confirmation.ts` | Klar, testad (sv/en) |
| `POST /api/public/cart/validate` | Klar, verifierad mot riktig Postgres |
| `POST /api/public/checkout/session` | Klar (utan frakt), verifierad mot riktig Postgres — och payloaden den bygger är nu samma som verifierats fungera live (se ovan) |
| `POST /api/kustom/validate` | Klar, verifierad mot riktig Postgres |
| `POST /api/kustom/push` | Klar — snabbt 200-svar + `next/server`s `after()` för tungt arbete, verifierat: webhook_events loggas rått, snabbt svar (< 300 ms), och fel vid onåbart Kustom-API fångas och sparas korrekt. Inte testat med ett riktigt push-anrop från Kustom än (kräver internetnåbar app, se punkt 3 ovan) |
| `GET /api/public/checkout/[orderId]/confirmation` | Klar (bygger på ej fullt verifierat antagande, se punkt 2 ovan) |
| Order Management-flöden i backofficet (capture/refund/cancel-knappar i `/orders`) | **Inte påbörjat — fas 4** |
