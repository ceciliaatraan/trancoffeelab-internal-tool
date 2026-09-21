import { NextResponse } from "next/server";
import { checkRateLimit, corsHeaders, getClientIp, resolveAllowedOrigin } from "@/lib/public-api";
import { cartRequestSchema } from "@/lib/validation/cart";
import { buildValidatedCart } from "@/lib/queries/cart-summary";
import {
  buildCreateOrderPayload,
  type CartItemInput,
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

  // Rabattraden kan aldrig göra order_amount negativt - frakten är inte
  // längre med i order_amount alls (se ovan), så taket är produkternas
  // egen delsumma. En rabattkod värd mer än det (t.ex. en "100 % på allt,
  // inklusive frakt"-kod) kan alltså inte tvinga fram gratis frakt när
  // Kustom hämtar ett live PostNord-pris - det är en gräns i hur Kustom
  // Shipping Assistant fungerar (fraktpriset läggs på UTANFÖR
  // order_amount), inte något vi kan runda via payloaden. Vanliga
  // rabatter (mindre än ordersumman) blir alltid rätt.
  const discountAmountOre = cart.discount?.valid
    ? Math.min(cart.discount.amountOre, cart.subtotalOre)
    : 0;

  const payload = buildCreateOrderPayload({
    items,
    shippingOption,
    // Hela rabatten (produkter + frakt, inom taket ovan) hamnar på den
    // här raden - se kommentaren vid shippingAmountOre ovan för varför.
    discount:
      discountAmountOre > 0 && cart.discount?.valid
        ? {
            code: cart.discount.code,
            amountOre: discountAmountOre,
            taxRateHundredthsPercent: shippingTaxRate,
          }
        : undefined,
    locale: parsed.data.locale,
    merchantUrls: getMerchantUrls(),
  });

  try {
    const order = await createOrder(payload);
    return NextResponse.json(
      {
        html_snippet: extractHtmlSnippet(order),
        order_id: extractOrderId(order),
        // The discount was already resolved into the Kustom payload above -
        // echoed back here so the storefront's own order summary (which has
        // no other way to know the amount) can actually show it. Uses the
        // capped discountAmountOre so the summary never shows a bigger
        // discount than what was actually applied to order_amount.
        discount:
          discountAmountOre > 0 && cart.discount?.valid
            ? { code: cart.discount.code, amountOre: discountAmountOre }
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
