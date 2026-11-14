import { test } from "node:test";
import assert from "node:assert/strict";
import { olaLink, uberLink, type BookingTrip } from "./rideLinks.ts";

const departure: BookingTrip = {
  direction: "to_airport",
  myAddress: "12th Main, Indiranagar",
  myLat: 12.978,
  myLng: 77.64,
  airportName: "Kempegowda",
  airportLat: 13.1986,
  airportLng: 77.7066,
};

test("to the airport: pickup is current location, drop-off is the airport", () => {
  const url = new URL(uberLink(departure));
  assert.equal(url.origin + url.pathname, "https://m.uber.com/ul/");
  assert.equal(url.searchParams.get("action"), "setPickup");
  assert.equal(url.searchParams.get("pickup"), "my_location");
  assert.equal(url.searchParams.get("dropoff[latitude]"), "13.1986");
  assert.equal(url.searchParams.get("dropoff[longitude]"), "77.7066");
  assert.equal(url.searchParams.get("dropoff[nickname]"), "Kempegowda");
});

test("from the airport: drop-off is the booker's own address", () => {
  const url = new URL(uberLink({ ...departure, direction: "from_airport" }, "abc"));
  assert.equal(url.searchParams.get("dropoff[latitude]"), "12.978");
  assert.equal(url.searchParams.get("dropoff[nickname]"), "12th Main, Indiranagar");
  assert.equal(url.searchParams.get("client_id"), "abc");
});

test("unknown airport location leaves the destination for the rider to enter", () => {
  const url = new URL(uberLink({ ...departure, airportLat: null, airportLng: null }));
  assert.equal(url.searchParams.get("dropoff[latitude]"), null);
  assert.equal(url.searchParams.get("pickup"), "my_location");
});

test("Ola link only with a partner token", () => {
  assert.equal(olaLink(departure), null);
  const url = new URL(olaLink(departure, "tok")!);
  assert.equal(url.searchParams.get("utm_source"), "tok");
  assert.equal(url.searchParams.get("drop_lat"), "13.1986");
});
