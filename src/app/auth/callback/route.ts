import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Google sends the rider back here with a one-time code, which we swap for a session.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/trips";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/trips";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const { data: profile } = await supabase.from("profiles").select("gender").single();
      // New riders set their gender first so same-gender matching can default correctly.
      return NextResponse.redirect(`${origin}${profile?.gender ? safeNext : `/profile?next=${encodeURIComponent(safeNext)}`}`);
    }
  }
  return NextResponse.redirect(`${origin}/login?error=1`);
}
