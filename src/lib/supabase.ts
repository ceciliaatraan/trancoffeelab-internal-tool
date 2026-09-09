import "server-only";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

/**
 * Service role-klienten. Kringgår RLS helt — används ENDAST server-side
 * (Server Actions/Route Handlers), aldrig i klientkod.
 */
function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY saknas. Kopiera .env.example till .env.local.",
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

export const PRODUCT_IMAGES_BUCKET = "product-images";

/**
 * Största tillåtna bildmått (längsta sidan) — gott om marginal för
 * produktsidans stora hero-bild på en retina-skärm, men klipper bort de
 * 4000px+ originalen en telefonkamera producerar rakt av. Kvalitet 82 är
 * en beprövad avvägning: praktiskt oskiljbar från originalet men en
 * bråkdel av filstorleken.
 */
const MAX_DIMENSION_PX = 2400;
const WEBP_QUALITY = 82;

/**
 * Skalar ner och komprimerar en uppladdad bild till WebP innan den
 * lagras — telefonkamerabilder (ofta 4000px+, flera MB) skulle annars
 * gå raka vägen till produktionssajten okomprimerade. Förstorar aldrig
 * en redan liten bild.
 */
async function compressImage(file: File): Promise<Buffer> {
  const bytes = Buffer.from(await file.arrayBuffer());
  return sharp(bytes)
    .rotate() // respect EXIF orientation before resizing, then drop it
    .resize({
      width: MAX_DIMENSION_PX,
      height: MAX_DIMENSION_PX,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();
}

/**
 * Laddar upp en produktbild till Supabase Storage och returnerar den
 * publika URL:en. Bucketen `product-images` måste finnas och ha publik
 * läsbehörighet — skapas manuellt i Supabase Dashboard (se README).
 */
export async function uploadProductImage(
  productId: string,
  file: File,
): Promise<string> {
  const supabase = getSupabaseAdmin();
  let compressed: Buffer;
  try {
    compressed = await compressImage(file);
  } catch {
    throw new Error("Filen kunde inte läsas som en bild.");
  }
  const path = `${productId}/${crypto.randomUUID()}.webp`;

  const { error } = await supabase.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .upload(path, compressed, {
      contentType: "image/webp",
      cacheControl: "31536000",
      upsert: false,
    });

  if (error) {
    throw new Error(`Kunde inte ladda upp bild: ${error.message}`);
  }

  const { data } = supabase.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .getPublicUrl(path);

  return data.publicUrl;
}

export async function deleteProductImage(publicUrl: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const marker = `/${PRODUCT_IMAGES_BUCKET}/`;
  const index = publicUrl.indexOf(marker);
  if (index === -1) return;

  const path = publicUrl.slice(index + marker.length);
  await supabase.storage.from(PRODUCT_IMAGES_BUCKET).remove([path]);
}
