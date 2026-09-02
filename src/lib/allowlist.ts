/**
 * Läser ALLOWED_ADMIN_EMAILS/ALLOWED_GOOGLE_HD direkt ur miljövariabler vid
 * varje anrop (inte vid modul-load) så att ändringar i Vercel slår igenom
 * utan att kräva en ombyggd bundle.
 */
export function getAllowedAdminEmails(): Set<string> {
  const raw = process.env.ALLOWED_ADMIN_EMAILS ?? "";
  return new Set(
    raw
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter((email) => email.length > 0),
  );
}

export function getAllowedGoogleHd(): string | null {
  const raw = process.env.ALLOWED_GOOGLE_HD?.trim();
  return raw && raw.length > 0 ? raw : null;
}

export function isEmailAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  return getAllowedAdminEmails().has(email.trim().toLowerCase());
}
