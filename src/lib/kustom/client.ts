import "server-only";
import { buildKustomAuthHeader } from "./auth";
import type { KustomCreateOrderPayload } from "./order-payload";

/**
 * Kustoms svarsform för en order är INTE fullt verifierad mot
 * docs.kustom.co (blockerad nätverksåtkomst under utveckling, se
 * docs/kustom.md). Vi typar bara det vi faktiskt läser ut, defensivt,
 * och isolerar det osäkra fältnamnet i extractOrderId/extractHtmlSnippet
 * nedan så det är en enda plats att rätta när ni bekräftat formatet.
 */
export type KustomOrderResponse = Record<string, unknown>;

export class KustomApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "KustomApiError";
    this.status = status;
    this.body = body;
  }
}

function getConfig() {
  const baseUrl = process.env.KUSTOM_API_BASE_URL;
  const apiKey = process.env.KUSTOM_API_KEY;
  const username = process.env.KUSTOM_BASIC_AUTH_USERNAME || undefined;

  if (!baseUrl || !apiKey) {
    throw new Error(
      "KUSTOM_API_BASE_URL/KUSTOM_API_KEY saknas. Kopiera .env.example till .env.local.",
    );
  }

  return { baseUrl: baseUrl.replace(/\/$/, ""), apiKey, username };
}

async function kustomFetch<T extends KustomOrderResponse>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const { baseUrl, apiKey, username } = getConfig();

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: buildKustomAuthHeader({ apiKey, username }),
      ...init.headers,
    },
    cache: "no-store",
  });

  const text = await response.text();
  let body: unknown = null;
  if (text.length > 0) {
    try {
      body = JSON.parse(text);
    } catch {
      // Kustom (eller något framför den) svarade med icke-JSON — troligen
      // ett infrastrukturfel. Behåll råtexten så felet går att felsöka.
      body = { raw: text };
    }
  }

  if (!response.ok) {
    throw new KustomApiError(
      `Kustom API-fel (${response.status}) på ${path}`,
      response.status,
      body,
    );
  }

  return (body ?? {}) as T;
}

/** POST /checkout/v3/orders — skapar en ny checkout-session. */
export function createOrder(payload: KustomCreateOrderPayload) {
  return kustomFetch<KustomOrderResponse>("/checkout/v3/orders", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** GET /checkout/v3/orders/{order_id} */
export function readOrder(orderId: string) {
  return kustomFetch<KustomOrderResponse>(
    `/checkout/v3/orders/${encodeURIComponent(orderId)}`,
  );
}

/**
 * POST /checkout/v3/orders/{order_id} — går enligt spec bara medan
 * status är checkout_incomplete.
 */
export function updateOrder(
  orderId: string,
  payload: Partial<KustomCreateOrderPayload>,
) {
  return kustomFetch<KustomOrderResponse>(
    `/checkout/v3/orders/${encodeURIComponent(orderId)}`,
    { method: "POST", body: JSON.stringify(payload) },
  );
}

/**
 * ÖPPET — ej verifierat: vi antar fältet heter `order_id` (matchar
 * merchant_urls-templatingen `{checkout.order.id}` i spec) men Kustoms
 * faktiska svar kan använda `id`. Kastar tydligt hellre än att gissa tyst.
 */
export function extractOrderId(order: KustomOrderResponse): string {
  const value = order.order_id ?? order.id;
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(
      "Kunde inte hitta order-id i Kustoms svar (förväntade order_id eller id) — se docs/kustom.md.",
    );
  }
  return value;
}

export function extractHtmlSnippet(order: KustomOrderResponse): string {
  const value = order.html_snippet;
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("Kunde inte hitta html_snippet i Kustoms svar.");
  }
  return value;
}

/**
 * Order Management API (bekräftad mot OpenAPI-specifikationen ni
 * skickade, se docs/kustom.md) — en ANNAN API-yta än /checkout/v3/*
 * ovan, för ordrar efter att kunden slutfört checkout.
 */
