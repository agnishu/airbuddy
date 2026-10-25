import { NextResponse, type NextRequest } from "next/server";
import { autocomplete, PlacesError } from "@/lib/places";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const input = (request.nextUrl.searchParams.get("q") ?? "").trim();
  const session = request.nextUrl.searchParams.get("session") ?? "";
  if (input.length < 3) return NextResponse.json({ suggestions: [] });
  try {
    return NextResponse.json({ suggestions: await autocomplete(input.slice(0, 200), session) });
  } catch (e) {
    const message = e instanceof PlacesError ? e.message : "Address search failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
