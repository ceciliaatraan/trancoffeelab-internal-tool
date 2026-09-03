import { NextResponse } from "next/server";
import { checkRateLimit, corsHeaders, getClientIp, resolveAllowedOrigin } from "@/lib/public-api";
import { cartRequestSchema } from "@/lib/validation/cart";
import { buildValidatedCart } from "@/lib/queries/cart-summary";
import { buildCreateOrderPayload, type CartItemInput, type ShippingInput } from "@/lib/kustom/order-payload";
import { getMerchantUrls } from "@/lib/kustom/merchant-urls";
import { createOrder, extractHtmlSnippet, extractOrderId, KustomApiError } from "@/lib/kustom/client";
import { getShopSettings } from "@/lib/settings";

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
  }));

  const shopSettings = await getShopSettings();
  const freeShipping =
    shopSettings.freeShippingThresholdOre !== null &&
    cart.subtotalOre >= shopSettings.freeShippingThresholdOre;

  const shipping: ShippingInput | undefined = freeShipping
    ? undefined
    : {
        nameSv: "Frakt",
        nameEn: "Shipping",
        amountOre: shopSettings.shippingFlatRateOre,
        taxRateHundredthsPercent: shopSettings.shippingTaxRate,
      };

  const payload = buildCreateOrderPayload({
    items,
    shipping,
    discount:
      cart.discount?.valid && cart.discount.amountOre > 0
        ? {
            code: cart.discount.code,
            amountOre: cart.discount.amountOre,
            taxRateHundredthsPercent: weightedAverageTaxRate(cart.items),
          }
        : undefined,
    locale: parsed.data.locale,
    merchantUrls: getMerchantUrls(),
  });

  try {
    const order = await createOrder(payload);
    return NextResponse.json(
      { html_snippet: extractHtmlSnippet(order), order_id: extractOrderId(order) },
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
 * Rabattraden behöver en representativ momssats. Vi använder ett
 * kvantitetsviktat snitt av kundvagnens rader — en egen designbeslut
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
