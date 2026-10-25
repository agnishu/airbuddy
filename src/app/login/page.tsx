import { GoogleSignIn } from "./GoogleSignIn";
import { PhoneLogin } from "./PhoneLogin";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, error } = await searchParams;
  const safeNext = typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/trips";
  return (
    <main className="flex flex-1 flex-col justify-center px-6 py-10">
      <h1 className="text-3xl font-bold">Log in to Airbuddy</h1>
      <p className="mt-3 text-slate-600">
        Enter your mobile number and we&apos;ll text you a code. Your number is never shown to other riders.
      </p>
      {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">Login didn&apos;t finish. Please try again.</p>}
      <div className="mt-8">
        <PhoneLogin next={safeNext} siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY} />
      </div>
      <div className="my-6 flex items-center gap-3 text-xs text-slate-400">
        <span className="h-px flex-1 bg-slate-200" />
        or
        <span className="h-px flex-1 bg-slate-200" />
      </div>
      <GoogleSignIn next={safeNext} />
      <p className="mt-6 text-xs text-slate-500">You must be 18 or older to use Airbuddy.</p>
    </main>
  );
}
