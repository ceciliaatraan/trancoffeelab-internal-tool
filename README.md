# TRAN Admin

Headless commerce-backoffice för [TRAN Coffee Lab](https://trancoffeelab.com)
(Systrarna TRAN AB, org.nr 559587-6037). Två roller i en app:

1. **Inloggat backoffice** - produkter, lager, ordrar, frakt, rabattkoder,
   returer.
2. **Headless backend** - publika, CORS-skyddade `/api/public/*`-endpoints
   som den publika sajten (byggd i Lovable) anropar för produktdata och för
   att skapa en [Kustom Checkout](https://docs.kustom.co/contents/api/checkout)
   -session.

Sanningskällan för produkter, priser, lager och ordrar är den här
plattformen. Se `docs/branding.md` för varumärkesprofilen och
`docs/kustom.md` (tillkommer i fas 3) för den verifierade Kustom-integrationen.

## Stack

- Next.js (App Router, TypeScript) på Vercel
- Supabase (Postgres + Storage), Drizzle ORM
- Auth.js v5 (NextAuth), Google som enda inloggningsmetod
- Tailwind CSS v4
- Zod, Vitest, Playwright

## Lokal setup

```bash
pnpm install
cp .env.example .env.local
```

Fyll i `.env.local`:

- `DATABASE_URL` / `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` - från ert
  Supabase-projekt (Project Settings → Database / API).
- `AUTH_SECRET` - generera med `npx auth secret`.
- `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` - se nedan.
- `ALLOWED_ADMIN_EMAILS` - kommaseparerad lista över Google-adresser som får
  logga in.

Kör migrationer mot databasen:

```bash
pnpm db:generate   # generera SQL från src/db/schema (bara vid schemaändring)
pnpm db:migrate    # applicera migrationer i drizzle/ mot DATABASE_URL
```

Skapa en Storage-bucket i Supabase Dashboard (Storage → New bucket) som
heter **`product-images`** med publik läsbehörighet - produktbilder laddas
upp dit av `src/lib/supabase.ts`.

Starta dev-servern:

```bash
pnpm dev
```

### Tester

```bash
pnpm test          # Vitest (enhetstester)
pnpm test:e2e       # Playwright (kräver att dev-servern kan startas)
pnpm lint
```

## Google OAuth

Skapa ett OAuth-klient-ID i [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
(typ "Web application") och lägg till båda dessa redirect-URI:er (en klient
räcker för både lokal utveckling och produktion):

```
http://localhost:3000/api/auth/callback/google
https://admin.trancoffeelab.com/api/auth/callback/google
```

Kopiera Client ID/Secret till `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET` lokalt och
i Vercels miljövariabler för produktion. `AUTH_URL` ska vara
`http://localhost:3000` lokalt och `https://admin.trancoffeelab.com` i
produktion.

Endast adresser i `ALLOWED_ADMIN_EMAILS` (och ev. `ALLOWED_GOOGLE_HD`) får en
session - spärren sitter server-side i `signIn`-callbacken i `src/auth.ts`,
inte bara i UI:t. Nekade försök loggas i `audit_log`.

## Testa mot Kustom playground

Den här utvecklingsmiljön (sandboxen Claude byggde i) kan inte nå
`api.kustom.co`/`docs.kustom.co` alls - nätverksåtkomst dit är blockerad av
miljöns egress-policy. Inget i koden har därför kunnat köras mot en riktig
Kustom-miljö, bara verifierats mot en riktig lokal Postgres och med mockade
HTTP-svar i enhetstesterna. Kör det här steget själva, lokalt, där ni har
vanlig internetåtkomst.

1. Skaffa ett playground-konto/testnycklar hos Kustom om ni inte redan har
   det (merchant-ID + en `kco_test_api_...`-nyckel).
2. Kör det fristående testscriptet - det använder samma payload-byggare och
   auth-header-logik som appen, men gör själva HTTP-anropet direkt (kräver
   ingen databas, ingen `.env.local`, bara Node och de här två variablerna):

   ```bash
   KUSTOM_API_BASE_URL=https://api.playground.kustom.co \
   KUSTOM_API_KEY=kco_test_api_... \
   pnpm test:kustom
   ```

   Lägg till `KUSTOM_BASIC_AUTH_USERNAME=...` om er nyckel kräver det andra
   Basic-auth-formatet (se `docs/kustom.md`).

3. Scriptet skriver ut hela svaret från `POST /checkout/v3/orders` och
   talar om ifall `order_id`/`id` och `html_snippet` hittades. Skicka
   gärna hela utskriften hit - den löser flera av de öppna punkterna i
   `docs/kustom.md` (exakt fältnamn för order-id, om `html_snippet` finns
   kvar efter att en order lästs igen, m.m.).
4. För att testa hela flödet (kundvagn → checkout-iframe → betalning med
   Kustoms testkort → push → order i databasen) behöver appen köras någonstans
   Kustom kan nå - antingen en Vercel-preview av den här branchen, eller
   dev-servern lokalt bakom en tunnel (t.ex. ngrok). Då kan `/api/kustom/push`
   och `/api/kustom/validate` faktiskt anropas av Kustom på riktigt. Säg till
   om ni vill ha hjälp att sätta upp det.

## Byta från playground till live (Kustom)

Sätt i Vercels miljövariabler (produktionsmiljön):

```
KUSTOM_API_BASE_URL=https://api.kustom.co
KUSTOM_ENV=live
KUSTOM_API_KEY=<er kco_live_-nyckel>
KUSTOM_MERCHANT_ID=<ert merchant-id>
```

`KUSTOM_ENV` styr bara vad som visas skrivskyddat under `/settings` - det är
`KUSTOM_API_BASE_URL` och nyckeln som faktiskt avgör vilken miljö som
används. Byt aldrig till `live` innan checkout-flödet är verifierat mot
playground med Kustoms testkort (fas 3).

## Slack-notiser vid ny beställning

Adminet kan pinga en Slack-kanal (t.ex. `#beställningar`) varje gång en ny,
riktig beställning kommer in - via Slacks "Incoming Webhooks", inget Slack-app
eller kodning krävs.

1. Gå till https://api.slack.com/apps → **Create New App** → **From scratch**.
   Ge appen ett namn (t.ex. "TRAN-ordrar") och välj er Slack-arbetsyta.
2. I appens meny, klicka **Incoming Webhooks** → slå på **Activate Incoming
   Webhooks** → **Add New Webhook to Workspace**.
3. Välj kanalen `#beställningar` (skapa kanalen i Slack först om den inte
   redan finns) och godkänn.
4. Kopiera webhook-URL:en (ser ut som
   `https://hooks.slack.com/services/T000/B000/xxxxxxxx`).
5. Sätt den i Vercels miljövariabler (produktionsmiljön):
   ```
   SLACK_WEBHOOK_URL=<webhook-URL:en från steg 4>
   ```

Notisen skickas bara för riktiga beställningar (`KUSTOM_ENV=live`) - aldrig
för testköp i Kustom Playground under utveckling. Saknas `SLACK_WEBHOOK_URL`
skickas ingen notis alls (ingen krasch) - funktionen är helt valfri. Ett fel
från Slack (nätverksfel, ogiltig webhook m.m.) stoppar aldrig själva ordern -
den sparas, captureas och mejlar kunden precis som vanligt, felet loggas bara.

## Bearbeta om en misslyckad order-webhook

`/logs` visar alla push-/bekräftelseanrop från Kustom. Ett misslyckat anrop
("Nej" i kolumnen Bearbetad) betyder att ordern INTE sparades hos er - ingen
bekräftelse mejlades, inget lager reserverades - även om Kustom redan
debiterat kunden (kollas via `raw_kustom_order`/status i det bakomliggande
webhook-eventet). Felmeddelandet går nu att klicka upp till en fullständig,
radbrytande text (i stället för att bara synas vid hover) och visar den
faktiska databasfelet, inte bara SQL-frågan som misslyckades.

Knappen "Bearbeta om" på en misslyckad rad kör ordern igen - säkert att
klicka flera gånger (ordern skapas bara en gång även om ni klickar om och
om igen). Skriver en ny rad i loggen i stället för att skriva över den
gamla, så historiken bevaras. Använd den här när en order fastnat på grund
av ett tillfälligt fel (t.ex. Kustom var nere) eller en bugg som sedan
fixats.

## Kit-komponenter: byta en enskild vara i kitet, och partiell retur

För en kit-rad (t.ex. Komplett Kit) visar orderdetaljen numera "Innehåll i
kitet" - varje komponent (kaffe, phin-filter, mjölk osv.) som en egen rad,
inte bara kitets egen SKU. Där kan ni:

- **Byta en enskild komponent** (t.ex. helböna i stället för malet) utan att
  röra kitets eget pris/SKU/summa - kunden betalade för HELA kitet, inte för
  den enskilda varan, så inget priskrav gäller här (till skillnad från "Byt"
  på en hel rad, se ovan). Lagret uppdateras automatiskt: den gamla varans
  reservation släpps, den nya reserveras. Bara tillgängligt innan ordern
  skickats/avbrutits, och bara mot enskilda varor (inte mot ett annat kit).
- **Registrera en partiell retur** - t.ex. bara kaffet kommer tillbaka, inte
  phin-filtret eller mjölken. Lägger automatiskt tillbaka antalet i "I
  lager" (precis som en ny leverans - påverkar inte den historiska
  skickat-räknaren). Bara tillgängligt på skickade ordrar, och bara upp till
  vad som faktiskt skickades minus ev. tidigare returer på samma komponent.
  Hänger INTE ihop med återbetalning - det gör ni separat via de befintliga
  Återbetala-knapparna.

Samma retur-funktion finns även för en vanlig (icke-kit) orderrad, som en
enda "komponent".

## Byta SKU på en orderrad

Om en kund ändrar sig efter köp (t.ex. vill ha helböna i stället för malet) -
orderdetaljen har en "Byt"-kolumn på orderrader, med en dropdown av alla
andra publicerade SKU:er som kostar EXAKT lika mycket (inklusive samma
momssats). Ordersumman kan alltså aldrig ändras av ett byte - det som redan
debiterats hos Kustom förblir korrekt utan att ni behöver göra något med
betalningen. Lagret uppdateras automatiskt (reservationen på den gamla SKU:n
släpps, den nya reserveras), och kräver att det finns tillräckligt i lager av
den nya SKU:n. Bara tillgängligt innan ordern fysiskt skickats eller
avbrutits. Ingen annan SKU till samma pris i katalogen? Byt går då inte att
göra härifrån (inga byten som skulle ändra summan) - hantera det manuellt.

## Fraktstatus "Fraktsedel skapad"

Fraktstatusen har nu fyra lägen: Ej skickad → **Fraktsedel skapad** → Skickad
→ (eller Avbruten). "Fraktsedel skapad" är till för perioden mellan att en
fraktsedel gjorts hos PostNord och att paketet faktiskt lämnats/hämtats -
sätts manuellt med en egen knapp på orderdetaljen (`markLabelCreatedAction`,
`orders.fulfillment_status = 'label_created'`), med ett valfritt
spårningsnummer som sparas på ordern (`orders.label_tracking_number`) och
sedan är förifyllt när ni senare markerar ordern som faktiskt skickad.

Påverkar INTE lagret - reservationen som gjordes när ordern kom in ligger
kvar orörd (`computeTrueReservedQuantities` räknar `label_created` som
fortsatt reserverat, inte skickat) tills "Markera som skickad" körs.

## PostNord-fraktstatus på orderdetaljen och i orderlistan

Orderdetaljen (`/orders/[id]`) OCH orderlistan (`/orders`, kolumnen "Frakt")
visar automatiskt live-status från PostNord (t.ex. "Under transport"/
"Levererad") för riktiga PostNord-spårningsnummer - via PostNords Track &
Trace-API (`GET .../trackandtrace/findByIdentifier.json`, läsning bara,
bokar/ändrar aldrig något). Skickningar bokas fortfarande av Kustom Shipping
Assistant, inte av den här koden.

I orderlistan visas statusen som en färgad ruta (`src/lib/orders/
fulfillment-status.ts` + `<FraktStatusBadge>`): röd = ej skickad, gul =
skickad/under transport, grön = levererad (både PostNords "DELIVERED" och
"Levererad för hand" räknas som grönt), grå = avbruten.

1. Skapa ett konto på https://developer.postnord.com (Customer- eller
   Partner-plan beroende på ert upplägg) och hämta er produktions-API-nyckel.
2. Sätt den i Vercels miljövariabler (produktionsmiljön):
   ```
   POSTNORD_API_KEY=<er API-nyckel>
   ```
   `POSTNORD_API_HOST` behöver bara sättas om ni vill peka mot PostNords
   sandbox (`https://atapi2.postnord.com`, kräver en separat testnyckel från
   https://atdeveloper.postnord.com) - tom/ej satt = produktion
   (`https://api2.postnord.com`).

Saknas `POSTNORD_API_KEY`, eller svarar PostNord inte (fel spårningsnummer,
nere, rate limit m.m.), visas bara det ni själva skrivit in
(fraktbolag/spårningsnummer) precis som innan - orderdetaljen kraschar aldrig
på grund av PostNord. Slås bara på för skickningar där fraktbolaget innehåller
"PostNord" och spårningsnumret inte är "(ingen spårning)" (handleveranser).

### Hitta spårningsnummer hos PostNord via referens

På orderdetaljen, innan en order markerats som skickad, finns en sökruta
"Hitta spårningsnummer hos PostNord" - för fraktsedlar som skapats direkt i
PostNords portal (t.ex. manuellt, utan att gå via "Exportera till PostNord
(CSV)"-knappen i orderlistan) och där spårningsnumret därför inte redan finns
inskrivet hos oss. Sök på samma referens ni skrev in i PostNords portal när
sedeln skapades (t.ex. ordernummer eller kundens namn) - PostNords
`findByReference`-API (`GET .../trackandtrace/findByReference.json`) letar
upp matchande skickningar, och "Använd"-knappen fyller i spårningsnumret i
formuläret nedanför.

Kräver, utöver `POSTNORD_API_KEY`, även:
```
POSTNORD_CUSTOMER_NUMBER=<ert PostNord-kundnummer>
```

Ger inga träffar om referensen aldrig skrevs in vid bokningstillfället - då
får spårningsnumret slås upp manuellt hos PostNord och skrivas in som
tidigare. **Observera:** PostNords egen dokumentation visade bara ett
exempel med ett 403-felsvar för det här API:et, aldrig ett lyckat svar - vi
antar att svarsformen är densamma som för `findByIdentifier` (samma
API-familj/version). Ett fel eller en avvikande svarsform visas som "inga
träffar" i stället för att krascha sidan.

## Byggordning

Projektet byggs i faser, med avstämning efter varje fas:

1. **Repo, Next.js, Tailwind, Supabase-schema, Google-inloggning** - klar.
2. **Produkter, lager, bilder, publika produkt-endpoints** - klar.
3. **Kustom-klient (checkout v3 + Order Management), checkout-session,
   cart/validate, /api/kustom/validate, /api/kustom/push, ordermodell,
   orderbekräftelsemail** - klar. `createOrder` verifierad live mot
   playground (körd av er lokalt) - se docs/kustom.md för exakt vad
   som är verifierat och vad som fortfarande kräver ett helt
   testköp end-to-end.
4. **Orderhantering i backofficet: capture/refund/cancel-knappar i
   `/orders`, markera som skickad, plocklista, frakt/momsinställningar
   i `/settings`** - klar.
5. **Rabattkoder (admin-CRUD), dashboard-statistik, loggvyer
   (`/logs`), kunder och GDPR-export** - klar.

Se `docs/branding.md` för öppna punkter kring varumärkesprofilen (bl.a.
spacing/typsteg/brytpunkter som inte kunnat läsas av trancoffeelab.com än,
och den riktiga logotyp-SVG:n som saknas) och `docs/kustom.md` för exakt
vilka Kustom-fält/statusvärden som är bekräftade kontra overifierade.
