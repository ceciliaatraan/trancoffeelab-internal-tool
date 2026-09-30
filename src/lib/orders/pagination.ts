export const PER_PAGE_OPTIONS = [25, 50, 100] as const;
export const DEFAULT_PER_PAGE = 25;

type Params = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Sida och antal per sida ur URL:en - okända/ogiltiga värden faller tillbaka på sida 1 och 25 per sida. */
export function parsePageParams(params: Params): { page: number; perPage: number } {
  const perPageRaw = Number(single(params.perPage));
  const perPage = (PER_PAGE_OPTIONS as readonly number[]).includes(perPageRaw)
    ? perPageRaw
    : DEFAULT_PER_PAGE;
  const pageRaw = Number(single(params.page));
  const page = Number.isInteger(pageRaw) && pageRaw >= 1 ? pageRaw : 1;
  return { page, perPage };
}

/** Antal sidor - alltid minst 1, även när listan är tom. */
export function pageCount(total: number, perPage: number): number {
  return Math.max(1, Math.ceil(total / perPage));
}

/**
 * Sidnummer att visa i pagineringen: första, sista och två runt aktuell
 * sida, med null där sidor hoppas över ("…").
 */
export function visiblePages(current: number, total: number): (number | null)[] {
  const wanted = new Set([1, total, current - 1, current, current + 1].filter((p) => p >= 1 && p <= total));
  const sorted = [...wanted].sort((a, b) => a - b);
  const result: (number | null)[] = [];
  for (const [index, p] of sorted.entries()) {
    if (index > 0 && p - sorted[index - 1] > 1) result.push(null);
    result.push(p);
  }
  return result;
}

/** Bygger /orders-URL:en med befintliga filter (q, status, perPage) och ändringar. */
export function ordersHref(
  current: { q: string; status: string; perPage: number; page: number },
  changes: Partial<{ page: number; perPage: number }>,
): string {
  const next = { ...current, ...changes };
  const search = new URLSearchParams();
  if (next.q) search.set("q", next.q);
  if (next.status) search.set("status", next.status);
  if (next.perPage !== DEFAULT_PER_PAGE) search.set("perPage", String(next.perPage));
  if (next.page > 1) search.set("page", String(next.page));
  const qs = search.toString();
  return qs ? `/orders?${qs}` : "/orders";
}
