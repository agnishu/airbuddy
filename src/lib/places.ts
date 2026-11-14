import "server-only";

const API = "https://places.googleapis.com/v1";

export type Suggestion = { placeId: string; main: string; secondary: string };
export type Place = { address: string; area: string; lat: number; lng: number };

export class PlacesError extends Error {}

function apiKey() {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) throw new PlacesError("Address search isn't set up yet. Use your current location instead.");
  return key;
}

/** Address suggestions as the rider types. Calls within one sessionToken are billed as one session. */
export async function autocomplete(input: string, sessionToken: string): Promise<Suggestion[]> {
  const res = await fetch(`${API}/places:autocomplete`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey() },
    body: JSON.stringify({ input, sessionToken }),
    cache: "no-store",
  });
  if (!res.ok) throw new PlacesError("Address search failed. Try again.");
  const data = await res.json();
  type Prediction = {
    placeId: string;
    text?: { text: string };
    structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } };
  };
  return (data.suggestions ?? []).flatMap((s: { placePrediction?: Prediction }) => {
    const p = s.placePrediction;
    if (!p) return [];
    return [
      {
        placeId: p.placeId,
        main: p.structuredFormat?.mainText?.text ?? p.text?.text ?? "",
        secondary: p.structuredFormat?.secondaryText?.text ?? "",
      },
    ];
  });
}

const AREA_TYPES = ["sublocality_level_1", "sublocality", "neighborhood", "locality"];

/** Coordinates and neighbourhood name for a chosen suggestion. Ends the billing session. */
export async function placeDetails(placeId: string, sessionToken?: string): Promise<Place> {
  const url = new URL(`${API}/places/${encodeURIComponent(placeId)}`);
  if (sessionToken) url.searchParams.set("sessionToken", sessionToken);
  const res = await fetch(url, {
    headers: { "X-Goog-Api-Key": apiKey(), "X-Goog-FieldMask": "location,formattedAddress,addressComponents" },
    cache: "no-store",
  });
  if (!res.ok) throw new PlacesError("Couldn't load that address. Pick it again.");
  const data = await res.json();
  type Component = { longText: string; types: string[] };
  const components: Component[] = data.addressComponents ?? [];
  const area =
    AREA_TYPES.map((type) => components.find((c) => c.types.includes(type))?.longText).find(Boolean) ?? "";
  return {
    address: data.formattedAddress ?? "",
    area,
    lat: data.location?.latitude,
    lng: data.location?.longitude,
  };
}

/** Best-effort airport coordinates from its code, for when the flight service has none. */
export async function findAirport(iata: string): Promise<{ lat: number; lng: number } | null> {
  if (!process.env.GOOGLE_MAPS_API_KEY) return null;
  try {
    const res = await fetch(`${API}/places:searchText`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey(),
        "X-Goog-FieldMask": "places.location",
      },
      body: JSON.stringify({ textQuery: `${iata} airport`, includedType: "airport", pageSize: 1 }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const location = (await res.json()).places?.[0]?.location;
    return location ? { lat: location.latitude, lng: location.longitude } : null;
  } catch {
    return null;
  }
}
