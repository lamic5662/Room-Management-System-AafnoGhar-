import { createClient } from "@supabase/supabase-js";
import path from "path";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ROOMS_BUCKET = process.env.SUPABASE_BUCKET_ROOMS || "room-photos";
const KYC_BUCKET = process.env.SUPABASE_BUCKET_KYC || "kyc-docs";
const SIGNATURES_BUCKET = process.env.SUPABASE_BUCKET_SIGNATURES || "signatures";
const AVATARS_BUCKET = process.env.SUPABASE_BUCKET_AVATARS || "avatars";

let supabaseClient;

const getSupabase = () => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  if (!supabaseClient) {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
  }
  return supabaseClient;
};

const ensureExt = (name, mime) => {
  let ext = path.extname(name || "");
  if (ext) return ext;
  const map = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "application/pdf": ".pdf",
  };
  return map[mime] || "";
};

export const isSupabaseEnabled = () => Boolean(getSupabase());

const uploadToBucket = async ({ bucket, fileName, buffer, contentType }) => {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error("Supabase is not configured");
  }

  const { error } = await supabase.storage
    .from(bucket)
    .upload(fileName, buffer, { contentType, upsert: false });
  if (error) {
    throw new Error(`Supabase upload failed: ${error.message || "unknown error"}`);
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(fileName);
  return data?.publicUrl || "";
};

export async function uploadRoomPhoto({ buffer, contentType, roomId, originalName }) {
  const ext = ensureExt(originalName, contentType);
  const fileName = `rooms/${roomId}/${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
  return uploadToBucket({ bucket: ROOMS_BUCKET, fileName, buffer, contentType });
}

export async function uploadKycDoc({ buffer, contentType, userId, kind, originalName }) {
  const ext = ensureExt(originalName, contentType) || ".png";
  const fileName = `kyc/${userId}/${kind}-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
  return uploadToBucket({ bucket: KYC_BUCKET, fileName, buffer, contentType });
}

export async function uploadSignatureImage({ buffer, contentType, agreementId, role, originalName }) {
  const ext = ensureExt(originalName, contentType) || ".png";
  const fileName = `signatures/${agreementId}/${role}-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
  return uploadToBucket({ bucket: SIGNATURES_BUCKET, fileName, buffer, contentType });
}

export async function uploadAvatarImage({ buffer, contentType, userId, originalName }) {
  const ext = ensureExt(originalName, contentType) || ".png";
  const fileName = `avatars/${userId}/${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
  return uploadToBucket({ bucket: AVATARS_BUCKET, fileName, buffer, contentType });
}
