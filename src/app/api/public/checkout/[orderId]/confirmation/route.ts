import { NextResponse } from "next/server";
import { checkRateLimit, corsHeaders, getClientIp, resolveAllowedOrigin } from "@/lib/public-api";
import { KustomApiError, extractHtmlSnippet, readOrder } from "@/lib/kustom/client";

/**
 * ÖPPET/eget antagande: readOrder (checkout v3) antas returnera samma
 * html_snippet-fält efter att ordern slutförts som vid skapandet — det
 * är samma resurs i samma API-yta (checkout v3), inte bekräftat separat
 * mot docs.kustom.co. Se docs/kustom.md.
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
