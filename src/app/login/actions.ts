"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { normalizeIndianMobile, parseTestNumbers, phoneLoginEmail } from "@/lib/phone";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { passesBotCheck } from "@/lib/turnstile";
import { checkCode, sendCode, VerifyNowError } from "@/lib/verifynow";

const CODE_VALID_MINUTES = 10;
const MAX_SENDS_PER_NUMBER = 3; // per 15 minutes
const MAX_SENDS_PER_IP = 10; // per hour
const MAX_ATTEMPTS = 5;

async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
}

function minutesAgo(minutes: number) {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

export type SendResult = { error: string } | { requestId: string; mobile: string };

export async function sendLoginCode(formData: FormData): Promise<SendResult> {
  const mobile = normalizeIndianMobile(String(formData.get("phone") ?? ""));
  if (!mobile) return { error: "Enter a 10-digit Indian mobile number." };

  const ip = await clientIp();
  if (!(await passesBotCheck(String(formData.get("cf-turnstile-response") ?? "") || null, ip))) {
    return { error: "Please complete the check above and try again." };
  }

  const db = createServiceClient();
  const [{ count: byNumber }, { count: byIp }] = await Promise.all([
    db.from("phone_verifications").select("id", { count: "exact", head: true }).eq("phone", mobile).gte("created_at", minutesAgo(15)),
    ip
      ? db.from("phone_verifications").select("id", { count: "exact", head: true }).eq("ip", ip).gte("created_at", minutesAgo(60))
      : Promise.resolve({ count: 0 }),
  ]);
  if ((byNumber ?? 0) >= MAX_SENDS_PER_NUMBER || (byIp ?? 0) >= MAX_SENDS_PER_IP) {
    return { error: "Too many codes requested. Try again in 15 minutes." };
  }

  let verificationId: string;
  if (parseTestNumbers(process.env.OTP_TEST_NUMBERS).has(mobile)) {
    verificationId = "test";
  } else {
    try {
      verificationId = await sendCode(mobile);
    } catch (e) {
      return { error: e instanceof VerifyNowError ? e.message : "Couldn't send the code. Try again." };
    }
  }

  const { data, error } = await db
    .from("phone_verifications")
    .insert({ phone: mobile, verification_id: verificationId, ip })
    .select("id")
    .single();
  if (error || !data) return { error: "Couldn't send the code. Try again." };
  return { requestId: data.id, mobile };
}

export async function verifyLoginCode(formData: FormData): Promise<{ error: string }> {
  const requestId = String(formData.get("requestId") ?? "");
  const code = String(formData.get("code") ?? "").replace(/\s/g, "");
  const next = String(formData.get("next") ?? "/trips");
  if (!/^\d{4,8}$/.test(code)) return { error: "Enter the 6-digit code from the SMS." };

  const db = createServiceClient();
  const { data: row } = await db
    .from("phone_verifications")
    .select("id, phone, verification_id, attempts, verified_at, created_at")
    .eq("id", requestId)
    .maybeSingle();
  if (!row || row.verified_at || new Date(row.created_at).getTime() < Date.now() - CODE_VALID_MINUTES * 60_000) {
    return { error: "That code has expired. Ask for a new one." };
  }
  if (row.attempts >= MAX_ATTEMPTS) return { error: "Too many tries. Ask for a new code." };
  await db.from("phone_verifications").update({ attempts: row.attempts + 1 }).eq("id", row.id);

  const testCode = parseTestNumbers(process.env.OTP_TEST_NUMBERS).get(row.phone);
  if (row.verification_id === "test") {
    if (!testCode || code !== testCode) return { error: "That code isn't right. Check the SMS and try again." };
  } else {
    const result = await checkCode(row.verification_id, code);
    if (!result.ok) return { error: result.message };
    // The code must have been sent to the number this login is for.
    if (normalizeIndianMobile(result.mobile) !== row.phone) return { error: "That code isn't right. Check the SMS and try again." };
  }
  await db.from("phone_verifications").update({ verified_at: new Date().toISOString() }).eq("id", row.id);

  // Sign the rider in: Supabase creates the account on first login.
  const email = phoneLoginEmail(row.phone, process.env.PHONE_LOGIN_EMAIL_DOMAIN ?? "phone.airbuddy.app");
  const { data: link, error: linkError } = await db.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { data: { phone: `+91${row.phone}` } },
  });
  if (linkError || !link.properties?.hashed_token) return { error: "Couldn't log you in. Try again." };

  const supabase = await createClient();
  const { error: sessionError } = await supabase.auth.verifyOtp({ type: "email", token_hash: link.properties.hashed_token });
  if (sessionError) return { error: "Couldn't log you in. Try again." };

  const { data: profile } = await supabase.from("profiles").select("gender, full_name, photo_url").single();
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/trips";
  const complete = profile?.gender && profile.full_name && profile.photo_url;
  redirect(complete ? safeNext : `/profile?next=${encodeURIComponent(safeNext)}`);
}