export type KustomOrderManagementStatus =
  | "AUTHORIZED"
  | "PART_CAPTURED"
  | "CAPTURED"
  | "CANCELLED"
  | "EXPIRED"
  | "CLOSED";

export type KustomAddress = {
  attention?: string;
  city?: string;
  country?: string;
  email?: string;
  family_name?: string;
  given_name?: string;
  organization_name?: string;
  phone?: string;
  postal_code?: string;
  region?: string;
  street_address?: string;
  street_address2?: string;
  title?: string;
};

export type KustomOrderManagementLine = {
  type?: string;
  reference?: string;
  name: string;
  quantity: number;
  quantity_unit?: string;
  unit_price: number;
  tax_rate?: number;
  total_amount: number;
  total_discount_amount?: number;
  total_tax_amount?: number;
};

export type KustomOrderManagementOrder = {
  order_id: string;
  status: KustomOrderManagementStatus;
  purchase_country: string;
  purchase_currency: string;
  locale: string;
  order_amount: number;
  original_order_amount?: number;
  order_lines: KustomOrderManagementLine[];
  billing_address?: KustomAddress;
  shipping_address?: KustomAddress;
  captured_amount: number;
  refunded_amount: number;
  remaining_authorized_amount: number;
  created_at: string;
  expires_at?: string;
  merchant_reference1?: string;
  merchant_reference2?: string;
  klarna_reference?: string;
};

function idempotencyHeader(key?: string): HeadersInit | undefined {
  return key ? { "Klarna-Idempotency-Key": key } : undefined;
}

/** GET /ordermanagement/v1/orders/{order_id} */
export function getOrderManagementOrder(orderId: string) {
  return kustomFetch<KustomOrderManagementOrder & KustomOrderResponse>(
    `/ordermanagement/v1/orders/${encodeURIComponent(orderId)}`,
  );
}

/**
 * POST /ordermanagement/v1/orders/{order_id}/acknowledge — 204 vid
 * lyckat anrop. Måste anropas för varje ny order, annars flaggas den
 * som väntande hos Kustom.
 */
export function acknowledgeOrder(orderId: string, idempotencyKey?: string) {
  return kustomFetch<KustomOrderResponse>(
    `/ordermanagement/v1/orders/${encodeURIComponent(orderId)}/acknowledge`,
    { method: "POST", headers: idempotencyHeader(idempotencyKey) },
  );
}

export type CaptureOrderPayload = {
  captured_amount: number;
  description?: string;
  reference?: string;
};

/** POST /ordermanagement/v1/orders/{order_id}/captures */
export function captureOrder(
  orderId: string,
  payload: CaptureOrderPayload,
  idempotencyKey?: string,
) {
  return kustomFetch<KustomOrderResponse>(
    `/ordermanagement/v1/orders/${encodeURIComponent(orderId)}/captures`,
    {
      method: "POST",
      body: JSON.stringify(payload),
      headers: idempotencyHeader(idempotencyKey),
    },
  );
}

export type RefundOrderPayload = {
  refunded_amount: number;
  description?: string;
  reference?: string;
};

/** POST /ordermanagement/v1/orders/{order_id}/refunds */
export function refundOrder(
  orderId: string,
  payload: RefundOrderPayload,
  idempotencyKey?: string,
) {
  return kustomFetch<KustomOrderResponse>(
    `/ordermanagement/v1/orders/${encodeURIComponent(orderId)}/refunds`,
    {
      method: "POST",
      body: JSON.stringify(payload),
      headers: idempotencyHeader(idempotencyKey),
    },
  );
}

/**
 * POST /ordermanagement/v1/orders/{order_id}/cancel — 204. Går enligt
 * OpenAPI-specen inte om ordern redan har captures eller är stängd
 * (403 CANCEL_NOT_ALLOWED).
 */
export function cancelOrder(orderId: string, idempotencyKey?: string) {
  return kustomFetch<KustomOrderResponse>(
    `/ordermanagement/v1/orders/${encodeURIComponent(orderId)}/cancel`,
    { method: "POST", headers: idempotencyHeader(idempotencyKey) },
  );
}
