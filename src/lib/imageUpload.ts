import { supabase } from "@/integrations/supabase/client";

/**
 * Compresses an image client-side to keep file size small (e.g. ~40-80KB) and fast.
 */
function compressImage(file: File, maxWidth = 800, maxHeight = 800, quality = 0.75): Promise<Blob> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        if (width > maxWidth || height > maxHeight) {
          if (width > height) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(file);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            resolve(blob || file);
          },
          "image/jpeg",
          quality
        );
      };
      img.onerror = () => resolve(file);
    };
    reader.onerror = () => resolve(file);
  });
}

/**
 * Converts a Blob to a Base64 data URL string.
 */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function uploadStoreAsset(file: File, folder: "logos" | "products"): Promise<string> {
  // 1. Compress the image first to ensure optimal performance and small database footprint
  let compressedBlob: Blob = file;
  if (file.type.startsWith("image/")) {
    try {
      compressedBlob = await compressImage(file);
    } catch (e) {
      console.warn("Client-side compression failed, using original file:", e);
    }
  }

  // 2. Try uploading to Supabase Storage
  try {
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${folder}/${crypto.randomUUID()}.${ext}`;
    
    // Convert blob to file so upload metadata works nicely
    const uploadFile = new File([compressedBlob], `image.${ext}`, { type: "image/jpeg" });

    const { error } = await supabase.storage.from("store-assets").upload(path, uploadFile, {
      cacheControl: "3600",
      upsert: false,
    });

    if (error) {
      // If error occurs, bubble it to try the fallback
      throw error;
    }

    const { data } = supabase.storage.from("store-assets").getPublicUrl(path);
    return data.publicUrl;
  } catch (storageError) {
    console.warn("Supabase Storage upload failed or restricted. Falling back to local Base64 storage.", storageError);
    
    // 3. Fallback: convert the compressed image to a Base64 string
    try {
      const base64String = await blobToBase64(compressedBlob);
      return base64String;
    } catch (base64Error) {
      console.error("Failed to convert image to Base64:", base64Error);
      throw new Error("Não foi possível carregar a imagem. Por favor tente outro ficheiro.");
    }
  }
}
