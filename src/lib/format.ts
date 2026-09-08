const currencyFormatter = new Intl.NumberFormat("sv-SE", {
  style: "currency",
  currency: "SEK",
});

/**
 * Utan explicit timeZone används körtidens egen (UTC på Vercels
 * serverless-funktioner) — inte besökarens, eftersom det här renderas
 * server-side. Låst till svensk tid så klockslag i adminet stämmer med
 * väggklockan, oavsett var koden faktiskt körs.
 */
const dateFormatter = new Intl.DateTimeFormat("sv-SE", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Europe/Stockholm",
});

export function formatOre(ore: number): string {
  return currencyFormatter.format(ore / 100);
}

export function formatTaxRate(taxRateHundredthsPercent: number): string {
  return `${(taxRateHundredthsPercent / 100).toLocaleString("sv-SE")}%`;
}

export function formatDateTime(date: Date): string {
  return dateFormatter.format(date);
}
