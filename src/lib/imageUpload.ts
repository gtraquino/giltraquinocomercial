import { supabase } from "@/integrations/supabase/client";

export async function uploadStoreAsset(file: File, folder: "logos" | "products"): Promise<string> {
  const ext = file.name.split(".").pop() || "png";
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("store-assets").upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from("store-assets").getPublicUrl(path);
  return data.publicUrl;
}
