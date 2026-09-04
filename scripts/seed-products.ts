// Ersätter platshållarprodukterna från tidiga faser (Dancing Dragon /
// Drunken Tiger / No Regrets Horse — testdata, fanns aldrig på sajten)
// med de fem riktiga produkterna som redan finns på trancoffeelab.com
// (ceciliaatraan/trancoffeelab-website, src/data/products.ts). Källan för
// namn/beskrivning/pris är sajten — bekräftat av ägaren, se
// docs/kustom.md "Designbeslut som INTE kommer från Kustom-dokumentationen".
//
// Idempotent: kan köras flera gånger. Upsertar på slug, tar bara bort de
// tre namngivna platshållar-sluggarna (rör aldrig andra produkter).
//
// Körs med: pnpm exec dotenv -e .env.local -- pnpm exec tsx scripts/seed-products.ts

import { eq, inArray } from "drizzle-orm";
import { db, schema } from "../src/db";

const PLACEHOLDER_SLUGS = [
  "dancing-dragon-draft",
  "drunken-tiger-250g",
  "no-regrets-horse-250g",
];

type SeedProduct = {
  slug: string;
  sku: string;
  nameSv: string;
  nameEn: string;
  descriptionSv: string;
  descriptionEn: string;
  priceOre: number;
  taxRate: number;
  weightGrams: number;
  sortOrder: number;
};

const PRODUCTS: SeedProduct[] = [
  {
    slug: "full-kit",
    sku: "KIT-FULL",
    nameSv: "Komplett Kit",
    nameEn: "The Full Kit",
    descriptionSv:
      "Allt du behöver för att börja brygga autentiskt vietnamesiskt kaffe hemma. Detta kompletta kit innehåller vårt signaturmörka rostade kaffe, traditionell sötad kondenserad mjölk och ett litet phin-filter.",
    descriptionEn:
      "Everything you need to start brewing authentic Vietnamese coffee at home. This complete kit includes our signature dark roast coffee, traditional sweetened condensed milk, and a small phin filter.",
    priceOre: 34900,
    // Blandad leverans (mat + icke-mat) i EN produktrad — admin har bara
    // ett taxRate-fält per produkt, så vi räknar ut en enda blandad sats
    // som ger samma totala momsbelopp som att dela upp priset, enligt
    // ägarens instruktion: kaffe (179 kr) + kondenserad mjölk (49 kr) =
    // 228 kr till 6% livsmedelsmoms, resterande 349 - 228 = 121 kr
    // (phin-filtrets andel av kitpriset) till 25%.
    //   moms = 228 * 6/106 + 121 * 25/125 ≈ 12,91 + 24,20 = 37,11 kr
    //   ex.moms = 349 - 37,11 = 311,89 kr → blandad sats ≈ 37,11/311,89 ≈ 11,90%
    // Samma metod som `weightedAverageTaxRate` för rabattrader i
    // checkout-session (src/app/api/public/checkout/session/route.ts).
    // OBS: att lägga HELA kit-rabatten på icke-matvaran (istället för att
    // fördela den proportionerligt på alla tre varorna) är en mer
    // offensiv tolkning av blandad-leverans-moms än Skatteverkets vanliga
    // proportionering efter marknadsvärde — bekräfta med revisor innan
    // skarp drift.
    taxRate: 1190,
    weightGrams: 800, // Uppskattning (250g kaffe + ~400g mjölk + ~100g filter + emballage) — bekräfta faktisk paketvikt
    sortOrder: 0,
  },
  {
    slug: "signature-coffee",
    sku: "COFFEE-SIG-250",
    // Namnet på själva bönpåsen (bekräftat av ägaren) — "No Regrets Horse"
    // är TRANs första signaturkaffe, samma namn på svenska och engelska.
    // Slug/SKU är oförändrade (signature-coffee/COFFEE-SIG-250) för att inte
    // ändra produktens URL på sajten i onödan.
    nameSv: "No Regrets Horse",
    nameEn: "No Regrets Horse",
    descriptionSv:
      "Vår flaggskeppsblandning, noggrant utvald från högländerna i Buôn Ma Thuột. Dessa bönor är mörkrostade för att framhäva de djärva, chokladiga tonerna som vietnamesiskt kaffe är känt för.",
    descriptionEn:
      "Our flagship blend, carefully sourced from the highlands of Buôn Ma Thuột. These beans are roasted dark to bring out the bold, chocolatey notes that Vietnamese coffee is famous for.",
    priceOre: 17900,
    taxRate: 600, // Livsmedel — 6%, enligt ägarens bekräftelse
    weightGrams: 250,
    sortOrder: 1,
  },
  {
    slug: "condensed-milk",
    sku: "MILK-COND",
    nameSv: "Kondenserad Mjölk",
    nameEn: "Condensed Milk",
    descriptionSv:
      "Den hemliga ingrediensen som förvandlar vietnamesiskt kaffe till något magiskt. Denna rika, krämiga sötade kondenserade mjölk är nödvändig för att göra autentisk cà phê sữa đá.",
    descriptionEn:
      "The secret ingredient that transforms Vietnamese coffee into something magical. This rich, creamy sweetened condensed milk is essential for making authentic cà phê sữa đá.",
    priceOre: 4900,
    taxRate: 600, // Livsmedel — 6%
    weightGrams: 400, // Uppskattning (standardburk ~397g) — bekräfta faktisk vikt
    sortOrder: 2,
  },
  {
    slug: "phin-filter-small",
    sku: "PHIN-S",
    nameSv: "Phin-filter Liten",
    nameEn: "Phin Filter Small",
    descriptionSv:
      "Phin är hjärtat i vietnamesisk kaffekultur. Detta kompakta rostfria filter sitter perfekt ovanpå din kopp eller glas och droppar långsamt rikt, koncentrerat kaffe.",
    descriptionEn:
      "The phin is the heart of Vietnamese coffee culture. This compact stainless steel filter sits perfectly on top of your cup or glass, slowly dripping rich, concentrated coffee.",
    priceOre: 19900,
    taxRate: 2500, // Inte livsmedel — 25%
    weightGrams: 100, // Uppskattning — bekräfta faktisk vikt
    sortOrder: 3,
  },
  {
    slug: "phin-filter-large",
    sku: "PHIN-L",
    nameSv: "Phin-filter Stor",
    nameEn: "Phin Filter Large",
    descriptionSv:
      "För dig som behöver mer kaffe (vi förstår) brygger detta större phin-filter tillräckligt för 2-3 koppar på en gång. Samma traditionella design, samma autentiska smak, bara mer av det.",
    descriptionEn:
      "For those who need more coffee (we understand), this larger phin filter brews enough for 2-3 cups at once. Same traditional design, same authentic taste, just more of it.",
    priceOre: 24900,
    taxRate: 2500, // Inte livsmedel — 25%
    weightGrams: 150, // Uppskattning — bekräfta faktisk vikt
    sortOrder: 4,
  },
];

