/* eslint-disable @next/next/no-img-element */
import { notFound } from "next/navigation";
import { Header } from "@/components/Header";
import { requireUser } from "@/lib/supabase/server";
import type { RequestStatus } from "@/lib/types";
import { Booking } from "./Booking";
import { Chat, type Message, type Plan } from "./Chat";
import { blockRider, cancelRide, reportRider } from "./actions";
import { Donation } from "./Donation";

type Details = {
  status: RequestStatus;
  partner_first_name: string;
  partner_photo_url: string | null;
  partner_area: string;
  my_trip_id: string;
  direction: "to_airport" | "from_airport";
  airport_iata: string;
  my_ride_time: string;
};

type BookingDetails = {
  booker_id: string | null;
  booking_link: string | null;
  driver_details: string | null;
  my_address: string;
  my_lat: number;
  my_lng: number;
  airport_name: string | null;
  airport_iata: string;
  airport_lat: number | null;
  airport_lng: number | null;
  plan: Plan | null;
};

export default async function ChatPage({ params, searchParams }: PageProps<"/chat/[id]">) {
  const { id } = await params;
  const { report } = await searchParams;
  const { supabase, user } = await requireUser();

  const { data: details } = await supabase.rpc("chat_details", { p_request_id: id }).single<Details>();
  if (!details) notFound();

  const { data: messages } = await supabase
    .from("messages")
    .select("id, sender_id, kind, body, plan, plan_status, created_at")
    .eq("request_id", id)
    .order("created_at");

  const open = details.status === "accepted" || details.status === "confirmed";
  const { data: booking } =
    details.status === "confirmed"
      ? await supabase.rpc("booking_details", { p_request_id: id }).single<BookingDetails>()
      : { data: null };

  return (
    <>
      <Header title={details.partner_first_name} back={`/trips/${details.my_trip_id}`} />
      <main className="flex flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 text-sm">
          {details.partner_photo_url ? (
            <img src={details.partner_photo_url} alt="" className="h-10 w-10 rounded-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <div className="h-10 w-10 rounded-full bg-slate-200" />
          )}
          <p className="flex-1 text-slate-600">
            {details.partner_first_name} from {details.partner_area}
            {details.direction === "to_airport" ? ` · going to ${details.airport_iata}` : ` · coming from ${details.airport_iata}`}
          </p>
        </div>

        {details.status === "confirmed" && (
          <div className="space-y-3 px-4 pt-4">
            <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
              Ride confirmed. Share your trip details with someone you trust, and meet at the agreed pickup point.
            </p>
            {booking && (
              <Booking
                requestId={id}
                userId={user.id}
                partnerName={details.partner_first_name}
                trip={{
                  direction: details.direction,
                  myAddress: booking.my_address,
                  myLat: booking.my_lat,
                  myLng: booking.my_lng,
                  airportName: booking.airport_name ?? `${booking.airport_iata} airport`,
                  airportLat: booking.airport_lat,
                  airportLng: booking.airport_lng,
                }}
                state={{
                  bookerId: booking.booker_id,
                  link: booking.booking_link,
                  driver: booking.driver_details,
                  pickup: booking.plan?.pickup ?? null,
                  drops: booking.plan?.drops ?? null,
                }}
                uberClientId={process.env.NEXT_PUBLIC_UBER_CLIENT_ID}
                olaToken={process.env.NEXT_PUBLIC_OLA_XAPP_TOKEN}
              />
            )}
            <Donation requestId={id} upiId={process.env.NEXT_PUBLIC_UPI_ID} />
          </div>
        )}

        {open ? (
          <Chat
            requestId={id}
            userId={user.id}
            initialMessages={(messages ?? []) as Message[]}
            confirmed={details.status === "confirmed"}
            partnerName={details.partner_first_name}
            defaultTime={details.my_ride_time}
            fromAirport={details.direction === "from_airport"}
          />
        ) : (
          <p className="m-4 rounded-xl bg-slate-100 p-3 text-sm text-slate-600">This chat is closed.</p>
        )}

        {open && (
          <details className="border-t border-slate-200 bg-white px-4 py-3 text-sm" open={report === "1"}>
            <summary className="cursor-pointer text-slate-600">Cancel, block or report</summary>
            <div className="mt-3 space-y-3">
              <form action={cancelRide.bind(null, id)}>
                <button className="btn-secondary w-full">{details.status === "confirmed" ? "Cancel this ride" : "Close this chat"}</button>
              </form>
              <form action={blockRider.bind(null, id)}>
                <button className="btn-secondary w-full">Block {details.partner_first_name}</button>
              </form>
              <form action={reportRider.bind(null, id)} className="space-y-2">
                <textarea name="reason" className="field" rows={3} placeholder="What happened?" maxLength={1000} required />
                <button className="btn w-full bg-red-700 text-white">Report and block</button>
              </form>
              <p className="text-xs text-slate-500">In an emergency, call 112.</p>
            </div>
          </details>
        )}
      </main>
    </>
  );
}
