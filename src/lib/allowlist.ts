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

/**
 * Kassabiträden (ALLOWED_CASHIER_EMAILS) - får logga in men bara använda
 * kassan (/kassa), se proxy.ts och requireCurrentAdmin.
 */
export function getAllowedCashierEmails(): Set<string> {
  const raw = process.env.ALLOWED_CASHIER_EMAILS ?? "";
  return new Set(
    raw
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter((email) => email.length > 0),
  );
}

export function isCashierEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return getAllowedCashierEmails().has(email.trim().toLowerCase());
}

export type AdminRole = "owner" | "staff" | "cashier";

/**
 * Vilken roll ett konto ska ha efter inloggning. null = rör inte rollen
 * (ett nytt konto får då databasens standard, "staff"). Står adressen
 * bara i kassalistan blir kontot alltid kassabiträde - även om det
 * tidigare haft en annan roll. Står den i admin-listan (även om den också
 * står i kassalistan) lyfts ett kassabiträde till "staff"; ägare och
 * personal behåller sin roll.
 */
export function resolveLoginRole(
  email: string | null | undefined,
  existingRole: AdminRole | null,
): AdminRole | null {
  if (isEmailAllowed(email)) return existingRole === "cashier" ? "staff" : null;
  if (isCashierEmail(email)) return "cashier";
  return null;
}
