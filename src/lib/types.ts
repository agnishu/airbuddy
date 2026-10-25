import type { Direction } from "./rideTime";

export type Trip = {
  id: string;
  direction: Direction;
  flight_number: string;
  airport_iata: string;
  airport_name: string | null;
  terminal: string | null;
  flight_time: string;
  ride_time: string;
  area: string;
  status: "open" | "matched" | "cancelled";
};

export type Match = {
  trip_id: string;
  first_name: string;
  photo_url: string | null;
  area: string;
  distance_band: string;
  minutes_apart: number;
  terminal: string | null;
  same_terminal: boolean;
  ride_time: string;
  score: number;
};

export type RequestStatus = "pending" | "accepted" | "declined" | "expired" | "confirmed" | "cancelled";
