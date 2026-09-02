import { NextResponse } from "next/server";
import { kustomValidationRequestSchema } from "@/lib/validation/kustom-order";
import { resolveCartLine } from "@/lib/queries/cart";

/**
 * Kustom POSTar hela orderrepresentationen hit (bekräftat mot
 * docs.kustom.co, se docs/kustom.md) — svarar Kustom förstår som avslag
 * är HTTP 400 med { error_type, error_text }. error_type måste vara ett
 * av unsupported_shipping_address/address_error/approval_failed; inget
 * av dem betyder uttryckligen "slut i lager" så vi använder
 * approval_failed (eget val, dokumenterat i docs/kustom.md).
 */
function denyResponse(errorText: string) {
  return NextResponse.json(
    { error_type: "approval_failed", error_text: errorText },
    { status: 400 },
  );
}

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return denyResponse("Kunde inte läsa ordern.");
  }

  const parsed = kustomValidationRequestSchema.safeParse(json);
  if (!parsed.success) {
    return denyResponse("Ordern saknar förväntad data.");
  }

  const requestedByReference = new Map<string, number>();
  for (const line of parsed.data.order_lines) {
    if (line.type !== "physical" || !line.reference) continue;
    requestedByReference.set(
      line.reference,
      (requestedByReference.get(line.reference) ?? 0) + line.quantity,
    );
  }

  for (const [reference, quantity] of requestedByReference) {
    const resolved = await resolveCartLine(reference);
    if (!resolved || resolved.available < quantity) {
      return denyResponse(
        "En eller flera varor i ordern är inte längre tillgängliga i den mängden.",
      );
    }
  }

  return new NextResponse(null, { status: 200 });
}
