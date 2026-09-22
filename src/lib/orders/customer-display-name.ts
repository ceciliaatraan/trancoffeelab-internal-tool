type ShippingAddress = { given_name?: string; family_name?: string };

/**
 * Namn från leveransadressen om det finns, annars e-post. Delad mellan
 * /orders-listan och Dashboard-startsidans "Senaste ordrar" så de visar
 * samma sak.
 */
export function customerDisplayName(order: {
  customerEmail: string;
  shippingAddress: unknown;
}): string {
  const address = order.shippingAddress as ShippingAddress | null;
  const name = [address?.given_name, address?.family_name].filter(Boolean).join(" ").trim();
  return name || order.customerEmail;
}
