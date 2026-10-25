"use client";

import { useState, useTransition } from "react";
import type { Flight } from "@/lib/flightParse";
import { suggestedLeaveBy, type Direction } from "@/lib/rideTime";
import { createTrip } from "../actions";
import { AddressInput, type ChosenAddress } from "./AddressInput";

/** "2026-11-01T06:00" in the viewer's time zone, as a datetime-local input expects. */
function toLocalInput(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

export function TripForm({ defaultSameGender, today }: { defaultSameGender: boolean; today: string }) {
  const [direction, setDirection] = useState<Direction>("to_airport");
  const [flightNumber, setFlightNumber] = useState("");
  const [flightDate, setFlightDate] = useState(today);
  const [flights, setFlights] = useState<Flight[] | null>(null);
  const [legIndex, setLegIndex] = useState(0);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);
  const [manual, setManual] = useState(false);
  const [manualAirport, setManualAirport] = useState("");
  const [manualTerminal, setManualTerminal] = useState("");
  const [manualTime, setManualTime] = useState("");
  const [manualIntl, setManualIntl] = useState(false);
  const [leaveBy, setLeaveBy] = useState("");
  const [address, setAddress] = useState<ChosenAddress | null>(null);
  const [seats, setSeats] = useState(1);
  const [bags, setBags] = useState(1);
  const [sameGender, setSameGender] = useState(defaultSameGender);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const toAirport = direction === "to_airport";
  const flight = flights?.[legIndex];
  const flightEnd = flight ? (toAirport ? flight.departure : flight.arrival) : null;

  function resetFlight() {
    setFlights(null);
    setLookupError(null);
    setLeaveBy("");
  }

  function applyFlightTime(iso: string) {
    if (toAirport) setLeaveBy(toLocalInput(suggestedLeaveBy(new Date(iso))));
  }

  async function lookUp() {
    setLooking(true);
    setLookupError(null);
    try {
      const res = await fetch(`/api/flight?number=${encodeURIComponent(flightNumber)}&date=${flightDate}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.flights.length === 0) throw new Error("No flight found with that number on that date.");
      setFlights(data.flights);
      setLegIndex(0);
      const first: Flight = data.flights[0];
      applyFlightTime(toAirport ? first.departure.time : first.arrival.time);
    } catch (e) {
      setFlights(null);
      setLookupError(e instanceof Error && e.message ? e.message : "Flight lookup failed.");
    } finally {
      setLooking(false);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!manual && !flight) return setError("Look up your flight first.");
    if (!address) return setError("Choose your address.");
    if (toAirport && !leaveBy) return setError("Choose when you want to leave.");
    startSaving(async () => {
      const result = await createTrip({
        direction,
        flightNumber,
        flightDate,
        legIndex: manual ? null : legIndex,
        manual: manual
          ? {
              airportIata: manualAirport,
              terminal: manualTerminal,
              flightTime: manualTime ? new Date(manualTime).toISOString() : "",
              isInternational: manualIntl,
            }
          : undefined,
        leaveBy: toAirport ? new Date(leaveBy).toISOString() : undefined,
        ...address,
        seats,
        bags,
        sameGenderOnly: sameGender,
      });
      if (result?.error) setError(result.error);
    });
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-200 p-1">
        {(["to_airport", "from_airport"] as const).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => {
              setDirection(d);
              resetFlight();
            }}
            className={`rounded-xl py-2.5 text-sm font-semibold ${direction === d ? "bg-white shadow-sm" : "text-slate-600"}`}
          >
            {d === "to_airport" ? "To the airport" : "From the airport"}
          </button>
        ))}
      </div>

      <section className="space-y-3">
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <div>
            <label className="label" htmlFor="flight">
              Flight number
            </label>
            <input
              id="flight"
              className="field uppercase"
              placeholder="6E123"
              value={flightNumber}
              onChange={(e) => {
                setFlightNumber(e.target.value);
                resetFlight();
              }}
              required
              autoCapitalize="characters"
            />
          </div>
          <div>
            <label className="label" htmlFor="date">
              {toAirport ? "Departure date" : "Departure date of flight"}
            </label>
            <input
              id="date"
              type="date"
              className="field"
              value={flightDate}
              min={today}
              onChange={(e) => {
                setFlightDate(e.target.value);
                resetFlight();
              }}
              required
            />
          </div>
        </div>

        {!manual && (
          <button type="button" onClick={lookUp} disabled={!flightNumber || looking} className="btn-secondary w-full">
            {looking ? "Looking up…" : "Look up flight"}
          </button>
        )}

        {lookupError && (
          <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
            {lookupError}{" "}
            <button type="button" className="font-semibold underline" onClick={() => setManual(true)}>
              Enter details by hand
            </button>
          </div>
        )}

        {flights && flights.length > 1 && (
          <div>
            <label className="label" htmlFor="leg">
              Which leg?
            </label>
            <select
              id="leg"
              className="field"
              value={legIndex}
              onChange={(e) => {
                const i = Number(e.target.value);
                setLegIndex(i);
                applyFlightTime(toAirport ? flights[i].departure.time : flights[i].arrival.time);
              }}
            >
              {flights.map((f, i) => (
                <option key={i} value={i}>
                  {f.departure.iata} → {f.arrival.iata}
                </option>
              ))}
            </select>
          </div>
        )}

        {flight && flightEnd && (
          <div className="card text-sm">
            <p className="font-semibold">
              {flight.airline} {flight.number}: {flight.departure.iata} → {flight.arrival.iata}
            </p>
            <p className="mt-1 text-slate-600">
              {toAirport ? "Departs" : "Lands"} {flightEnd.name}
              {flightEnd.terminal ? `, Terminal ${flightEnd.terminal}` : ""} at {formatTime(flightEnd.time)}
            </p>
            {!toAirport && (
              <p className="mt-1 text-slate-600">
                We&apos;ll match you for about {flight.isInternational ? "75" : "45"} minutes after landing, and update it if the
                flight is delayed.
              </p>
            )}
          </div>
        )}

        {manual && (
          <div className="card space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label" htmlFor="airport">
                  Airport code
                </label>
                <input id="airport" className="field uppercase" placeholder="BLR" maxLength={3} value={manualAirport} onChange={(e) => setManualAirport(e.target.value)} required />
              </div>
              <div>
                <label className="label" htmlFor="terminal">
                  Terminal
                </label>
                <input id="terminal" className="field" placeholder="1" value={manualTerminal} onChange={(e) => setManualTerminal(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="ftime">
                {toAirport ? "Departure time" : "Landing time"}
              </label>
              <input
                id="ftime"
                type="datetime-local"
                className="field"
                value={manualTime}
                onChange={(e) => {
                  setManualTime(e.target.value);
                  if (e.target.value) applyFlightTime(new Date(e.target.value).toISOString());
                }}
                required
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={manualIntl} onChange={(e) => setManualIntl(e.target.checked)} className="h-5 w-5 accent-sky-700" />
              International flight
            </label>
          </div>
        )}
      </section>

      <AddressInput label={toAirport ? "Pickup address" : "Drop-off address"} value={address} onChange={setAddress} />

      {toAirport && (
        <div>
          <label className="label" htmlFor="leave">
            Leave by
          </label>
          <input id="leave" type="datetime-local" className="field" value={leaveBy} onChange={(e) => setLeaveBy(e.target.value)} required />
          <p className="mt-1 text-xs text-slate-500">We suggest 2.5 hours before departure. You&apos;ll match riders leaving within an hour of this.</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label" htmlFor="seats">
            Seats needed
          </label>
          <select id="seats" className="field" value={seats} onChange={(e) => setSeats(Number(e.target.value))}>
            {[1, 2].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="bags">
            Large bags
          </label>
          <select id="bags" className="field" value={bags} onChange={(e) => setBags(Number(e.target.value))}>
            {[0, 1, 2, 3].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </div>
      </div>

      <label className="card flex items-start gap-3">
        <input type="checkbox" checked={sameGender} onChange={(e) => setSameGender(e.target.checked)} className="mt-0.5 h-5 w-5 accent-sky-700" />
        <span>
          <span className="block font-medium">Same-gender riders only</span>
          <span className="text-sm text-slate-500">Only match with riders of the same gender as you.</span>
        </span>
      </label>

      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <button className="btn-primary w-full" disabled={saving}>
        {saving ? "Saving…" : "Find ride buddies"}
      </button>
    </form>
  );
}
