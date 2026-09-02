import "server-only";
import type { MerchantUrls } from "./order-payload";

/**
 * Byggs från NEXT_PUBLIC_STOREFRONT_URL/NEXT_PUBLIC_ADMIN_URL, aldrig
 * hårdkodat. Sökvägarna själva (t.ex. /villkor) kommer direkt ur specen.
 * `validation` MÅSTE skickas med till Kustom — annars anropas
 * /api/kustom/validate aldrig.
 */
export function getMerchantUrls(): MerchantUrls {
  const storefrontUrl = process.env.NEXT_PUBLIC_STOREFRONT_URL;
  const adminUrl = process.env.NEXT_PUBLIC_ADMIN_URL;

  if (!storefrontUrl || !adminUrl) {
    throw new Error(
      "NEXT_PUBLIC_STOREFRONT_URL/NEXT_PUBLIC_ADMIN_URL saknas. Kopiera .env.example till .env.local.",
    );
  }

  return {
    terms: `${storefrontUrl}/villkor`,
    checkout: `${storefrontUrl}/checkout`,
    confirmation: `${storefrontUrl}/tack?order_id={checkout.order.id}`,
    push: `${adminUrl}/api/kustom/push?order_id={checkout.order.id}`,
    validation: `${adminUrl}/api/kustom/validate`,
  };
}
