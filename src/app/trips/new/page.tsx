import { Header } from "@/components/Header";
import { requireUser } from "@/lib/supabase/server";
import { TripForm } from "./TripForm";

export default async function NewTripPage() {
  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase.from("profiles").select("gender").eq("id", user.id).single();
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <Header title="Add a trip" back="/trips" />
      <main className="flex-1 px-4 py-6">
        <TripForm defaultSameGender={profile?.gender === "female"} today={today} />
      </main>
    </>
  );
}
