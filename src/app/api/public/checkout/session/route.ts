import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { checkRateLimit, corsHeaders, getClientIp, resolveAllowedOrigin } from "@/lib/public-api";
import { cartRequestSchema } from "@/lib/validation/cart";
import { buildValidatedCart } from "@/lib/queries/cart-summary";
import {
  buildCreateOrderPayload,
  type CartItemInput,
  type DiscountInput,
  type KustomShippingOption,
} from "@/lib/kustom/order-payload";
import { calculateTaxFromGross } from "@/lib/kustom/tax";
import { getMerchantUrls } from "@/lib/kustom/merchant-urls";
import { createOrder, extractHtmlSnippet, extractOrderId, KustomApiError } from "@/lib/kustom/client";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");

  if (origin && !resolveAllowedOrigin(origin)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const rateLimit = checkRateLimit(`checkout-session:${getClientIp(request)}`);
  if (!rateLimit.allowed) {
    return new NextResponse("Too Many Requests", {
      status: 429,
      headers: { ...corsHeaders(origin), "Retry-After": String(rateLimit.retryAfterSeconds) },
    });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return new NextResponse("Invalid JSON", { status: 400, headers: corsHeaders(origin) });
  }

  const parsed = cartRequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Ogiltig varukorg" },
      { status: 400, headers: corsHeaders(origin) },
    );
  }

  const cart = await buildValidatedCart(parsed.data);

  if (!cart.valid) {
    return NextResponse.json(
      { error: "En eller flera varor i varukorgen är inte tillgängliga i den mängden.", cart },
      { status: 409, headers: corsHeaders(origin) },
    );
  }

  if (cart.discount && !cart.discount.valid) {
    return NextResponse.json(
      { error: cart.discount.reason },
      { status: 400, headers: corsHeaders(origin) },
    );
  }

  const items: CartItemInput[] = cart.items.map((item) => ({
    sku: item.sku,
    nameSv: item.nameSv,
    nameEn: item.nameEn,
    quantity: item.quantity,
    unitPriceOre: item.unitPriceOre,
    taxRateHundredthsPercent: item.taxRate,
    weightGrams: item.weightGrams,
  }));

  // Frakten skickas ALDRIG som en egen shipping_fee-rad i order_lines
  // (och alltså inte heller med i order_amount) - sedan Kustom Shipping
  // Assistant/PostNord-integrationen kopplades in 2026-09-21 lägger
  // Kustom SJÄLVA på det valda fraktpriset ovanpå ordersumman i sin
  // egen checkout-widget. Skickade vi en egen fraktrad OCH shipping_
  // options dubbelräknades frakten (49 kr + 49 kr) - se docs/kustom.md.
  // KSA:s fallback-alternativ (nedan) är nu den ENDA källan till
  // fraktpris, tillsammans med PostNords live-pris när TMS-anropet lyckas.
  //
  // shippingOption.price skickas ALLTID odiskonterat (inte fraktens
  // shippingDiscountOre-andel avdragen) - en "shipping"/"both"-rabatt
  // hade tidigare bara reducerat det HÄR priset, men Kustoms live
  // PostNord-pris (det som faktiskt debiteras när TMS-anropet lyckas,
  // vilket det gör nu) känner inte alls till vår rabattkod och lades på
  // ordersumman odiskonterat ändå - kunden såg "-49 kr" i vår egen
  // sammanfattning men betalade ändå fullt pris (upptäckt av ägaren
  // 2026-09-21). Löst genom att i stället lägga HELA rabatten
  // (produkter + frakt, cart.discount.amountOre) på rabattraden nedan,
  // som drar av från order_amount - det är det ENDA vi själva helt
  // kontrollerar. Total = order_amount (vårt, rätt rabatterat) +
  // Kustoms fraktpris (odiskonterat men KORREKT) blir alltid rätt,
  // oavsett om Kustom använder sitt live-pris eller fallbacken nedan.
  const shippingTaxRate = weightedAverageTaxRate(cart.items);
  const shippingAmountOre = cart.freeShipping ? 0 : cart.shippingOre;

  const shippingOption: KustomShippingOption = {
    id: "standard",
    name: cart.freeShipping
      ? parsed.data.locale === "en-SE"
        ? "Free shipping"
        : "Fri frakt"
      : parsed.data.locale === "en-SE"
        ? "Shipping"
        : "Frakt",
    price: shippingAmountOre,
    tax_amount: calculateTaxFromGross(shippingAmountOre, shippingTaxRate).taxAmount,
    tax_rate: shippingTaxRate,
  };

  // Samma problem som rabattkoder (se ovan) gäller fri frakt vid
  // tröskelbelopp: shippingAmountOre=0 ovan nollar bara vår egen
  // fallback, inte Kustoms live PostNord-pris. Kompenserar därför här
  // med cart.shippingFlatRateOre (den ORÖRDA flatraten, INTE
  // cart.shippingOre som redan är nollad av fri frakt) på samma sätt -
  // lägg det till på rabattraden i stället.
  const freeShippingCompensationOre = cart.freeShipping ? cart.shippingFlatRateOre : 0;
  const codeDiscountOre = cart.discount?.valid ? cart.discount.amountOre : 0;

  // Rabattraden kan aldrig göra order_amount negativt - frakten är inte
  // längre med i order_amount alls (se ovan), så taket är produkternas
  // egen delsumma. En kombination värd mer än det (t.ex. en "100 % på
  // allt, inklusive frakt"-kod, eller en redan stor rabatt PLUS fri
  // frakt) kan alltså inte tvinga fram gratis frakt när Kustom hämtar
  // ett live PostNord-pris - det är en gräns i hur Kustom Shipping
  // Assistant fungerar (fraktpriset läggs på UTANFÖR order_amount),
  // inte något vi kan runda via payloaden. Vanliga fall (rabatt +
  // ev. fri frakt tillsammans mindre än ordersumman) blir alltid rätt.
  const discountAmountOre = Math.min(codeDiscountOre + freeShippingCompensationOre, cart.subtotalOre);

  const discountLabel: DiscountInput["label"] =
    codeDiscountOre > 0 && freeShippingCompensationOre > 0
      ? {
          sv: `Rabatt (${cart.discount?.valid ? cart.discount.code : ""}) + Fri frakt`,
          en: `Discount (${cart.discount?.valid ? cart.discount.code : ""}) + Free shipping`,
        }
      : freeShippingCompensationOre > 0
        ? { sv: "Fri frakt", en: "Free shipping" }
        : undefined;

  const payload = buildCreateOrderPayload({
    items,
    shippingOption,
    // Rabattkod och/eller fri frakt (inom taket ovan) hamnar tillsammans
    // på den här EN raden - se kommentaren vid shippingAmountOre ovan
    // för varför.
    discount:
      discountAmountOre > 0
        ? {
            code: cart.discount?.valid ? cart.discount.code : "FRI_FRAKT",
            amountOre: discountAmountOre,
            taxRateHundredthsPercent: shippingTaxRate,
            label: discountLabel,
          }
        : undefined,
    locale: parsed.data.locale,
    merchantUrls: getMerchantUrls(),
  });

  try {
    const order = await createOrder(payload);
    const orderId = extractOrderId(order);

    // "Köper som företag" - Kustoms egen checkout-widget har ingen sådan
    // ruta än (kräver ett avtal som inte är signerat, se docs/kustom.md),
    // så vi mellanlagrar uppgifterna själva här, nyckelt på Kustoms
    // order_id, och flyttar in dem på orders-raden i persist-order.ts när
    // ordern faktiskt landar. Ett fel här är aldrig kritiskt för själva
    // köpet - blockerar inte checkout, bara den här extra informationen.
    if (parsed.data.business && orderId) {
      try {
        await db.insert(schema.pendingBusinessPurchases).values({
          kustomOrderId: orderId,
          businessName: parsed.data.business.name,
          businessVatNumber: parsed.data.business.vatNumber,
          businessAddress: parsed.data.business.address,
        });
      } catch (err) {
        console.error("Kunde inte spara företagsuppgifter för order", orderId, err);
      }
    }

    return NextResponse.json(
      {
        html_snippet: extractHtmlSnippet(order),
        order_id: orderId,
        // The discount code's OWN amount, echoed back so the storefront's
        // "Rabatt (CODE)" line can show it - deliberately excludes any
        // free-shipping compensation folded into the Kustom payload above,
        // since the storefront already shows "Fri frakt" as its own thing
        // (the progress bar/threshold UI), independent of a discount code.
        discount:
          cart.discount?.valid && codeDiscountOre > 0
            ? { code: cart.discount.code, amountOre: Math.min(codeDiscountOre, cart.subtotalOre) }
            : null,
      },
      { headers: corsHeaders(origin) },
    );
  } catch (err) {
    if (err instanceof KustomApiError) {
      console.error("Kustom createOrder misslyckades", err.status, err.body);
    } else {
      console.error("Kustom createOrder misslyckades", err);
    }
    return NextResponse.json(
      { error: "Kunde inte starta checkout just nu. Försök igen." },
      { status: 502, headers: corsHeaders(origin) },
    );
  }
}

/**
 * Rabatt- och fraktraden behöver en representativ momssats var och en
 * (ingen av dem tillhör ett enskilt varuslag). Vi använder ett
 * kvantitetsviktat snitt av kundvagnens rader - en egen designbeslut
 * (inte hämtat från Kustom-dokumentationen), dokumenterat i docs/kustom.md.
 */
function weightedAverageTaxRate(items: { taxRate: number; quantity: number }[]): number {
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
  if (totalQuantity === 0) return 0;
  const weightedSum = items.reduce((sum, item) => sum + item.taxRate * item.quantity, 0);
  return Math.round(weightedSum / totalQuantity);
}

export function OPTIONS(request: Request) {
  const origin = request.headers.get("origin");
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}
