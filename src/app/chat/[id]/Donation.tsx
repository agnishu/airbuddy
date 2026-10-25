"use client";

import { useSyncExternalStore, useState } from "react";

const AMOUNTS = [30, 50, 100];
const subscribe = () => () => {};

function readDismissed(key: string) {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

/** One optional UPI donation prompt per confirmed ride. */
export function Donation({ requestId, upiId }: { requestId: string; upiId?: string }) {
  const key = `airbuddy-donation-${requestId}`;
  const stored = useSyncExternalStore(subscribe, () => readDismissed(key), () => true);
  const [closed, setClosed] = useState(false);
  if (!upiId || stored || closed) return null;

  function dismiss() {
    try {
      localStorage.setItem(key, "1");
    } catch {}
    setClosed(true);
  }

  const link = (amount: number) =>
    `upi://pay?${new URLSearchParams({ pa: upiId, pn: "Airbuddy", am: String(amount), cu: "INR", tn: "Airbuddy donation" })}`;

  return (
    <div className="card space-y-3 text-sm">
      <p className="font-semibold">Airbuddy is free. Like it? Chip in to keep it running.</p>
      <div className="grid grid-cols-3 gap-2">
        {AMOUNTS.map((a) => (
          <a key={a} href={link(a)} onClick={dismiss} className="btn-secondary py-2">
            ₹{a}
          </a>
        ))}
      </div>
      <button onClick={dismiss} className="w-full text-slate-500">
        Not now
      </button>
    </div>
  );
}
