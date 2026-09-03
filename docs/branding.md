# Branding — TRAN Coffee Lab admin

Detta dokument är källan för hur varumärkesprofilen har implementerats i
`admin.trancoffeelab.com`, vad som är avläst från `trancoffeelab.com`, och vad
som fortfarande är öppet och behöver bekräftas.

## 1. Tokens

Implementerade i `src/app/globals.css` som CSS-variabler och i Tailwind v4:s
`@theme inline`-block (Tailwind v4 har ingen `tailwind.config.js` för teman —
allt sker i CSS). Filen kan återanvändas rakt av på Lovable-sajten.

### Färger

| Token | Värde | Tailwind-klass |
| --- | --- | --- |
| `--tran-white` | `#FFFFFF` | `bg-tran-white`, `text-tran-white` |
| `--tran-black` | `#000000` | `bg-tran-black`, `text-tran-black` |
| `--tran-red` | `#EB1C24` | `bg-tran-red`, `text-tran-red` |
| `--tran-blue` | `#205FAC` | `bg-tran-blue`, `text-tran-blue` |

Inga andra varumärkesfärger finns. Neutraler är INTE egna gråtoner utan
opacitet på svart:

| Token | Värde | Användning |
| --- | --- | --- |
| `--tran-hairline` | `rgba(0,0,0,0.12)` | 1px-linjer, tabellrader, kort-ramar |
| `--tran-hairline-strong` | `rgba(0,0,0,0.24)` | Tyngre avdelare |
| `--tran-muted` | `rgba(0,0,0,0.55)` | Sekundär text |
| `--tran-faint` | `rgba(0,0,0,0.35)` | Tertiär text, placeholder |

### Kaffesorternas färgkodning

| Sort | Färg | Token |
| --- | --- | --- |
| NO REGRETS HORSE | Röd | `--tran-horse` (`#EB1C24`) |
| DANCING DRAGON | Svart | `--tran-dragon` (`#000000`) |
| DRUNKEN TIGER | Blå | `--tran-tiger` (`#205FAC`) |

Används för chips i orderrader, produktkort och etiketter i backofficet.

### Typografi

| Token | Font | Källa | Användning |
| --- | --- | --- | --- |
| `--font-display` | "Bulky" | Självhostad, `/public/fonts/Bulky.ttf`, mottagen direkt från er (filen är licensierad för TRAN och sourcades INTE från en gratisfont-CDN) | Sidrubriker, tomma-tillstånd — sparsamt |
| `--font-body` | "Space Grotesk" | `next/font/google`, självhostas automatiskt av Next vid build | All tät UI: tabeller, formulär, knappar, etiketter, siffror |

Fallback-stack: `'Space Grotesk', ui-sans-serif, system-ui, sans-serif`.

Versala etiketter (`.tran-label`-klassen): `text-transform: uppercase`,
`letter-spacing: 0.08em`. Tabellsiffror: `.tran-tabular` sätter
`font-variant-numeric: tabular-nums`.

**Öppet:** exakta px/rem-värden och line-height per typsteg (H1–H3, brödtext,
small/label) är INTE avlästa från sajten än — se avsnitt 3.

### Logotyp

**Öppet — se avsnitt 3.** Ingen master-SVG av wordmarken "TRAN®" finns
tillgänglig än. `src/components/tran-wordmark.tsx` renderar just nu en
inline SVG med `<text>` i Bulky-fonten som platshållare, inte en riktig
vektoriserad logotyp.

### Layoutspråk

Implementerat rakt av enligt profilen, oberoende av sajtavläsning:

- `border-radius: 0` överallt (`--radius-*` är nollade i Tailwind-temat).
- Inga skuggor, inga gradienter.
- 1px hairlines (`--tran-hairline`) i stället för kort/skuggor.
- Knappar: rektangulära, svart fyllning + vit text ELLER vit + 1px svart
  ram. Hover byter till rött (`hover:bg-tran-red`), aldrig till grått.
