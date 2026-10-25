/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { notFound } from "next/navigation";
import { Header } from "@/components/Header";
import { LocalTime } from "@/components/LocalTime";
import { requireUser } from "@/lib/supabase/server";
import type { Match, RequestStatus, Trip } from "@/lib/types";
import { cancelTrip, requestMatch, respondToRequest } from "../actions";

type Request = {
  id: string;
  from_trip_id: string;
  to_trip_id: string;
  from_user_id: string;
  status: RequestStatus;
  expires_at: string;
};

function Avatar({ src }: { src: string | null }) {
  return src ? (
    <img src={src} alt="" className="h-12 w-12 rounded-full object-cover" referrerPolicy="no-referrer" />
  ) : (
    <div className="h-12 w-12 rounded-full bg-slate-200" />
  );
}

function effectiveStatus(r: Request): RequestStatus {
  return r.status === "pending" && new Date(r.expires_at).getTime() < Date.now() ? "expired" : r.status;
}

function timeGap(minutes: number, toAirport: boolean) {
  if (minutes === 0) return `${toAirport ? "leaves" : "ready"} at the same time`;
  const when = minutes > 0 ? "after" : "before";
  return `${toAirport ? "leaves" : "ready"} ${Math.abs(minutes)} min ${when} you`;
}

export default async function TripPage({ params, searchParams }: PageProps<"/trips/[id]">) {
  const { id } = await params;
  const { error } = await searchParams;
  const { supabase, user } = await requireUser();

  const { data: trip } = await supabase
    .from("trips")
    .select("id, direction, flight_number, airport_iata, airport_name, terminal, flight_time, ride_time, area, status")
    .eq("id", id)
    .single<Trip>();
  if (!trip) notFound();
  const toAirport = trip.direction === "to_airport";

  const [{ data: matchRows }, { data: requestRows }] = await Promise.all([
    trip.status === "open" ? supabase.rpc("find_matches", { p_trip_id: id }) : Promise.resolve({ data: [] }),
    supabase
      .from("match_requests")
      .select("id, from_trip_id, to_trip_id, from_user_id, status, expires_at")
      .or(`from_trip_id.eq.${id},to_trip_id.eq.${id}`)
      .order("created_at", { ascending: false }),
  ]);
  const matches = (matchRows ?? []) as Match[];
  const requests = ((requestRows ?? []) as Request[]).map((r) => ({ ...r, status: effectiveStatus(r) }));
  const requestFor = (otherTripId: string) =>
    requests.find((r) => r.from_trip_id === otherTripId || r.to_trip_id === otherTripId);
  const incoming = requests.filter((r) => r.from_user_id !== user.id && r.status === "pending");
  const chats = requests.filter((r) => r.status === "accepted" || r.status === "confirmed");

  return (
    <>
      <Header title={toAirport ? `To ${trip.airport_iata}` : `From ${trip.airport_iata}`} back="/trips" />
      <main className="flex-1 space-y-6 px-4 py-6">
        <section className="card text-sm">
          <p className="font-semibold">
            {trip.flight_number} · {trip.airport_name ?? trip.airport_iata}
            {trip.terminal ? `, T${trip.terminal}` : ""}
          </p>
          <p className="mt-1 text-slate-600">
            {toAirport ? "Flight departs" : "Flight lands"} <LocalTime iso={trip.flight_time} />
          </p>
          <p className="text-slate-600">
            {toAirport ? `Leaving ${trip.area}` : `Pickup at the airport`} <LocalTime iso={trip.ride_time} />
          </p>
        </section>

        {typeof error === "string" && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        {chats.length > 0 && (
          <section className="space-y-2">
            <h2 className="font-semibold">Your chats</h2>
            {chats.map((r) => (
              <Link key={r.id} href={`/chat/${r.id}`} className="card flex items-center justify-between hover:border-sky-300">
                <span className="text-sm">{r.status === "confirmed" ? "Ride confirmed: view plan" : "Chat open: agree a plan"}</span>
                <span className="text-sky-700">→</span>
              </Link>
            ))}
          </section>
        )}

        {incoming.length > 0 && (
          <section className="space-y-2">
            <h2 className="font-semibold">Requests to share with you</h2>
            {incoming.map((r) => {
              const m = matches.find((x) => x.trip_id === r.from_trip_id);
              return (
                <div key={r.id} className="card space-y-3">
                  <p className="text-sm">
                    <span className="font-semibold">{m?.first_name ?? "A rider"}</span>
                    {m ? ` · ${m.area}, ${m.distance_band} · ${timeGap(m.minutes_apart, toAirport)}` : " wants to share a ride"}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <form action={respondToRequest.bind(null, id, r.id, false)}>
                      <button className="btn-secondary w-full">Decline</button>
                    </form>
                    <form action={respondToRequest.bind(null, id, r.id, true)}>
                      <button className="btn-primary w-full">Accept and chat</button>
                    </form>
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {trip.status === "open" && (
          <section className="space-y-2">
            <h2 className="font-semibold">
              {matches.length === 0 ? "No matches yet" : `${matches.length} ${matches.length === 1 ? "match" : "matches"}`}
            </h2>
            {matches.length === 0 && (
              <p className="text-sm text-slate-600">
                We&apos;ll keep looking for riders within 2 km and an hour of you. Check back closer to your trip.
              </p>
            )}
            {matches.map((m) => {
              const req = requestFor(m.trip_id);
              const incomingReq = req && req.from_user_id !== user.id;
              return (
                <div key={m.trip_id} className="card flex items-center gap-3">
                  <Avatar src={m.photo_url} />
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-semibold">{m.first_name}</p>
                    <p className="text-slate-600">
                      {m.area} · {m.distance_band}
                    </p>
                    <p className="text-slate-600">
                      {timeGap(m.minutes_apart, toAirport)}
                      {m.same_terminal && m.terminal ? ` · same terminal` : ""}
                    </p>
                  </div>
                  {!req ? (
                    <form action={requestMatch.bind(null, id, m.trip_id)}>
                      <button className="rounded-xl bg-sky-700 px-3 py-2 text-sm font-semibold text-white">Ask to share</button>
                    </form>
                  ) : (
                    <span className="text-xs text-slate-500">
                      {incomingReq && req.status === "pending" ? "Wants to share" : req.status === "pending" ? "Requested" : req.status}
                    </span>
                  )}
                </div>
              );
            })}
          </section>
        )}

        {trip.status === "open" && (
          <form action={cancelTrip.bind(null, id)}>
            <button className="w-full py-2 text-sm text-red-700">Cancel this trip</button>
          </form>
        )}
      </main>
    </>
  );
}
