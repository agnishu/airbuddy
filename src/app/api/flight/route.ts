import { NextResponse, type NextRequest } from "next/server";
import { FlightLookupError, lookupFlight } from "@/lib/flights";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const number = request.nextUrl.searchParams.get("number") ?? "";
  const date = request.nextUrl.searchParams.get("date") ?? "";
  try {
    return NextResponse.json({ flights: await lookupFlight(number, date) });
  } catch (e) {
    const message = e instanceof FlightLookupError ? e.message : "Flight lookup failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
