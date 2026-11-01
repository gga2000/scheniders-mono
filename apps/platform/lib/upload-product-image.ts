import { supabase } from "@/lib/supabase";

const BUCKET = "product-images";

/**
 * Uploads a product image to storage and returns its public URL. Throws the
 * storage error unchanged so callers decide how to show it.
 */
export async function uploadProductImage(file: File, productId?: string): Promise<string> {
    const fileExt = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const filePath = `products/${productId || "temp"}-${Date.now()}.${fileExt}`;

    const { error } = await supabase.storage
        .from(BUCKET)
        .upload(filePath, file, { cacheControl: "3600", upsert: true });
    if (error) throw error;

    return supabase.storage.from(BUCKET).getPublicUrl(filePath).data.publicUrl;
}
