/**
 * Adressfälten som går att redigera på en order - samma fältnamn som
 * Kustoms adressobjekt (orders.shipping_address/billing_address), så
 * resten av systemet (plocklista, PostNord-export, postnummerkollen i
 * PostNord-synken) läser den rättade adressen precis som en från Kustom.
 */
export const EDITABLE_ADDRESS_FIELDS = [
  "given_name",
  "family_name",
  "organization_name",
  "street_address",
  "street_address2",
  "postal_code",
  "city",
  "country",
  "phone",
] as const;

export type EditableAddressField = (typeof EDITABLE_ADDRESS_FIELDS)[number];

const REQUIRED: EditableAddressField[] = ["given_name", "family_name", "street_address", "postal_code", "city", "country"];

const LABELS: Record<EditableAddressField, string> = {
  given_name: "Förnamn",
  family_name: "Efternamn",
  organization_name: "Företag",
  street_address: "Gatuadress",
  street_address2: "Adressrad 2",
  postal_code: "Postnummer",
  city: "Ort",
  country: "Land",
  phone: "Telefon",
};

export type ParsedAddress =
  | { ok: true; address: Record<string, unknown> }
  | { ok: false; error: string };

/**
 * Läser ett adressformulär och slår ihop det med den befintliga adressen -
 * fält formuläret inte visar (t.ex. email, region, title) behålls. Tomma
 * valfria fält tas bort. Land sparas som ISO-kod med gemener (som Kustom).
 */
export function parseAddressForm(
  get: (field: string) => string | null | undefined,
  existing: unknown,
): ParsedAddress {
  const base =
    existing && typeof existing === "object" ? { ...(existing as Record<string, unknown>) } : {};

  for (const field of EDITABLE_ADDRESS_FIELDS) {
    const value = (get(field) ?? "").trim();
    if (!value) {
      if (REQUIRED.includes(field)) return { ok: false, error: `Fyll i ${LABELS[field].toLowerCase()}.` };
      delete base[field];
      continue;
    }
    base[field] = value;
  }

  const country = String(base.country).toLowerCase();
  if (!/^[a-z]{2}$/.test(country)) {
    return { ok: false, error: "Land ska anges som landskod med två bokstäver, t.ex. SE." };
  }
  base.country = country;
  return { ok: true, address: base };
}
