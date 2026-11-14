import Link from "next/link";
import { redirect } from "next/navigation";
import { Header } from "@/components/Header";
import { LocalTime } from "@/components/LocalTime";
import { requireUser } from "@/lib/supabase/server";
import type { Trip } from "@/lib/types";

/** Trips whose ride was more than 6 hours ago drop off the list. */
function listCutoff() {
  return new Date(Date.now() - 6 * 3_600_000).toISOString();
}

const statusLabel = { open: "Looking for a match", matched: "Ride confirmed", cancelled: "Cancelled" };

export default async function TripsPage() {
  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase.from("profiles").select("gender, photo_url").eq("id", user.id).single();
  if (!profile?.gender || !profile?.photo_url) redirect("/profile?next=/trips");

  const { data } = await supabase
    .from("trips")
    .select("id, direction, flight_number, airport_iata, airport_name, terminal, flight_time, ride_time, area, status")
    .neq("status", "cancelled")
    .gte("ride_time", listCutoff())
    .order("ride_time");
  const trips = (data ?? []) as Trip[];

  return (
    <>
      <Header title="Your trips" />
      <main className="flex-1 space-y-4 px-4 py-6">
        {trips.length === 0 && (
          <div className="card text-center">
            <p className="font-semibold">No upcoming trips</p>
            <p className="mt-1 text-sm text-slate-600">Add your flight to find someone to share the cab with.</p>
          </div>
        )}
        {trips.map((t) => (
          <Link key={t.id} href={`/trips/${t.id}`} className="card block hover:border-sky-300">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold">
                {t.direction === "to_airport" ? `${t.area} → ${t.airport_iata}` : `${t.airport_iata} → ${t.area}`}
              </span>
              <span className={t.status === "matched" ? "text-emerald-700" : "text-slate-500"}>{statusLabel[t.status]}</span>
            </div>
            <p className="mt-1 text-sm text-slate-600">
              {t.flight_number} · {t.direction === "to_airport" ? "leave" : "pickup"} <LocalTime iso={t.ride_time} />
            </p>
          </Link>
        ))}
        <Link href="/trips/new" className="btn-primary w-full">
          Add a trip
        </Link>
      </main>
    </>
  );
}
