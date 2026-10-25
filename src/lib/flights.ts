import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { normalizeFlightNumber } from "@/lib/rideTime";
import { parseFlights, type Flight } from "@/lib/flightParse";

export type { Flight };

const CACHE_HOURS = 6;

async function fetchFromApi(number: string, date: string) {
  const key = process.env.RAPIDAPI_KEY;
  if (!key) throw new FlightLookupError("Flight lookup isn't set up yet. Enter the details by hand.");
  const res = await fetch(
    `https://aerodatabox.p.rapidapi.com/flights/number/${encodeURIComponent(number)}/${date}?withAircraftImage=false&withLocation=false`,
    {
      headers: { "X-RapidAPI-Key": key, "X-RapidAPI-Host": "aerodatabox.p.rapidapi.com" },
      cache: "no-store",
    },
  );
  if (res.status === 204 || res.status === 404) return [];
  if (!res.ok) throw new FlightLookupError("Couldn't reach the flight service. Try again or enter the details by hand.");
  return res.json();
}

export class FlightLookupError extends Error {}

/** Looks up a flight by number and local departure date, using a shared cache. */
export async function lookupFlight(rawNumber: string, date: string): Promise<Flight[]> {
  const number = normalizeFlightNumber(rawNumber);
  if (!/^[A-Z0-9]{2,3}\d{1,4}[A-Z]?$/.test(number) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new FlightLookupError("Enter a flight number like 6E123 and a date.");
  }

  const db = process.env.SUPABASE_SECRET_KEY ? createServiceClient() : null;
  if (db) {
    const { data } = await db
      .from("flight_cache")
      .select("payload, fetched_at")
      .eq("flight_number", number)
      .eq("flight_date", date)
      .maybeSingle();
    if (data && Date.now() - new Date(data.fetched_at).getTime() < CACHE_HOURS * 3_600_000) {
      return parseFlights(data.payload);
    }
  }

  const payload = await fetchFromApi(number, date);
  if (db) {
    await db
      .from("flight_cache")
      .upsert({ flight_number: number, flight_date: date, payload, fetched_at: new Date().toISOString() });
  }
  return parseFlights(payload);
}
