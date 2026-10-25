/* eslint-disable @next/next/no-img-element */
import { Header } from "@/components/Header";
import { requireUser } from "@/lib/supabase/server";
import { saveProfile, signOut } from "./actions";

const genders = [
  { value: "female", label: "Woman" },
  { value: "male", label: "Man" },
  { value: "other", label: "Non-binary or other" },
  { value: "undisclosed", label: "Prefer not to say" },
];

export default async function ProfilePage({ searchParams }: PageProps<"/profile">) {
  const { next, error } = await searchParams;
  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase.from("profiles").select("full_name, photo_url, gender").eq("id", user.id).single();

  return (
    <>
      <Header title="Your profile" back={profile?.gender ? "/trips" : undefined} />
      <main className="flex-1 space-y-6 px-4 py-6">
        <div className="flex items-center gap-4">
          {profile?.photo_url ? (
            <img src={profile.photo_url} alt="" className="h-16 w-16 rounded-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <div className="h-16 w-16 rounded-full bg-slate-200" />
          )}
          <p className="text-sm text-slate-600">Other riders see your first name and photo. Your email and address stay private.</p>
        </div>

        {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">Please enter your name and choose an option below.</p>}

        <form action={saveProfile} className="space-y-5">
          <input type="hidden" name="next" value={typeof next === "string" ? next : "/trips"} />
          <div>
            <label className="label" htmlFor="full_name">
              Name
            </label>
            <input id="full_name" name="full_name" className="field" defaultValue={profile?.full_name ?? ""} required maxLength={80} />
          </div>
          <fieldset>
            <legend className="label">Gender</legend>
            <p className="mb-2 text-sm text-slate-500">
              Used only for same-gender matching, which is on by default for women. Never shown to other riders.
            </p>
            <div className="space-y-2">
              {genders.map((g) => (
                <label key={g.value} className="card flex items-center gap-3 py-3">
                  <input type="radio" name="gender" value={g.value} defaultChecked={profile?.gender === g.value} required className="h-5 w-5 accent-sky-700" />
                  {g.label}
                </label>
              ))}
            </div>
          </fieldset>
          <button className="btn-primary w-full">Save</button>
        </form>

        <form action={signOut}>
          <button className="btn-secondary w-full">Sign out</button>
        </form>
      </main>
    </>
  );
}
