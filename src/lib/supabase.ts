import "server-only";
import { createClient } from "@supabase/supabase-js";

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
 * Laddar upp en produktbild till Supabase Storage och returnerar den
 * publika URL:en. Bucketen `product-images` måste finnas och ha publik
 * läsbehörighet — skapas manuellt i Supabase Dashboard (se README).
 */
export async function uploadProductImage(
  productId: string,
  file: File,
): Promise<string> {
  const supabase = getSupabaseAdmin();
  const extension = file.name.split(".").pop() ?? "jpg";
  const path = `${productId}/${crypto.randomUUID()}.${extension}`;

  const { error } = await supabase.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .upload(path, file, {
      contentType: file.type,
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
