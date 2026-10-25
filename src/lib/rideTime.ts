export type Direction = "to_airport" | "from_airport";

const MINUTE = 60_000;

/** Minutes before departure we suggest leaving for the airport. */
export const LEAVE_BEFORE_DEPARTURE_MIN = 150;

/** Minutes from landing to the kerb, allowing for bags and immigration. */
export function kerbsideDelayMinutes(isInternational: boolean) {
  return isInternational ? 75 : 45;
}

/** Suggested leave-by time for a trip to the airport. */
export function suggestedLeaveBy(departure: Date) {
  return new Date(departure.getTime() - LEAVE_BEFORE_DEPARTURE_MIN * MINUTE);
}

/** When a rider arriving on this flight will be ready for a cab. */
export function kerbsideTime(arrival: Date, isInternational: boolean) {
  return new Date(arrival.getTime() + kerbsideDelayMinutes(isInternational) * MINUTE);
}

/** Flight numbers are matched without spaces and in upper case: "6e 123" -> "6E123". */
export function normalizeFlightNumber(input: string) {
  return input.replace(/[\s-]/g, "").toUpperCase();
}
