"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";

async function partnerOf(requestId: string) {
  const { supabase, user } = await requireUser();
  const { data } = await supabase.rpc("chat_details", { p_request_id: requestId }).single<{ partner_id: string; my_trip_id: string }>();
  if (!data) redirect("/trips");
  return { supabase, user, partnerId: data.partner_id, myTripId: data.my_trip_id };
}

export async function cancelRide(requestId: string) {
  const { supabase, myTripId } = await partnerOf(requestId);
  await supabase.rpc("cancel_match", { p_request_id: requestId });
  redirect(`/trips/${myTripId}`);
}

export async function blockRider(requestId: string) {
  const { supabase, user, partnerId, myTripId } = await partnerOf(requestId);
  await supabase.from("blocks").upsert({ blocker_id: user.id, blocked_id: partnerId });
  await supabase.rpc("cancel_match", { p_request_id: requestId });
  redirect(`/trips/${myTripId}`);
}

export async function reportRider(requestId: string, formData: FormData) {
  const { supabase, user, partnerId, myTripId } = await partnerOf(requestId);
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 1000);
  if (!reason) redirect(`/chat/${requestId}?report=1`);
  await supabase.from("reports").insert({ reporter_id: user.id, reported_id: partnerId, trip_id: myTripId, reason });
  await supabase.from("blocks").upsert({ blocker_id: user.id, blocked_id: partnerId });
  await supabase.rpc("cancel_match", { p_request_id: requestId });
  redirect(`/trips/${myTripId}?error=${encodeURIComponent("Thanks for reporting. We'll review it, and you won't be matched with this rider again.")}`);
}
