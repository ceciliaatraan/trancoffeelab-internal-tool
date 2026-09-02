import { NextResponse } from "next/server";
import { checkRateLimit, corsHeaders, getClientIp, resolveAllowedOrigin } from "@/lib/public-api";
import { cartRequestSchema } from "@/lib/validation/cart";
import { buildValidatedCart } from "@/lib/queries/cart-summary";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");

  if (origin && !resolveAllowedOrigin(origin)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const rateLimit = checkRateLimit(`cart-validate:${getClientIp(request)}`);
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

  return NextResponse.json(cart, { headers: corsHeaders(origin) });
}

export function OPTIONS(request: Request) {
  const origin = request.headers.get("origin");
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}
