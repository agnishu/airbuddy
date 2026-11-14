/* eslint-disable @next/next/no-img-element */
"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const SIZE = 512;

// Crops the picture to a centred square and shrinks it to a small JPEG before upload.
async function toSquareJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = Math.min(SIZE, side);
  canvas
    .getContext("2d")!
    .drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("resize failed"))), "image/jpeg", 0.85));
}

export function PhotoUpload({ userId, initialUrl }: { userId: string; initialUrl: string | null }) {
  const supabase = useMemo(() => createClient(), []);
  const [url, setUrl] = useState(initialUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const blob = await toSquareJpeg(file);
      const path = `${userId}/${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage.from("avatars").upload(path, blob, { contentType: "image/jpeg" });
      if (uploadError) throw uploadError;
      const publicUrl = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
      const { error: saveError } = await supabase.from("profiles").update({ photo_url: publicUrl }).eq("id", userId);
      if (saveError) throw saveError;
      setUrl(publicUrl);
    } catch {
      setError("Couldn't upload that photo. Try a JPEG or PNG under 10 MB.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-4">
        <label className="relative shrink-0 cursor-pointer">
          {url ? (
            <img src={url} alt="Your photo" className="h-20 w-20 rounded-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-slate-200 text-xs text-slate-600">Add photo</div>
          )}
          <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={onChange} disabled={busy} />
        </label>
        <div className="text-sm text-slate-600">
          <p>Other riders see your first name and photo. Your phone number, email and address stay private.</p>
          <p className="mt-1 font-medium text-sky-700">{busy ? "Uploading..." : url ? "Tap the photo to change it" : "A clear face photo is required"}</p>
        </div>
      </div>
      {error && <p className="rounded-xl bg-red-50 p-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
