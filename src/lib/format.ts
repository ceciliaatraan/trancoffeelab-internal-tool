const currencyFormatter = new Intl.NumberFormat("sv-SE", {
  style: "currency",
  currency: "SEK",
});

const dateFormatter = new Intl.DateTimeFormat("sv-SE", {
  dateStyle: "short",
  timeStyle: "short",
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