- `admin.trancoffeelab.com` följer INTE `prefers-color-scheme` — varumärket
  är en fast fyrfärgspalett, inte ett adaptivt UI-tema.

**Öppet:** exakt spacing-skala, grid-kolumner och brytpunkter — se avsnitt 3.

## 2. Avläst från trancoffeelab.com

**Ingenting ännu.** Nätverksåtkomst i den här sandbox-miljön blockerar
utgående anrop till `trancoffeelab.com` (organisationens egress-policy för
miljön tillåter bara ett fast antal domäner — npm, Google Fonts, GitHub,
Anthropics API — och trancoffeelab.com/docs.kustom.co ingår inte). Ni valde
att klistra in HTML/CSS från sajten manuellt i stället för att vänta på en
miljö med bredare nätverksåtkomst, men det underlaget har inte kommit in i
konversationen än.

När det underlaget finns uppdateras den här sektionen med, för varje värde:
käll-sidan (`/`, `/products`, en produktsida) och det faktiska värdet — inte
en approximation.

## 3. Avvikelser att bekräfta

| # | Vad | Profilen säger | Sajten gör | Vad jag valde | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | Spacing-skala | Ospecificerad, "hairline-rutnät, mycket vitt utrymme" | Okänt — sajten ej avläst | Tailwind v4:s standardskala (0.25rem-steg) används tillfälligt i alla byggda sidor | **Öppet** — ersätt med avläst skala |
| 2 | Typsteg (px/rem, line-height, letter-spacing per nivå) | Ospecificerat utöver fontval | Okänt — sajten ej avläst | Ingen egen typskala definierad än utöver `.tran-label`/`.tran-tabular`-klasserna; sidrubriker använder `text-4xl` som platshållare | **Öppet** |
| 3 | Brytpunkter | Ospecificerat | Okänt — sajten ej avläst | Tailwind v4:s standardbrytpunkter (`sm/md/lg/xl/2xl`) används tillfälligt | **Öppet** |
| 4 | Komponentmönster (nav, språkväxlare, varukorgsikon, länkstilar, footer) | Ospecificerat | Okänt — sajten ej avläst | Adminets header byggd fritt utifrån "wordmark vänster, avdelare, navigation"-beskrivningen i profilen, inga sajtspecifika mönster kopierade | **Öppet** |
| 5 | Master-SVG av wordmarken "TRAN®" | SVG, aldrig text med fallback-font | Okänt | Platshållar-SVG med `<text>` i Bulky-fonten (inte en riktig vektoriserad logotyp) i `tran-wordmark.tsx` | **Öppet — behöver riktig fil från er** |
| 6 | Bulky-fontfil | Självhostas i `/public/fonts` | — | Mottagen direkt från er (`Bulky__Final_Edit.ttf`, familj "bulky", vikt Medium), sparad som `/public/fonts/Bulky.ttf` | **Löst** |
| 7 | `ALLOWED_ADMIN_EMAILS` startvärde | `systrarna@trancoffeelab.com,‹winnies-adress›` | — | Ni bekräftade att Winnie loggar in med samma adress, `systrarna@trancoffeelab.com` — startvärdet är alltså en enda adress. Fler adresser läggs till i Vercel vid behov, inte i kod. | **Löst** |
| 8 | Kustom-dokumentation (docs.kustom.co, api.playground.kustom.co) | Skulle verifieras innan klienten byggdes | — | Ni klistrade in relevanta delar av dokumentationen och körde ett riktigt playground-test (`pnpm test:kustom`) — se `docs/kustom.md` för exakt vad som är bekräftat kontra fortfarande öppet. | **Till stor del löst, detaljer i docs/kustom.md** |

Inget i den här listan är tyst gissat — allt som inte kunnat avläsas eller
verifieras är explicit markerat som öppet ovan, och byggkoden är skriven så
att det är enkelt att byta ut platshållarvärdena mot avlästa/verifierade
värden utan omskrivning.
