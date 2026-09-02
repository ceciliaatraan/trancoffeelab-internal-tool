import "server-only";

/**
 * Tillåter https://trancoffeelab.com (från PUBLIC_API_ALLOWED_ORIGINS) och
 * http://localhost:* i dev, enligt spec. Origin utan matchning nekas.
 */
export function resolveAllowedOrigin(originHeader: string | null): string | null {
  if (!originHeader) return null;

  if (
    process.env.NODE_ENV !== "production" &&
    /^http:\/\/localhost(:\d+)?$/.test(originHeader)
  ) {
    return originHeader;
  }

  const allowed = (process.env.PUBLIC_API_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return allowed.includes(originHeader) ? originHeader : null;
}

export function corsHeaders(originHeader: string | null): HeadersInit {
  const allowedOrigin = resolveAllowedOrigin(originHeader);
  const headers: Record<string, string> = { Vary: "Origin" };

  if (allowedOrigin) {
    headers["Access-Control-Allow-Origin"] = allowedOrigin;
    headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type";
  }

  return headers;
}

export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

type RateLimitBucket = { count: number; resetAt: number };

/**
 * In-memory fast window-räknare, per Node-process. Fungerar för en enda
 * long-lived server men är INTE delad mellan flera Vercel-instanser —
 * tillräckligt för att stoppa enkel missbruk nu, byt till en delad store
 * (t.ex. Upstash Redis) innan trafiken motiverar det.
 */
const buckets = new Map<string, RateLimitBucket>();

export function checkRateLimit(
  key: string,
  { limit = 60, windowMs = 60_000 }: { limit?: number; windowMs?: number } = {},
): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (bucket.count >= limit) {
    return { allowed: false, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
  }

  bucket.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}
