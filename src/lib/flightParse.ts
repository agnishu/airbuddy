export type FlightEnd = {
  iata: string;
  name: string;
  city: string;
  countryCode: string;
  terminal: string | null;
  /** ISO timestamp: live estimate when known, otherwise scheduled. */
  time: string;
  scheduledTime: string;
};

export type Flight = {
  number: string;
  airline: string;
  status: string;
  departure: FlightEnd;
  arrival: FlightEnd;
  isInternational: boolean;
};

// AeroDataBox returns times like "2026-11-01 03:00Z" or "2026-11-01 08:30+05:30".
function toIso(value: unknown) {
  if (typeof value !== "string") return null;
  const date = new Date(value.replace(" ", "T"));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

type RawEnd = {
  airport?: { iata?: string; name?: string; shortName?: string; municipalityName?: string; countryCode?: string };
  scheduledTime?: { utc?: string };
  revisedTime?: { utc?: string };
  predictedTime?: { utc?: string };
  terminal?: string;
};

function parseEnd(raw: RawEnd | undefined): FlightEnd | null {
  const scheduled = toIso(raw?.scheduledTime?.utc);
  if (!raw?.airport?.iata || !scheduled) return null;
  return {
    iata: raw.airport.iata,
    name: raw.airport.shortName ?? raw.airport.name ?? raw.airport.iata,
    city: raw.airport.municipalityName ?? "",
    countryCode: raw.airport.countryCode ?? "",
    terminal: raw.terminal ?? null,
    time: toIso(raw.revisedTime?.utc) ?? toIso(raw.predictedTime?.utc) ?? scheduled,
    scheduledTime: scheduled,
  };
}

export function parseFlights(payload: unknown): Flight[] {
  if (!Array.isArray(payload)) return [];
  return payload.flatMap((raw) => {
    const departure = parseEnd(raw?.departure);
    const arrival = parseEnd(raw?.arrival);
    if (!departure || !arrival) return [];
    return [
      {
        number: String(raw.number ?? "").replace(/\s/g, ""),
        airline: raw.airline?.name ?? "",
        status: raw.status ?? "",
        departure,
        arrival,
        isInternational: departure.countryCode !== arrival.countryCode,
      },
    ];
  });
}
