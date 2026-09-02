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
3. **Kustom-klient (create/read/update order), checkout-session,
   cart/validate, /api/kustom/validate** — klar. **/api/kustom/push och
   Order Management (capture/refund/cancel) väntar** på Kustoms
   Order Management API-referens — se docs/kustom.md.
4. Orderhantering: capture, refund, cancel, frakt, e-post.
5. Rabattkoder, dashboard-statistik, loggvyer, GDPR-export.

Se `docs/branding.md` för öppna punkter kring varumärkesprofilen (bl.a.
spacing/typsteg/brytpunkter som inte kunnat läsas av trancoffeelab.com än,
och den riktiga logotyp-SVG:n som saknas) och `docs/kustom.md` för exakt
vilka Kustom-fält/statusvärden som är bekräftade kontra overifierade.
