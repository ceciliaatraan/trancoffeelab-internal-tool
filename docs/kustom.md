# Kustom Checkout-integration

Det här dokumentet listar exakt vilka fältnamn och statusvärden som är
**bekräftade** (ur AGENTS.md-specen, ur dokumentation/OpenAPI-spec ni
klistrat in från docs.kustom.co, eller ur ett riktigt liveanrop mot
playground) kontra **overifierade**. Nätverksåtkomst till docs.kustom.co/
api.playground.kustom.co är blockerad av sandboxens egress-policy under
utveckling (samma begränsning som för trancoffeelab.com i fas 1, se
docs/branding.md) - koden har därför testats mot en riktig Kustom-miljö
genom att NI kört `pnpm test:kustom` lokalt och skickat hit resultatet,
inte av Claude direkt.

Skriv INTE av ett antagande här som om det vore bekräftat. Allt i
"Overifierat"-sektionen måste stämmas av innan produktion.

## Bekräftat

### Auth-format - uppdaterat 2026-09-04 (ny nyckel)

Den nyckel som testades 2026-09-02 (se nedan) slutade fungera (401 på
alla anrop, både lokalt och i produktion) och ersattes 2026-09-04 med
en ny nyckel från Kustom Playground. **Den nya nyckeln kräver DET ANDRA
formatet**, till skillnad från den gamla:

- **`base64(<username>:<nyckel>)`, med `KUSTOM_BASIC_AUTH_USERNAME`
  satt till nyckelns "Key ID" från Kustom Playground-gränssnittet** -
  bekräftat med ett lyckat `201`-svar (order skapad) 2026-09-04.
- Slutsats: vilket av de två formaten som krävs verkar bero på den
  specifika nyckeln/kontot, inte vara en global konstant för alla
  Kustom-konton. Anta INTE att en ny nyckel automatiskt fungerar med
  samma format som en tidigare - testa alltid båda vid en nyckelrotation
  (se `scripts/test-kustom-playground.mjs`, kör en gång med
  `KUSTOM_BASIC_AUTH_USERNAME` satt och en gång utan).

### Live mot playground (kört av er, 2026-09-02, `pnpm test:kustom` - gammal nyckel, se ovan)

`POST /checkout/v3/orders` med vår riktiga payload-byggare gav ett lyckat
svar (order skapad) med den nyckel som var aktiv då. Det här bekräftar
fortfarande (oberoende av vilket auth-format som råkar krävas):

- **Order-id-fältet i svaret heter `order_id`**, inte `id` - t.ex.
  `"f949a813-c5b3-2b3b-ad40-04d2584eb641"`. `extractOrderId`
  (`src/lib/kustom/client.ts`) provar `order_id` först så den fungerar
  redan korrekt, men vi vet nu att fallbacken till `id` aldrig kommer
  att behövas i praktiken.
- **`html_snippet` finns i svaret** från `createOrder` (bekräftat
  4624 tecken lång HTML/JS för Kustoms checkout-iframe).
- **`status: "checkout_incomplete"`** (gemener) bekräftat som det
  faktiska värdet direkt efter att en order skapats - matchar
  AGENTS.md, inte valideringsdokumentationens versala exempel
  (`"CHECKOUT_INCOMPLETE"`), som alltså bara var ett dokumentations-
  exempel och inte det riktiga värdet.

### Checkout v3 API (från AGENTS.md)

- Auth: HTTP Basic. Två format stöds via `buildKustomAuthHeader`
  (`src/lib/kustom/auth.ts`): `base64(<nyckel>:)` (nyckeln som eget
  användarnamn, utan `KUSTOM_BASIC_AUTH_USERNAME`) eller
  `base64(<username>:<nyckel>)` när `KUSTOM_BASIC_AUTH_USERNAME` är
  satt - **vilket av de två som krävs beror på den specifika nyckeln,
  se "Auth-format - uppdaterat 2026-09-04" ovan. Anta inte ett format,
  testa.**
- Base URL playground: `https://api.playground.kustom.co`. Produktion:
  `https://api.kustom.co` (bekräftat även i Order Management-specens
  `servers`-fält).
- `createOrder`: `POST /checkout/v3/orders` - **bekräftat fungerande
  live, se ovan.**
- `readOrder`: `GET /checkout/v3/orders/{order_id}`
- `updateOrder`: `POST /checkout/v3/orders/{order_id}` - går bara medan
  `status` är `checkout_incomplete`.
