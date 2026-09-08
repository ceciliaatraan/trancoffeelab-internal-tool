import { NextResponse, after } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { checkRateLimit, corsHeaders, getClientIp, resolveAllowedOrigin } from "@/lib/public-api";
import { KustomApiError, extractHtmlSnippet, readOrder } from "@/lib/kustom/client";
import { processKustomOrder } from "@/lib/orders/process-kustom-order";

/**
 * ÖPPET/eget antagande: readOrder (checkout v3) antas returnera samma
 * html_snippet-fält efter att ordern slutförts som vid skapandet — det
 * är samma resurs i samma API-yta (checkout v3), inte bekräftat separat
 * mot docs.kustom.co. Se docs/kustom.md.
 *
 * Bearbetar ordern (spara/reservera lager/mejla) direkt här också,
 * istället för att bara vänta på push-webhooken — webbläsaren hamnar
 * på den här sidan i samma sekund som betalningen slutförs, medan
 * Kustoms server-till-server-push i praktiken kan dröja ett par
 * minuter. persistOrderFromKustom är idempotent på kustom_order_id, så
 * det är ofarligt att bearbeta ordern både här och (senare, igen) från
 * push — den andra gången ser bara att den redan finns och hoppar över
 * capture/mejl. Push-webhooken behålls som facit/fallback ifall kunden
 * stänger fliken innan den här sidan hinner ladda klart.
 */
export async function GET(
  request: Request,
  { params }: RouteContext<"/api/public/checkout/[orderId]/confirmation">,
) {
  const origin = request.headers.get("origin");

  if (origin && !resolveAllowedOrigin(origin)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const rateLimit = checkRateLimit(`checkout-confirmation:${getClientIp(request)}`);
  if (!rateLimit.allowed) {
    return new NextResponse("Too Many Requests", {
      status: 429,
      headers: { ...corsHeaders(origin), "Retry-After": String(rateLimit.retryAfterSeconds) },
    });
  }

  const { orderId } = await params;

  after(async () => {
    const [webhookEvent] = await db
      .insert(schema.webhookEvents)
      .values({
        source: "checkout_confirmation",
        kustomOrderId: orderId,
        rawPayload: {},
        processed: false,
      })
      .returning({ id: schema.webhookEvents.id });

    try {
      await processKustomOrder(orderId);
      await db
        .update(schema.webhookEvents)
        .set({ processed: true, processedAt: new Date(), errorMessage: null })
        .where(eq(schema.webhookEvents.id, webhookEvent.id));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Okänt fel";
      console.error("Kunde inte eager-bearbeta order från bekräftelsesidan", orderId, err);
      await db
        .update(schema.webhookEvents)
        .set({ processed: false, processedAt: new Date(), errorMessage: message })
        .where(eq(schema.webhookEvents.id, webhookEvent.id));
    }
  });

  try {
    const order = await readOrder(orderId);
    return NextResponse.json(
      { html_snippet: extractHtmlSnippet(order) },
      { headers: corsHeaders(origin) },
    );
  } catch (err) {
    if (err instanceof KustomApiError && err.status === 404) {
      return new NextResponse("Not Found", { status: 404, headers: corsHeaders(origin) });
    }
    console.error("Kunde inte hämta bekräftelse för order", orderId, err);
    return NextResponse.json(
      { error: "Kunde inte hämta orderbekräftelsen just nu." },
      { status: 502, headers: corsHeaders(origin) },
    );
  }
}

export function OPTIONS(request: Request) {
  const origin = request.headers.get("origin");
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}
