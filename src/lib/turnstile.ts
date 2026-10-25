import "server-only";

/** Cloudflare Turnstile bot check. Skipped when no secret key is configured (local development). */
export async function passesBotCheck(token: string | null, ip: string | null) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token) return false;
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set("remoteip", ip);
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body, cache: "no-store" });
  const data = await res.json().catch(() => null);
  return data?.success === true;
}