- `merchant_urls.push`:
  `.../api/kustom/push?order_id={checkout.order.id}` - `order_id` som
  query-parameter.
- `merchant_urls.validation`: `.../api/kustom/validate`

### Kustom Shipping Assistant (KSA) - PostNord-integrationen - 2026-09-21

Ni delade Kustoms egen guide "How to Set Up Shipping Assistant in Kustom
Checkout" 2026-09-21. Bekräftat därifrån (officiell dokumentation, inte
ett antagande):

- KSA visar PostNords fraktalternativ (hämtade live från er TMS/Shipping
  API) direkt i checkouten - men bara om **båda** dessa håller:
  1. Ni har en KSA-profil konfigurerad på ert Merchant ID (MID) i Kustom-
     portalen (ni gör det själva där - inte något i den här koden).
  2. Create-order-anropet triggar KSA genom **antingen**
     `options.allow_separate_shipping_address: true` **eller** en
     `shipping_options`-array - Kustoms egen rekommendation är att alltid
     skicka BÅDA.
- `shipping_options[]`-formatet (statisk fallback som visas om
  TMS/Shipping API inte svarar): `{ id, name, price, tax_amount,
  tax_rate }` - notera `price`, inte `amount_ore`/`total_amount` som
  övriga rader i vår egen `KustomOrderLine`-typ.
- **Innan detta datum skickade vår kod varken `options` eller
  `shipping_options` alls** - `buildCreateOrderPayload`
  (`src/lib/kustom/order-payload.ts`) saknade båda fälten helt, vilket
  betyder att KSA aldrig kan ha triggats, oavsett KSA-konfiguration i
  portalen. Fixat samma dag: `options.allow_separate_shipping_address`
  sätts nu alltid till `true`, och en `shipping_options`-fallback (vårt
  vanliga fraktpris, eller 0 kr vid fri frakt) skickas alltid med - se
  `checkout/session/route.ts`.
- **`order_lines[].attributes.weight`** - bekräftat i Kustoms egen
  "Shipping API Integration"-guide (delad av er 2026-09-21), exempel:
  `"attributes": { "weight": 890, "tags": [...] }` - skickas vidare till
  TMS/Shipping API (PostNord) så vikten följer med. Tolkat som vikt PER
  STYCK i gram (matchar hur `unit_price` också är per styck) - INTE
  uttryckligen bekräftat av Kustom att det är per styck och inte radens
  totalvikt, men det är den rimligaste tolkningen givet hur resten av
  radformatet fungerar. Satt på varje physical-rad från
  `products.weightGrams`/`product_variants.weightGrams` (samma fält som
  redan fanns för lager-/fraktberäkningar, se `src/lib/queries/cart.ts`).
  Vikter bekräftade av ägaren 2026-09-21: Komplett Kit 1000 g,
  No Regrets Horse 250 g, Kondenserad Mjölk 397 g, Litet Phin-filter
  100 g - satta i `scripts/seed-products.ts` (lokal dev-seed). **Värdena
  i produktionens databas är INTE ändrade av Claude** (ingen
  databasåtkomst dit från den här sandboxen) - måste sättas manuellt via
  "Vikt (gram)"-fältet på respektive produkt/variant i `/products/[id]`
  i adminet innan detta faktiskt får effekt live.
- **Dubbel fraktdebitering upptäckt 2026-09-21, samma dag som ni kopplade
  in PostNord-integrationen i Kustoms portal.** Fram tills dess skickade
  vi ALLTID (utöver `shipping_options`-fallbacken ovan) en egen
  `shipping_fee`-rad i `order_lines` med samma fraktpris - fungerade fint
  så länge KSA inte var aktivt (raden var det enda Kustom hade att gå
  på), men så fort en riktig KSA-profil kopplades mot PostNord började
  Kustoms egen checkout-widget lägga på det VALDA fraktpriset ovanpå
  `order_amount` - som redan innehöll vår egen fraktrad. Resultat: 49 kr
  (vår rad, med i summan) + 49 kr (Kustoms widget, ovanpå) + produktpris.
  **Fixat:** `checkout/session/route.ts` skickar inte längre någon egen
  `shipping_fee`-rad alls - `shipping_options`/KSA är nu den ENDA källan
  till fraktpris, både fallbacken och PostNords live-pris. Inte
  uttryckligen bekräftat av Kustoms dokumentation att detta är rätt
  modell (dokumentationen beskrev aldrig hur en egen fraktrad OCH
  `shipping_options` samverkar), men beteendet innan/efter matchar exakt
  vad ni rapporterade, så det är en välgrundad slutsats snarare än en
  gissning.

