import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFlights } from "./flightParse.ts";

const sample = [
  {
    number: "6E 123",
    status: "Expected",
    airline: { name: "IndiGo" },
    departure: {
      airport: { iata: "BLR", name: "Bengaluru Kempegowda", shortName: "Kempegowda", municipalityName: "Bengaluru", countryCode: "IN", location: { lat: 13.1986, lon: 77.7066 } },
      scheduledTime: { utc: "2026-11-01 03:00Z", local: "2026-11-01 08:30+05:30" },
      terminal: "1",
    },
    arrival: {
      airport: { iata: "DXB", name: "Dubai", municipalityName: "Dubai", countryCode: "AE" },
      scheduledTime: { utc: "2026-11-01 07:00Z" },
      revisedTime: { utc: "2026-11-01 07:25Z" },
    },
  },
  { number: "BROKEN", departure: {}, arrival: {} },
];

test("parses AeroDataBox flights and skips incomplete ones", () => {
  const flights = parseFlights(sample);
  assert.equal(flights.length, 1);
  const [f] = flights;
  assert.equal(f.number, "6E123");
  assert.equal(f.departure.iata, "BLR");
  assert.equal(f.departure.terminal, "1");
  assert.equal(f.departure.lat, 13.1986);
  assert.equal(f.departure.lng, 77.7066);
  assert.equal(f.arrival.lat, null, "missing coordinates stay empty");
  assert.equal(f.departure.time, "2026-11-01T03:00:00.000Z");
  assert.equal(f.arrival.time, "2026-11-01T07:25:00.000Z", "uses the revised arrival time");
  assert.equal(f.arrival.scheduledTime, "2026-11-01T07:00:00.000Z");
  assert.equal(f.isInternational, true);
});