async function main() {
  const removed = await db
    .delete(schema.products)
    .where(inArray(schema.products.slug, PLACEHOLDER_SLUGS))
    .returning({ slug: schema.products.slug });
  console.log(`Tog bort ${removed.length} platshållarprodukt(er):`, removed.map((r) => r.slug));

  for (const product of PRODUCTS) {
    const [row] = await db
      .insert(schema.products)
      .values({
        slug: product.slug,
        sku: product.sku,
        nameSv: product.nameSv,
        nameEn: product.nameEn,
        descriptionSv: product.descriptionSv,
        descriptionEn: product.descriptionEn,
        priceOre: product.priceOre,
        taxRate: product.taxRate,
        weightGrams: product.weightGrams,
        status: "published",
        sortOrder: product.sortOrder,
      })
      .onConflictDoUpdate({
        target: schema.products.slug,
        set: {
          sku: product.sku,
          nameSv: product.nameSv,
          nameEn: product.nameEn,
          descriptionSv: product.descriptionSv,
          descriptionEn: product.descriptionEn,
          priceOre: product.priceOre,
          taxRate: product.taxRate,
          weightGrams: product.weightGrams,
          sortOrder: product.sortOrder,
          updatedAt: new Date(),
        },
      })
      .returning({ id: schema.products.id, slug: schema.products.slug });

    const [existingInventory] = await db
      .select({ id: schema.inventory.id })
      .from(schema.inventory)
      .where(eq(schema.inventory.productId, row.id));

    if (!existingInventory) {
      await db.insert(schema.inventory).values({ productId: row.id });
    }

    console.log(`Upsertade ${row.slug} (${product.sku})`);
  }

  console.log(
    "\nKlart. Bilder saknas fortfarande (images: []) — ladda upp de riktiga produktfotona " +
      "(finns lokalt i trancoffeelab-website/src/assets/) via /products/[id] i adminet. " +
      "is_preorder är satt till false (standard) på alla fem — sätt per produkt i adminet " +
      "när lanseringsstrategin är bestämd.",
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("SEED FAILED:", err);
  process.exit(1);
});
