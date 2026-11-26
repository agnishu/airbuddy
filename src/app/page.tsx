import Link from "next/link";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  if (!isSupabaseConfigured) return <SetupNeeded />;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/trips");

  return (
    <main className="flex flex-1 flex-col justify-between px-6 py-10">
      <div>
        <p className="text-sm font-semibold tracking-wide text-sky-700 uppercase">Airbuddy</p>
        <h1 className="mt-3 text-4xl font-bold leading-tight">Split your airport cab with someone going your way.</h1>
        <p className="mt-4 text-lg text-slate-600">
          Add your flight and address. We find travellers within 2 km leaving within an hour of you, so you can
          share the ride and halve the fare.
        </p>
        <ul className="mt-8 space-y-3 text-slate-700">
          <li>✓ Works for trips to and from any airport</li>
          <li>✓ Your address is never shown, only a distance</li>
          <li>✓ Same-gender matching, on by default for women</li>
          <li>✓ Free to use</li>
        </ul>
      </div>
      <div className="mt-10 space-y-3">
        <Link href="/login" className="btn-primary w-full">
          Get started
        </Link>
        <p className="text-center text-xs text-slate-500">
          <Link href="/privacy" className="underline">
            Privacy
          </Link>{" "}
          ·{" "}
          <Link href="/terms" className="underline">
            Terms
          </Link>
        </p>
      </div>
    </main>
  );
}

function SetupNeeded() {
  return (
    <main className="flex flex-1 flex-col justify-center px-6 py-10">
      <p className="text-sm font-semibold tracking-wide text-sky-700 uppercase">Airbuddy</p>
      <h1 className="mt-3 text-3xl font-bold">Almost ready</h1>
      <p className="mt-4 text-slate-600">
        The app is deployed but not connected to its database yet. In Vercel, add{" "}
        <code className="rounded bg-slate-100 px-1">NEXT_PUBLIC_SUPABASE_URL</code>,{" "}
        <code className="rounded bg-slate-100 px-1">NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> and{" "}
        <code className="rounded bg-slate-100 px-1">SUPABASE_SECRET_KEY</code> under Settings → Environment
        Variables, then redeploy.
      </p>
    </main>
  );
}
