/**
 * Antal som räknas som "går att sälja" för en lagerrad när butiken/kassan
 * avgör om något kan köpas. Med allowBackorder ("Sälj vid slut i lager")
 * räknas raden som i praktiken obegränsad, så köp aldrig blockeras - det
 * fria lagret (I lager - reserverat - skickat) får då gå under noll och
 * fylls på av nästa leverans. Ett stort ändligt tal i stället för Infinity,
 * eftersom värdet skickas som JSON (maxAvailable) och Infinity blir null där.
 */
export const BACKORDER_SELLABLE_QUANTITY = 9999;

export function sellableQuantity(stock: {
  quantity: number | null;
  reservedQuantity: number | null;
  shippedQuantity: number | null;
  allowBackorder: boolean | null;
}): number {
  if (stock.allowBackorder) return BACKORDER_SELLABLE_QUANTITY;
  return Math.max(
    0,
    (stock.quantity ?? 0) - (stock.reservedQuantity ?? 0) - (stock.shippedQuantity ?? 0),
  );
}
