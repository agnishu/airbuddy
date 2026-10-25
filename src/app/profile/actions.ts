"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";

const GENDERS = ["female", "male", "other", "undisclosed"];

export async function saveProfile(formData: FormData) {
  const { supabase, user } = await requireUser();
  const fullName = String(formData.get("full_name") ?? "").trim().slice(0, 80);
  const gender = String(formData.get("gender") ?? "");
  const next = String(formData.get("next") ?? "/trips");
  if (!fullName || !GENDERS.includes(gender)) redirect(`/profile?error=1&next=${encodeURIComponent(next)}`);

  const { data: current } = await supabase.from("profiles").select("photo_url").eq("id", user.id).single();
  if (!current?.photo_url) redirect(`/profile?error=photo&next=${encodeURIComponent(next)}`);

  const { error } = await supabase.from("profiles").update({ full_name: fullName, gender }).eq("id", user.id);
  if (error) redirect(`/profile?error=1&next=${encodeURIComponent(next)}`);
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/trips");
}

export async function signOut() {
  const { supabase } = await requireUser();
  await supabase.auth.signOut();
  redirect("/");
}
