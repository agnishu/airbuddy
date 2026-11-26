// Each value also accepts the names the Vercel Supabase integration creates,
// including the "NISH" prefix this project's integration was set up with.
// NEXT_PUBLIC_ names must be written out in full so Next.js can inline them.
export const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_NISHSUPABASE_URL)!;
export const supabasePublishableKey = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_NISHSUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_NISHSUPABASE_ANON_KEY)!;

/** Server only. Bypasses row-level security. */
export function supabaseSecretKey() {
  return (
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NISHSUPABASE_SECRET_KEY ??
    process.env.NISHSUPABASE_SERVICE_ROLE_KEY
  );
}

/** False until the Supabase URL and key are set (e.g. a fresh Vercel deploy). */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);