### Order validation (er inklistrade dokumentationstext)

- **`POST {merchant_urls.validation}`.** Kustom POSTar HELA
  orderrepresentationen som JSON-body - vi läser `order_lines[]` direkt
  ur den bodyn (`src/app/api/kustom/validate/route.ts`), till skillnad
  från push där bodyn INTE litas på.
- **Avslag = HTTP 400** med
  `{ error_type: "unsupported_shipping_address" | "address_error" | "approval_failed", error_text }`.
  **Godkännande** = valfritt icke-400-svar (vi svarar tom 200).
- `order_lines[].total_tax_amount`: **"Must be within ±1 of
  `total_amount - total_amount * 10000 / (10000 + tax_rate)`."** -
  exakt samma formel `calculateTaxFromGross` (`src/lib/kustom/tax.ts`)
  räknar ut. Oberoende bekräftelse att momsuträkningen är rätt.

### Order Management API (er inklistrade OpenAPI-specifikation)

Fullständig, maskinläsbar specifikation - alla nedanstående är därför
högt tillförlitliga, implementerade i `src/lib/kustom/client.ts`:

- `GET /ordermanagement/v1/orders/{order_id}` - `getOrderManagementOrder`.
  **`status`-enum bekräftad:** `AUTHORIZED`, `PART_CAPTURED`,
  `CAPTURED`, `CANCELLED`, `EXPIRED`, `CLOSED`. `AUTHORIZED` tolkas som
  "betalning godkänd, redo att reservera lager" - det är statusen en
  ny order har direkt efter att kunden slutfört Kustoms checkout-flöde.
- `POST /ordermanagement/v1/orders/{order_id}/acknowledge` - 204.
  Måste anropas för varje ny order (annars flaggas den som väntande
  hos Kustom). Detta ÄR "bekräfta ordern mot Kustoms Order Management
  API" från spec.
- `POST /ordermanagement/v1/orders/{order_id}/captures` - body
  `{ captured_amount, description?, reference?, order_lines?, ... }`,
  201 vid lyckat anrop. Alla Order Management-POST-anrop stöder en
  valfri `Klarna-Idempotency-Key`-header, som våra klientfunktioner
  skickar med när ett värde ges.
- `POST /ordermanagement/v1/orders/{order_id}/refunds` - body
  `{ refunded_amount, description?, reference?, order_lines? }`, 201.
- `POST /ordermanagement/v1/orders/{order_id}/cancel` - 204. Nekas
  (403 `CANCEL_NOT_ALLOWED`) om ordern redan har captures eller är
  stängd.
- Adressfält (`billing_address`/`shipping_address`) bekräftade:
  `given_name`, `family_name`, `email`, `phone`, `street_address`,
  `postal_code`, `city`, `region`, `country`, m.fl. - används för
  `orders.customer_email`/adressfälten i `persistOrderFromKustom`.
- `order_lines[].type`-enum (Order Management-varianten) bekräftad:
  `physical`, `discount`, `shipping_fee`, `sales_tax`, `store_credit`,
  `gift_card`, `digital`, `surcharge`, `return_fee`, `package` - fler
  värden än checkout v3-validate-dokumentationens lista (som saknade
  `return_fee`/`package`). Vi använder fortfarande bara `physical`,
  `shipping_fee`, `discount`.

## Overifierat - måste stämmas av innan produktion

1. **Push-endpointens exakta HTTP-metod (GET/POST) och ev. förväntat
   svar.** Vi antar POST (i linje med validation-callbacken). Kan bara
   stämmas av genom att faktiskt slutföra ett testköp så Kustom anropar
   push på riktigt (kräver att appen är nåbar från internet - Vercel-
   preview eller en tunnel, se README "Testa mot Kustom playground"
   punkt 4).
2. **Om checkout v3:s `readOrder` fortfarande returnerar `html_snippet`
   efter att ordern slutförts.** `pnpm test:kustom`-körningen testade
   bara `createOrder` (en ny, ofullständig order), inte `readOrder` på
   en KLAR order - så antagandet i
   `GET /api/public/checkout/[orderId]/confirmation` är fortfarande
   inte separat bekräftat.
3. **Hela push/validate-flödet end-to-end** (kundvagn → checkout-iframe
   → betalning med Kustoms testkort → Kustom anropar `/api/kustom/push`
   och `/api/kustom/validate` → order sparad i databasen). Kräver att
   appen är nåbar från internet, se README.
