# Kustom Checkout-integration

Det här dokumentet listar exakt vilka fältnamn och statusvärden som är
**bekräftade** (antingen ur AGENTS.md-specen, som räknas som facit här,
eller ur dokumentation/OpenAPI-spec ni klistrat in från docs.kustom.co)
kontra **overifierade**. Nätverksåtkomst till docs.kustom.co/
api.playground.kustom.co är blockerad av sandboxens egress-policy under
utveckling (samma begränsning som för trancoffeelab.com i fas 1, se
docs/branding.md) — därför är vissa delar fortfarande inte kunnat läsas
av direkt, och inget i produktionskoden har kunnat testas mot en riktig
Kustom-miljö (bara mot mockat/simulerat svar och verifierat att koden
själv fungerar korrekt när anropet misslyckas).

Skriv INTE av ett antagande här som om det vore bekräftat. Allt i
"Overifierat"-sektionen måste stämmas av innan produktion.

## Bekräftat

### Checkout v3 API (från AGENTS.md)

- Auth: HTTP Basic. Två format stöds via `buildKustomAuthHeader`
  (`src/lib/kustom/auth.ts`): `base64(<nyckel>:)` (nyckeln som eget
  användarnamn, standard) eller `base64(<username>:<nyckel>)` när
  `KUSTOM_BASIC_AUTH_USERNAME` är satt.
- Base URL playground: `https://api.playground.kustom.co`. Produktion:
  `https://api.kustom.co` (bekräftat även i Order Management-specens
  `servers`-fält).
- `createOrder`: `POST /checkout/v3/orders`
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
   svar.** Vi antar POST (i linje med validation-callbacken).
2. **Exakt fältnamn för order-id i checkout v3:s svar** (`createOrder`/
   `readOrder`, INTE Order Management, som bekräftat använder
   `order_id`). `extractOrderId` provar `order_id` sedan `id`.
3. **Om checkout v3:s `readOrder` fortfarande returnerar `html_snippet`
   efter att ordern slutförts.** Antas (samma resurs, samma API-yta som
   `createOrder`) i `GET /api/public/checkout/[orderId]/confirmation`,
   men inte separat bekräftat.
4. **Vilket Basic-auth-format er faktiska nyckel kräver.**
5. **Live-test mot playground.** Inget i den här listan har kunnat
   köras mot en riktig Kustom-miljö — nätverksåtkomst dit är blockerad
   i den här sandboxen. All verifiering hittills är: enhetstester med
   mockat `fetch`, och verifiering mot en riktig lokal Postgres av allt
   som INTE kräver ett faktiskt Kustom-svar (kundvagn, lagerreservation,
   idempotens, e-postinnehåll, felhantering när Kustom-anropet
   misslyckas).

## Designbeslut som INTE kommer från Kustom-dokumentationen

- **`error_type` vid slut-i-lager-avslag i validate:** `approval_failed`
  (mest generella av de tre tillåtna värdena).
- **Rabattradens momssats i checkout-session:** kvantitetsviktat snitt
  av kundvagnens rader (`weightedAverageTaxRate`).
- **Frakt saknas i checkout-session helt** — ingen fraktinställning
  finns i datamodellen än.
- **`inventory_movements.change_amount`-tolkning:** för
  `order_reserved`/`order_released` avser den `reservedQuantity`, för
  `manual_adjustment`/`return`/`order_shipped` avser den `quantity` —
  vår egen tabell, inget Kustom-fält.
- **`RESEND_FROM_EMAIL`** måste sättas till en avsändaradress på en
  domän verifierad i ert Resend-konto — ingen adress är förvald/gissad.

## Status i koden

| Del | Status |
| --- | --- |
| `lib/kustom/auth.ts` | Klar, testad |
| `lib/kustom/tax.ts` | Klar, testad — formeln oberoende bekräftad |
| `lib/kustom/order-payload.ts` | Klar, testad |
| `lib/kustom/client.ts` — checkout v3 (create/read/update) | Klar, testad (mockat fetch) |
| `lib/kustom/client.ts` — Order Management (get/acknowledge/capture/refund/cancel) | Klar, testad (mockat fetch) |
| `lib/orders/persist-order.ts` (idempotent orderpersistens + lagerreservation) | **Klar, verifierad mot riktig Postgres** — dubbelanrop med samma order-id testat: exakt en order, en lagerreservation |
| `lib/email/order-confirmation.ts` | Klar, testad (sv/en) |
| `POST /api/public/cart/validate` | Klar, verifierad mot riktig Postgres |
| `POST /api/public/checkout/session` | Klar (utan frakt), verifierad mot riktig Postgres |
| `POST /api/kustom/validate` | Klar, verifierad mot riktig Postgres |
| `POST /api/kustom/push` | Klar — snabbt 200-svar + `next/server`s `after()` för tungt arbete, verifierat: webhook_events loggas rått, snabbt svar (< 300 ms), och fel vid onåbart Kustom-API fångas och sparas korrekt |
| `GET /api/public/checkout/[orderId]/confirmation` | Klar (bygger på ej fullt verifierat antagande, se punkt 3 ovan) |
| Order Management-flöden i backofficet (capture/refund/cancel-knappar i `/orders`) | **Inte påbörjat — fas 4** |
