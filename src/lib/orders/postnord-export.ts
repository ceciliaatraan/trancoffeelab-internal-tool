export type PostnordExportShippingAddress = {
  given_name?: string;
  family_name?: string;
  email?: string;
  phone?: string;
  street_address?: string;
  postal_code?: string;
  city?: string;
  country?: string;
};

export type PostnordExportOrder = {
  orderNumber: number;
  customerEmail: string;
  shippingAddress: PostnordExportShippingAddress | null;
};

/**
 * PostNords egen mall för adressimport (kolumnnamn/ordning från
 * "template-addresses.csv", delad av ägaren 2026-09-21) - semikolon-
 * separerad, alla fält citattecken-omslutna. Behåll kolumnnamnen EXAKT
 * som PostNord skrivit dem (inkl. deras egna mellanslag), annars kan
 * importen i deras portal misslyckas.
 */
export const POSTNORD_EXPORT_COLUMNS = [
  "First and last name (Private only)",
  "Company Name",
  "Att (Company only)",
  "E-mail",
  "Phone (remember +45/ country code)",
  "Address",
  "Address 2",
  "CO",
  "Postcode",
  "Area",
  "Country Code",
  "Door Code",
  "Receiver ID (InNight)",
  "Sortpos (InNight)",
  "Search tag (Quick ID)",
  "Customer Number",
  "SMS Number",
] as const;

function csvField(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function csvRow(values: string[]): string {
  return values.map(csvField).join(";");
}

/**
 * Bara adressdata, inte vikt/paket/fraktalternativ - PostNords mall
 * (delad av ägaren) har inga sådana kolumner. Vikt m.m. fylls i separat
 * per försändelse i PostNords "Obekräftade"-vy, precis som i det
 * vanliga arbetsflödet.
 */
export function buildPostnordOrderRow(order: PostnordExportOrder): string {
  const address = order.shippingAddress ?? {};
  const name = [address.given_name, address.family_name].filter(Boolean).join(" ");

  return csvRow([
    name,
    "",
    "",
    address.email ?? order.customerEmail,
    address.phone ?? "",
    address.street_address ?? "",
    "",
    "",
    address.postal_code ?? "",
    address.city ?? "",
    (address.country ?? "SE").toUpperCase(),
    "",
    "",
    "",
    `TRAN #${order.orderNumber}`,
    "",
    "",
  ]);
}

/** BOM så Excel/PostNords import tolkar å/ä/ö rätt. */
export function buildPostnordExportCsv(orders: PostnordExportOrder[]): string {
  const rows = [csvRow([...POSTNORD_EXPORT_COLUMNS]), ...orders.map(buildPostnordOrderRow)];
  return "﻿" + rows.join("\r\n") + "\r\n";
}