4. **Om PostNord faktiskt tar emot korrekt adress och vikt via Kustom
   Shipping Assistant (KSA).** 2026-09-21 fixades att create-order-
   anropet nu triggar KSA (`options.allow_separate_shipping_address:
   true` + en `shipping_options`-fallback, se "Kustom Shipping
   Assistant"-sektionen ovan under Bekräftat) - men det bekräftar bara
   att TRIGGER-villkoret uppfylls, inte att fraktalternativen faktiskt
   visas, att PostNord får rätt leveransadress, eller hur vikt (som vi
   fortfarande aldrig skickar någonstans i payloaden - inget viktfält
   finns i Kustoms `order_lines`-spec såvitt vi sett) hanteras. Kan bara
   stämmas av genom ett riktigt testköp i Playground (Kustoms guide steg
   5) och en titt i PostNords "Obekräftade"-vy efteråt - inget Claude kan
   göra från den här sandboxen (ingen nätverksåtkomst till
   trancoffeelab.com eller PostNords portal, ingen inloggning till
   någotdera).

## Designbeslut som INTE kommer från Kustom-dokumentationen

- **`error_type` vid slut-i-lager-avslag i validate:** `approval_failed`
  (mest generella av de tre tillåtna värdena).
- **Rabatt- och fraktradens momssats i checkout-session:**
  kvantitetsviktat snitt av kundvagnens rader (`weightedAverageTaxRate`)
  - frakten har ingen egen fast momssats, den ärver samma blandade sats
  som resten av ordern (ett rent kaffeköp blir 6 %, ett phin-filter för
  sig 25 %, Komplett Kit sin blandade ~11,9 %).
- **Fraktkostnad** (`shop_settings.shippingFlatRateOre`, redigerbar i
  `/settings` av ägare) - standardvärdet 49,00 kr är en rimlig
  gissning, INTE ett bekräftat pris. Bekräfta/ändra i `/settings`
  innan skarp drift. Fri frakt-gräns är valfri (null = ingen fri
  frakt).
- **`inventory_movements.change_amount`-tolkning:** för
  `order_reserved`/`order_released` avser den `reservedQuantity`, för
  `manual_adjustment`/`return`/`order_shipped` avser den `quantity` -
  vår egen tabell, inget Kustom-fält.
- **`RESEND_FROM_EMAIL`** måste sättas till en avsändaradress på en
  domän verifierad i ert Resend-konto - ingen adress är förvald/gissad.
- **"The Full Kit"s blandade momssats (`taxRate: 1190`, se
  `scripts/seed-products.ts`):** kaffe (179 kr) + kondenserad mjölk
  (49 kr) = 228 kr till 6 % livsmedelsmoms, resterande 349−228 = 121 kr
  till 25 %, omräknat till en enda blandad sats (≈11,90 %) eftersom
  `products.taxRate` bara har ETT fält per produkt. Ni bekräftade själva
  denna fördelningsmetod (hela kit-rabatten läggs på icke-matvaran,
  inte proportionerligt fördelad) - värt att stämma av med revisor
  innan skarp drift, det är en mer offensiv tolkning än Skatteverkets
  vanliga proportionering efter marknadsvärde.
- **Preorder-ordrar (`orders.contains_preorder`) captureas alltid direkt
  vid order, oavsett betalmetod** (`src/lib/orders/capture-preorder.ts`,
  anropas från push-hanteraren). Ett medvetet undantag från Klarnas
  normala mönster där fakturaköp/delbetalning väntar med capture till
  fysisk leverans - den senareläggningen skyddar kunden vid KORT tid
  till leverans, vilket inte gäller en förbeställning där varan inte
  ens finns i lager än. Icke-preorder-ordrar är helt orörda av detta:
  de captureas fortsatt manuellt via "Debitera"-knappen i
  `/orders/[id]` (`captureOrderAction`), precis som innan.
- **En "shipping"/"both"-rabattkod diskonterade inte det faktiska
  fraktpriset, upptäckt av ägaren 2026-09-21.** Innan detta datum
  reducerade en sådan rabatt bara `shippingOption.price` (fallback-
  fraktalternativet för Kustom Shipping Assistant) - men sedan en riktig
  KSA/PostNord-profil kopplades in använder Kustom i praktiken sitt LIVE
  PostNord-pris, som INTE känner till vår rabattkod alls och läggs på
  odiskonterat oavsett. Kunden såg t.ex. "-49 kr" i vår egen
  sammanfattning men betalade ändå fullt pris. **Löst** utan att gissa
  på Kustoms odokumenterade rabatt/live-fraktpris-samspel: hela rabatten
  (produkter OCH frakt, `cart.discount.amountOre`) läggs numera på
  rabattraden i `order_lines`, som drar av från `order_amount` - det
  ENDA vi själva helt kontrollerar (se `checkout/session/route.ts`).
  `shippingOption.price` skickas alltid odiskonterat. Total = vårt
  rabatterade `order_amount` + Kustoms fraktpris (odiskonterat men
  korrekt) blir alltid rätt. **Känd kvarvarande begränsning:** en
  rabattkod värd MER än produkternas delsumma (t.ex. en "100 % på allt
  inklusive frakt"-kod) kan inte tvinga fram gratis frakt - `order_amount`
  kan inte bli negativt, och Kustom lägger sitt fraktpris UTANFÖR
  `order_amount`. Det är en gräns i hur Kustom Shipping Assistant
  fungerar, inte något vår payload kan runda - skulle kräva svar från
  Kustom support (se tidigare utkast till supportmejl) om det blir
  aktuellt.
- **Samma live-frakt-blindhet gällde "Fri frakt över X kr"
  (tröskelbeloppet), upptäckt samma dag när ägaren frågade om
  PostNord-priset kunde nollas för en fraktrabatt.** `cart.freeShipping`
  nollade bara `shippingOption.price` (fallbacken), inte Kustoms
  live-pris - exakt samma gap som rabattkoder hade. Löst med samma
  mönster: `cart.shippingFlatRateOre` (den ORÖRDA flatraten - `cart.
  shippingOre` är redan nollad av `freeShipping`) läggs som en
  kompensation på rabattraden, tillsammans med en eventuell aktiv
  rabattkod (EN kombinerad rad - `DiscountInput.label` styr radens
  namn: "Fri frakt", "Rabatt (KOD)" eller "Rabatt (KOD) + Fri frakt").
  Samma tak (kan inte göra `order_amount` negativt) gäller här också.
  I Kustoms checkout-widget syns fortfarande "Frakt: 49 kr" som sin
  egen rad (det är PostNords live-pris, kan inte nollas av oss) - det
  är en separat rabattrad som gör att TOTALEN blir rätt, inte att
  fraktraden själv visar 0 kr. Bekräftat med en skärmdump av en riktig
  checkout: delsumma 349 kr, frakt 49 kr, rabatt −49 kr, totalt 349 kr.

## Status i koden

| Del | Status |
| --- | --- |
| `lib/kustom/auth.ts` | Klar, testad |
| `lib/kustom/tax.ts` | Klar, testad - formeln oberoende bekräftad |
| `lib/kustom/order-payload.ts` | Klar, testad |
| `lib/kustom/client.ts` - `createOrder` | **Klar, verifierad LIVE mot playground** (se ovan) - inte bara mockat fetch längre |
| `lib/kustom/client.ts` - `readOrder`/`updateOrder` | Klar, testad (mockat fetch) - inte liveverifierade än |
| `lib/kustom/client.ts` - Order Management (get/acknowledge/capture/refund/cancel) | Klar, testad (mockat fetch) - inte liveverifierade än (kräver en order som gått igenom hela checkout-flödet) |
| `lib/orders/persist-order.ts` (idempotent orderpersistens + lagerreservation) | **Klar, verifierad mot riktig Postgres** - dubbelanrop med samma order-id testat: exakt en order, en lagerreservation |
| `lib/email/order-confirmation.ts` | Klar, testad (sv/en) |
| `POST /api/public/cart/validate` | Klar, verifierad mot riktig Postgres |
| `POST /api/public/checkout/session` | Klar (utan frakt), verifierad mot riktig Postgres - och payloaden den bygger är nu samma som verifierats fungera live (se ovan) |
| `POST /api/kustom/validate` | Klar, verifierad mot riktig Postgres |
| `POST /api/kustom/push` | Klar - snabbt 200-svar + `next/server`s `after()` för tungt arbete, verifierat: webhook_events loggas rått, snabbt svar (< 300 ms), och fel vid onåbart Kustom-API fångas och sparas korrekt. Inte testat med ett riktigt push-anrop från Kustom än (kräver internetnåbar app, se punkt 3 ovan) |
| `GET /api/public/checkout/[orderId]/confirmation` | Klar (bygger på ej fullt verifierat antagande, se punkt 2 ovan) |
| Order Management-flöden i backofficet (capture/refund/cancel-knappar i `/orders`) | **Inte påbörjat - fas 4** |
