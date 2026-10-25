"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** Formats a timestamp in the viewer's own time zone (the server only knows UTC). */
export function LocalTime({ iso, withDate = true }: { iso: string; withDate?: boolean }) {
  const text = useSyncExternalStore(
    subscribe,
    () =>
      new Date(iso).toLocaleString(undefined, {
        ...(withDate ? { weekday: "short", day: "numeric", month: "short" } : {}),
        hour: "numeric",
        minute: "2-digit",
      }),
    () => "",
  );
  return <time dateTime={iso}>{text}</time>;
}
