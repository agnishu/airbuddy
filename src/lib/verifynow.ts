import "server-only";

// Message Central VerifyNow: sends login codes by SMS from its own registered senders.
const API = "https://cpaas.messagecentral.com";
const COUNTRY = "91";
const CODE_LENGTH = 6;

export class VerifyNowError extends Error {}

async function authToken() {
  const customerId = process.env.VERIFYNOW_CUSTOMER_ID;
  const password = process.env.VERIFYNOW_PASSWORD;
  if (!customerId || !password) throw new VerifyNowError("Phone login isn't set up yet.");
  const params = new URLSearchParams({
    customerId,
    key: Buffer.from(password).toString("base64"),
    scope: "NEW",
    country: COUNTRY,
  });
  const res = await fetch(`${API}/auth/v1/authentication/token?${params}`, { cache: "no-store" });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.token) throw new VerifyNowError("Couldn't reach the SMS service. Try again in a minute.");
  return data.token as string;
}

/** Texts a code to the number and returns the id needed to check it. */
export async function sendCode(mobile: string) {
  const params = new URLSearchParams({
    customerId: process.env.VERIFYNOW_CUSTOMER_ID ?? "",
    countryCode: COUNTRY,
    mobileNumber: mobile,
    flowType: "SMS",
    otpLength: String(CODE_LENGTH),
  });
  const res = await fetch(`${API}/verification/v3/send?${params}`, {
    method: "POST",
    headers: { authToken: await authToken() },
    cache: "no-store",
  });
  const body = await res.json().catch(() => null);
  const verificationId = body?.data?.verificationId;
  if (body?.responseCode === 506 || body?.data?.responseCode === "506") {
    throw new VerifyNowError("A code was just sent. Wait a minute before asking for another.");
  }
  if (!res.ok || !verificationId) throw new VerifyNowError("Couldn't send the code. Check the number and try again.");
  return String(verificationId);
}

export type CheckResult = { ok: true; mobile: string } | { ok: false; message: string };

const FAILURES: Record<string, string> = {
  "702": "That code isn't right. Check the SMS and try again.",
  "705": "That code has expired. Ask for a new one.",
  "800": "Too many tries. Ask for a new code.",
  "703": "That code was already used. Ask for a new one.",
};

/** Checks a code. On success, returns the number VerifyNow says the code was sent to. */
export async function checkCode(verificationId: string, code: string): Promise<CheckResult> {
  const params = new URLSearchParams({
    customerId: process.env.VERIFYNOW_CUSTOMER_ID ?? "",
    verificationId,
    code,
    flowType: "SMS",
  });
  const res = await fetch(`${API}/verification/v3/validateOtp?${params}`, {
    headers: { authToken: await authToken() },
    cache: "no-store",
  });
  const body = await res.json().catch(() => null);
  const status = body?.data?.verificationStatus;
  if (res.ok && status === "VERIFICATION_COMPLETED" && body?.data?.mobileNumber) {
    return { ok: true, mobile: String(body.data.mobileNumber) };
  }
  const code_ = String(body?.responseCode ?? body?.data?.responseCode ?? "");
  return { ok: false, message: FAILURES[code_] ?? "Couldn't check the code. Try again." };
}
