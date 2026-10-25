"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { olaLink, uberLink, type BookingTrip } from "@/lib/rideLinks";
import { createClient } from "@/lib/supabase/client";

export type BookingState = {
  bookerId: string | null;
  link: string | null;
  driver: string | null;
  pickup: string | null;
  drops: string | null;
};

/** After a ride is confirmed: one rider books the cab and shares the trip with the other. */
export function Booking({
  requestId,
  userId,
  partnerName,
  trip,
  state,
  uberClientId,
  olaToken,
}: {
  requestId: string;
  userId: string;
  partnerName: string;
  trip: BookingTrip;
  state: BookingState;
  uberClientId?: string;
  olaToken?: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [link, setLink] = useState(state.link ?? "");
  const [driver, setDriver] = useState(state.driver ?? "");
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const iAmBooker = state.bookerId === userId;
  const booked = Boolean(state.link || state.driver);
  const fromAirport = trip.direction === "from_airport";
  const ola = olaLink(trip, olaToken);

  async function call(fn: string, args: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc(fn, args);
    setBusy(false);
    if (error) {
      setError(error.message);
      return false;
    }
    router.refresh();
    return true;
  }

  async function copyDrops() {
    try {
      await navigator.clipboard.writeText(state.drops ?? "");
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  // Nobody has claimed the booking yet.
  if (!state.bookerId) {
    return (
      <div className="card space-y-3 text-sm">
        <p className="font-semibold">Who&apos;s booking the cab?</p>
        <p className="text-slate-600">Whoever taps first books it, so you never both book a cab.</p>
        <button disabled={busy} onClick={() => call("claim_booking", { p_request_id: requestId })} className="btn-primary w-full">
          I&apos;ll book it
        </button>
        {error && <p className="text-red-700">{error}</p>}
      </div>
    );
  }

  // The booking as both riders see it once it's made.
  if (booked && !editing) {
    return (
      <div className="card space-y-2 text-sm">
        <p className="font-semibold">{iAmBooker ? "You booked the cab" : `${partnerName} booked the cab`}</p>
        {state.driver && <p>Driver: {state.driver}</p>}
        {state.link && (
          <a href={state.link} target="_blank" rel="noopener noreferrer" className="btn-secondary w-full py-2">
            Track the ride
          </a>
        )}
        {iAmBooker && (
          <button onClick={() => setEditing(true)} className="w-full text-sky-700">
            Edit booking details
          </button>
        )}
      </div>
    );
  }

  if (!iAmBooker) {
    return (
      <div className="card text-sm">
        <p className="font-semibold">{partnerName} is booking the cab</p>
        <p className="mt-1 text-slate-600">You&apos;ll see the driver and a link to track the ride here once it&apos;s booked.</p>
      </div>
    );
  }

  // I'm the booker: open Uber, then share what Uber shows.
  return (
    <div className="card space-y-3 text-sm">
      <p className="font-semibold">You&apos;re booking the cab</p>
      <div className={`grid gap-2 ${ola ? "grid-cols-2" : ""}`}>
        <a href={uberLink(trip, uberClientId)} target="_blank" rel="noopener noreferrer" className="btn w-full bg-black py-2.5 text-white">
          Book on Uber
        </a>
        {ola && (
          <a href={ola} target="_blank" rel="noopener noreferrer" className="btn w-full bg-lime-500 py-2.5 text-black">
            Book on Ola
          </a>
        )}
      </div>
      <p className="text-slate-600">
        {fromAirport ? (
          <>Uber opens with your current location as the pickup and your address as the destination.</>
        ) : (
          <>
            Uber opens with your current location as the pickup and {trip.airportLat !== null ? trip.airportName : "the airport"} as the
            destination.{state.pickup ? ` If you aren't at ${state.pickup} yet, change the pickup in Uber.` : ""}
            {trip.airportLat === null ? " Enter the airport in Uber." : ""}
          </>
        )}
      </p>
      {fromAirport && (
        <div className="rounded-xl bg-amber-50 p-3 text-amber-900">
          <p className="font-medium">Add {partnerName}&apos;s drop-off as a stop in Uber</p>
          {state.drops ? (
            <div className="mt-1 flex items-start gap-2">
              <p className="flex-1">{state.drops}</p>
              <button onClick={copyDrops} className="shrink-0 font-semibold underline">
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          ) : (
            <p className="mt-1">Ask {partnerName} in the chat where to drop them.</p>
          )}
          <p className="mt-1 text-xs">In Uber, tap &quot;Add stop&quot; before you confirm. If their stop is further than yours, make it the destination instead.</p>
        </div>
      )}

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (await call("save_booking", { p_request_id: requestId, p_link: link, p_driver: driver })) setEditing(false);
        }}
        className="space-y-3 border-t border-slate-200 pt-3"
      >
        <p className="font-medium">Booked? Share it with {partnerName}</p>
        <div>
          <label className="label" htmlFor="tripLink">
            Trip link from Uber
          </label>
          <input
            id="tripLink"
            className="field"
            inputMode="url"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://…"
          />
          <p className="mt-1 text-xs text-slate-500">In Uber, tap &quot;Share trip status&quot; and copy the link.</p>
        </div>
        <div>
          <label className="label" htmlFor="driver">
            Driver, car and number plate
          </label>
          <input id="driver" className="field" value={driver} onChange={(e) => setDriver(e.target.value)} placeholder="e.g. Ravi, white Dzire, KA 01 AB 1234" maxLength={300} />
        </div>
        <button disabled={busy || (!link.trim() && !driver.trim())} className="btn-primary w-full">
          Share with {partnerName}
        </button>
      </form>
      {error && <p className="text-red-700">{error}</p>}
      <button disabled={busy} onClick={() => call("release_booking", { p_request_id: requestId })} className="w-full text-slate-500">
        I can&apos;t book it, let {partnerName} book
      </button>
    </div>
  );
}
