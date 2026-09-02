/**
 * Kustom (tidigare Klarna Checkout) autentiserar med HTTP Basic. Enligt
 * spec: nyckeln skickas antingen direkt (base64(<nyckel>:), nyckeln som
 * användarnamn utan lösenord) eller som base64(<MID>-<suffix>:<nyckel>)
 * där <MID>-<suffix> är hela användarnamnet ni fått från Kustom — inte
 * något vi konstruerar själva av KUSTOM_MERCHANT_ID plus en gissad suffix.
 *
 * ÖPPET: vilket format er faktiska nyckel kräver är inte verifierat mot
 * docs.kustom.co än (se docs/kustom.md). Standard är formatet utan eget
 * användarnamn; sätt KUSTOM_BASIC_AUTH_USERNAME om er integration kräver
 * det andra formatet.
 */
export function buildKustomAuthHeader({
  apiKey,
  username,
}: {
  apiKey: string;
  username?: string | null;
}): string {
  const credentials = username ? `${username}:${apiKey}` : `${apiKey}:`;
  const encoded = Buffer.from(credentials, "utf-8").toString("base64");
  return `Basic ${encoded}`;
}
