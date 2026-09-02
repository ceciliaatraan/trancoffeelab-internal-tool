# TRAN Admin

Headless commerce-backoffice för [TRAN Coffee Lab](https://trancoffeelab.com)
(Systrarna TRAN AB, org.nr 559587-6037). Två roller i en app:

1. **Inloggat backoffice** — produkter, lager, ordrar, frakt, rabattkoder,
   returer.
2. **Headless backend** — publika, CORS-skyddade `/api/public/*`-endpoints
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

- `DATABASE_URL` / `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` — från ert
  Supabase-projekt (Project Settings → Database / API).
- `AUTH_SECRET` — generera med `npx auth secret`.
- `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` — se nedan.
- `ALLOWED_ADMIN_EMAILS` — kommaseparerad lista över Google-adresser som får
  logga in.

Kör migrationer mot databasen:

```bash
pnpm db:generate   # generera SQL från src/db/schema (bara vid schemaändring)
pnpm db:migrate    # applicera migrationer i drizzle/ mot DATABASE_URL
```

Skapa en Storage-bucket i Supabase Dashboard (Storage → New bucket) som
heter **`product-images`** med publik läsbehörighet — produktbilder laddas
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
session — spärren sitter server-side i `signIn`-callbacken i `src/auth.ts`,
inte bara i UI:t. Nekade försök loggas i `audit_log`.

## Testa mot Kustom playground

Den här utvecklingsmiljön (sandboxen Claude byggde i) kan inte nå
`api.kustom.co`/`docs.kustom.co` alls — nätverksåtkomst dit är blockerad av
miljöns egress-policy. Inget i koden har därför kunnat köras mot en riktig
Kustom-miljö, bara verifierats mot en riktig lokal Postgres och med mockade
HTTP-svar i enhetstesterna. Kör det här steget själva, lokalt, där ni har
vanlig internetåtkomst.

1. Skaffa ett playground-konto/testnycklar hos Kustom om ni inte redan har
   det (merchant-ID + en `kco_test_api_...`-nyckel).
2. Kör det fristående testscriptet — det använder samma payload-byggare och
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
   gärna hela utskriften hit — den löser flera av de öppna punkterna i
   `docs/kustom.md` (exakt fältnamn för order-id, om `html_snippet` finns
   kvar efter att en order lästs igen, m.m.).
4. För att testa hela flödet (kundvagn → checkout-iframe → betalning med
   Kustoms testkort → push → order i databasen) behöver appen köras någonstans
   Kustom kan nå — antingen en Vercel-preview av den här branchen, eller
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

`KUSTOM_ENV` styr bara vad som visas skrivskyddat under `/settings` — det är
`KUSTOM_API_BASE_URL` och nyckeln som faktiskt avgör vilken miljö som
används. Byt aldrig till `live` innan checkout-flödet är verifierat mot
playground med Kustoms testkort (fas 3).

## Byggordning

Projektet byggs i faser, med avstämning efter varje fas:

1. **Repo, Next.js, Tailwind, Supabase-schema, Google-inloggning** — klar.
2. **Produkter, lager, bilder, publika produkt-endpoints** — klar.
3. **Kustom-klient (checkout v3 + Order Management), checkout-session,
   cart/validate, /api/kustom/validate, /api/kustom/push, ordermodell,
   orderbekräftelsemail** — klar. Inget har kunnat testas mot en riktig
   Kustom-miljö (nätverksåtkomst dit är blockerad i utvecklingsmiljön)
   — se docs/kustom.md för exakt vad som är verifierat.
4. Orderhantering i backofficet: capture/refund/cancel-knappar i
   `/orders`, frakt, `/settings`.
5. Rabattkoder (admin-CRUD), dashboard-statistik, loggvyer, GDPR-export.

Se `docs/branding.md` för öppna punkter kring varumärkesprofilen (bl.a.
spacing/typsteg/brytpunkter som inte kunnat läsas av trancoffeelab.com än,
och den riktiga logotyp-SVG:n som saknas) och `docs/kustom.md` för exakt
vilka Kustom-fält/statusvärden som är bekräftade kontra overifierade.
