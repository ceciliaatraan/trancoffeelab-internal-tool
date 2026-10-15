/**
 * Swish egen QR-tjänst för förifyllda betalningar
 * (https://mpc.getswish.net/qrg-swish/api/v1/prefilled) - fungerar med
 * vanliga Swish Företag-nummer, utan avtal eller certifikat. Belopp,
 * mottagare och meddelande är låsta i koden, så kunden kan inte ändra dem.
 */
export const SWISH_QR_URL = "https://mpc.getswish.net/qrg-swish/api/v1/prefilled";

/** Swish-meddelanden får vara högst 50 tecken. */
export const SWISH_MESSAGE_MAX = 50;

export function normalizeSwishNumber(value: string | null | undefined): string | null {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.length >= 8 ? digits : null;
}

export function swishMessageForSale(saleNumber: number): string {
  return `TRAN kassa ${saleNumber}`.slice(0, SWISH_MESSAGE_MAX);
}

export function buildSwishQrRequest(payee: string, amountOre: number, message: string) {
  return {
    format: "svg",
    size: 300,
    border: 1,
    transparent: false,
    payee: { value: payee, editable: false },
    amount: { value: amountOre / 100, editable: false },
    message: { value: message.slice(0, SWISH_MESSAGE_MAX), editable: false },
  };
}
