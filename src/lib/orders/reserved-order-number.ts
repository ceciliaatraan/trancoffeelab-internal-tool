/**
 * Läser tillbaka ordernumret vi reserverade när kassan öppnades och skickade
 * till Kustom som merchant_reference1 (se reserve-order-number.ts). Bara
 * rena siffror från 1000 och uppåt (orders.order_number börjar på 1000) -
 * allt annat (tomt, satt av någon annan i Kustoms portal m.m.) ignoreras och
 * ordern får ett nytt nummer som vanligt.
 */
export function parseReservedOrderNumber(merchantReference1: string | null | undefined): number | null {
  if (!merchantReference1 || !/^\d{4,9}$/.test(merchantReference1.trim())) return null;
  const value = Number(merchantReference1.trim());
  return value >= 1000 ? value : null;
}
