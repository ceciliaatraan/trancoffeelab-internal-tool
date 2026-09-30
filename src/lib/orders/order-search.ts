/**
 * Söktermer för orderlistans sökruta: varje ord (max 6) måste finnas någon
 * stans i orderns sökbara text (namn, adress, e-post, spårningsnummer...),
 * så "Huy Nguyen" och "Rättgatan 5 Göteborg" hittar rätt order oavsett
 * vilket fält orden står i.
 */
export function searchTerms(query: string): string[] {
  return query.trim().split(/\s+/).filter(Boolean).slice(0, 6);
}

/** Gör % och _ (och \) i användarens text bokstavliga i ett ILIKE-mönster. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** ILIKE-mönster för "innehåller", med användarens text escapad. */
export function containsPattern(value: string): string {
  return `%${escapeLike(value)}%`;
}
