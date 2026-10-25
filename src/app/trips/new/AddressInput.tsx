"use client";

import { useEffect, useRef, useState } from "react";
import type { Suggestion } from "@/lib/places";
import { getPlace } from "../actions";

export type ChosenAddress = { address: string; area: string; lat: number; lng: number };

export function AddressInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: ChosenAddress | null;
  onChange: (value: ChosenAddress | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  // One billing session per address search, as Google recommends.
  const session = useRef<string>("");

  useEffect(() => {
    if (value || query.trim().length < 3) return;
    if (!session.current) session.current = crypto.randomUUID();
    const timer = setTimeout(async () => {
      const res = await fetch(`/api/places/autocomplete?q=${encodeURIComponent(query)}&session=${session.current}`);
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error);
        setSuggestions([]);
      } else {
        setMessage(null);
        setSuggestions(data.suggestions);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, value]);

  async function choose(s: Suggestion) {
    setSuggestions([]);
    const result = await getPlace(s.placeId, session.current);
    session.current = "";
    if (result.error || !result.place) return setMessage(result.error ?? "Couldn't load that address.");
    setQuery(`${s.main}, ${s.secondary}`);
    onChange(result.place);
  }

  function useLocation() {
    setLocating(true);
    setMessage(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        onChange({ address: "Current location", area: "", lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        setLocating(false);
        setMessage("Couldn't get your location. Allow location access or type your address.");
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  return (
    <div>
      <label className="label" htmlFor="address">
        {label}
      </label>
      {value ? (
        <div className="card space-y-3">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm">{value.address}</p>
            <button
              type="button"
              className="text-sm font-medium text-sky-700"
              onClick={() => {
                onChange(null);
                setQuery("");
              }}
            >
              Change
            </button>
          </div>
          <div>
            <label className="label" htmlFor="area">
              Area shown to other riders
            </label>
            <input
              id="area"
              className="field"
              placeholder="e.g. Indiranagar"
              value={value.area}
              maxLength={60}
              onChange={(e) => onChange({ ...value, area: e.target.value })}
              required
            />
          </div>
        </div>
      ) : (
        <div className="relative space-y-2">
          <input
            id="address"
            className="field"
            placeholder="Start typing your address"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
          />
          {suggestions.length > 0 && (
            <ul className="absolute inset-x-0 top-14 z-20 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
              {suggestions.map((s) => (
                <li key={s.placeId}>
                  <button type="button" onClick={() => choose(s)} className="w-full px-3 py-2.5 text-left hover:bg-slate-50">
                    <span className="block text-sm font-medium">{s.main}</span>
                    <span className="block text-xs text-slate-500">{s.secondary}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button type="button" onClick={useLocation} disabled={locating} className="text-sm font-medium text-sky-700">
            {locating ? "Finding you…" : "Use my current location"}
          </button>
        </div>
      )}
      {message && <p className="mt-2 text-sm text-amber-700">{message}</p>}
      <p className="mt-1 text-xs text-slate-500">Never shown to other riders. They only see your area and distance.</p>
    </div>
  );
}
