import type { Direction } from "./rideTime";

export type BookingTrip = {
  direction: Direction;
  /** The booker's own address and coordinates (never the partner's). */
  myAddress: string;
  myLat: number;
  myLng: number;
  airportName: string;
  airportLat: number | null;
  airportLng: number | null;
};

type Point = { lat: number; lng: number; name: string };

/** Where the cab goes: the airport for departures, the booker's home for arrivals. */
function destination(trip: BookingTrip): Point | null {
  if (trip.direction === "from_airport") return { lat: trip.myLat, lng: trip.myLng, name: trip.myAddress };
  if (trip.airportLat === null || trip.airportLng === null) return null;
  return { lat: trip.airportLat, lng: trip.airportLng, name: trip.airportName };
}

/**
 * Opens Uber with the pickup at the booker's current location and the destination filled in.
 * Uber's link takes one pickup and one drop-off; extra stops are added in the Uber app.
 */
export function uberLink(trip: BookingTrip, clientId?: string) {
  const params = new URLSearchParams({ action: "setPickup", pickup: "my_location" });
  if (clientId) params.set("client_id", clientId);
  const to = destination(trip);
  if (to) {
    params.set("dropoff[latitude]", String(to.lat));
    params.set("dropoff[longitude]", String(to.lng));
    params.set("dropoff[nickname]", to.name);
  }
  return `https://m.uber.com/ul/?${params}`;
}

/** Ola's link needs a partner token from Ola; without one there is no Ola button. */
export function olaLink(trip: BookingTrip, token?: string) {
  if (!token) return null;
  const params = new URLSearchParams({ utm_source: token, landing_page: "bk", bk_act: "rn" });
  const to = destination(trip);
  if (to) {
    params.set("drop_lat", String(to.lat));
    params.set("drop_lng", String(to.lng));
    params.set("drop_address", to.name);
  }
  return `https://olawebcdn.com/assets/ola-universal-link.html?${params}`;
}
