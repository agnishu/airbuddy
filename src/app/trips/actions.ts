"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { FlightLookupError, lookupFlight } from "@/lib/flights";
import { findAirport, placeDetails, PlacesError } from "@/lib/places";
import { kerbsideTime, normalizeFlightNumber, type Direction } from "@/lib/rideTime";
import { requireUser } from "@/lib/supabase/server";

export async function getPlace(placeId: string, sessionToken: string) {
  await requireUser();
  try {
    return { place: await placeDetails(placeId, sessionToken) };
  } catch (e) {
    return { error: e instanceof PlacesError ? e.message : "Couldn't load that address." };
  }
}

export type NewTrip = {
  direction: Direction;
  flightNumber: string;
  flightDate: string;
  /** Which leg of the looked-up flight, or null when the rider typed the details. */
  legIndex: number | null;
  manual?: { airportIata: string; terminal: string; flightTime: string; isInternational: boolean };
  /** Trips to the airport only: when the rider wants to leave. */
  leaveBy?: string;
  address: string;
  area: string;
  lat: number;
  lng: number;
  seats: number;
  bags: number;
  sameGenderOnly: boolean;
};

const HOUR = 3_600_000;

export async function createTrip(input: NewTrip): Promise<{ error: string }> {
  const { supabase, user } = await requireUser();
  const toAirport = input.direction === "to_airport";

  let airportIata: string, airportName: string | null, terminal: string | null;
  let flightTime: Date, isInternational: boolean;
  let airport: { lat: number; lng: number } | null = null;

  if (input.legIndex !== null) {
    let flights;
    try {
      flights = await lookupFlight(input.flightNumber, input.flightDate);
    } catch (e) {
      return { error: e instanceof FlightLookupError ? e.message : "Flight lookup failed." };
    }
    const flight = flights[input.legIndex];
    if (!flight) return { error: "That flight couldn't be found. Look it up again." };
    const end = toAirport ? flight.departure : flight.arrival;
    airportIata = end.iata;
    airportName = end.name;
    terminal = end.terminal;
    flightTime = new Date(end.time);
    isInternational = flight.isInternational;
    if (end.lat !== null && end.lng !== null) airport = { lat: end.lat, lng: end.lng };
  } else {
    const m = input.manual;
    if (!m || !/^[A-Za-z]{3}$/.test(m.airportIata) || Number.isNaN(Date.parse(m.flightTime))) {
      return { error: "Enter the airport code (like BLR) and the flight time." };
    }
    airportIata = m.airportIata.toUpperCase();
    airportName = null;
    terminal = m.terminal.trim().slice(0, 10) || null;
    flightTime = new Date(m.flightTime);
    isInternational = m.isInternational;
  }

  let rideTime: Date;
  if (toAirport) {
    rideTime = new Date(input.leaveBy ?? "");
    const before = flightTime.getTime() - rideTime.getTime();
    if (Number.isNaN(before) || before < 0.5 * HOUR || before > 8 * HOUR) {
      return { error: "Pick a leave-by time between 30 minutes and 8 hours before your flight." };
    }
  } else {
    rideTime = kerbsideTime(flightTime, isInternational);
  }
  if (rideTime.getTime() < Date.now() - HOUR) return { error: "That trip is in the past." };

  if (!Number.isFinite(input.lat) || !Number.isFinite(input.lng) || !input.address.trim()) {
    return { error: "Choose your address from the list, or use your current location." };
  }
  const area = input.area.trim().slice(0, 60);
  if (!area) return { error: "Add your area or neighbourhood, for example Indiranagar." };

  // Used to fill in the airport when the riders book their cab.
  airport ??= await findAirport(airportIata);

  const { data, error } = await supabase
    .from("trips")
    .insert({
      user_id: user.id,
      direction: input.direction,
      flight_number: normalizeFlightNumber(input.flightNumber),
      flight_date: input.flightDate,
      airport_iata: airportIata,
      airport_name: airportName,
      airport_lat: airport?.lat ?? null,
      airport_lng: airport?.lng ?? null,
      terminal,
      is_international: isInternational,
      flight_time: flightTime.toISOString(),
      ride_time: rideTime.toISOString(),
      address: input.address.trim().slice(0, 300),
      area,
      location: `SRID=4326;POINT(${input.lng} ${input.lat})`,
      seats: Math.min(3, Math.max(1, Math.round(input.seats))),
      bags: Math.min(4, Math.max(0, Math.round(input.bags))),
      same_gender_only: input.sameGenderOnly,
    })
    .select("id")
    .single();

  if (error || !data) return { error: "Couldn't save your trip. Please try again." };
  redirect(`/trips/${data.id}`);
}

export async function cancelTrip(tripId: string) {
  const { supabase, user } = await requireUser();
  await supabase.from("trips").update({ status: "cancelled" }).eq("id", tripId).eq("user_id", user.id);
  redirect("/trips");
}

export async function requestMatch(fromTripId: string, toTripId: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("request_match", { p_from_trip_id: fromTripId, p_to_trip_id: toTripId });
  if (error) redirect(`/trips/${fromTripId}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/trips/${fromTripId}`);
}

export async function respondToRequest(tripId: string, requestId: string, accept: boolean) {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("respond_to_request", { p_request_id: requestId, p_accept: accept });
  if (error) redirect(`/trips/${tripId}?error=${encodeURIComponent(error.message)}`);
  if (accept) redirect(`/chat/${requestId}`);
  revalidatePath(`/trips/${tripId}`);
}
