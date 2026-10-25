import { GoogleSignIn } from "./GoogleSignIn";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, error } = await searchParams;
  return (
    <main className="flex flex-1 flex-col justify-center px-6 py-10">
      <h1 className="text-3xl font-bold">Sign in to Airbuddy</h1>
      <p className="mt-3 text-slate-600">
        We use your Google account so every rider has a verified name and photo. Your email is never shown to
        other riders.
      </p>
      {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">Sign-in didn&apos;t finish. Please try again.</p>}
      <div className="mt-8">
        <GoogleSignIn next={typeof next === "string" && next.startsWith("/") ? next : "/trips"} />
      </div>
      <p className="mt-6 text-xs text-slate-500">You must be 18 or older to use Airbuddy.</p>
    </main>
  );
}
