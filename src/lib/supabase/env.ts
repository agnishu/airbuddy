export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
export const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** False until the Supabase URL and key are set (e.g. a fresh Vercel deploy). */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);
