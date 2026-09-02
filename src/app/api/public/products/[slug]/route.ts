import { NextResponse } from "next/server";
import { checkRateLimit, corsHeaders, getClientIp, resolveAllowedOrigin } from "@/lib/public-api";
import { getPublishedProductBySlug } from "@/lib/queries/public-products";

export async function GET(
  request: Request,
  { params }: RouteContext<"/api/public/products/[slug]">,
) {
  const origin = request.headers.get("origin");

  if (origin && !resolveAllowedOrigin(origin)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const rateLimit = checkRateLimit(`products:${getClientIp(request)}`);
  if (!rateLimit.allowed) {
    return new NextResponse("Too Many Requests", {
      status: 429,
      headers: { ...corsHeaders(origin), "Retry-After": String(rateLimit.retryAfterSeconds) },
    });
  }

  const { slug } = await params;
  const product = await getPublishedProductBySlug(slug);

  if (!product) {
    return new NextResponse("Not Found", { status: 404, headers: corsHeaders(origin) });
  }

  return NextResponse.json({ product }, { headers: corsHeaders(origin) });
}

export function OPTIONS(request: Request) {
  const origin = request.headers.get("origin");
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}
