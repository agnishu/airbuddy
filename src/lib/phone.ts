/** Indian mobile numbers only for now: 10 digits starting 6 to 9. Returns the 10 digits, or null. */
export function normalizeIndianMobile(input: string) {
  let digits = input.replace(/[\s()-]/g, "");
  if (digits.startsWith("+91")) digits = digits.slice(3);
  else if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}

/**
 * Supabase sessions are keyed by email, so each phone number gets a stand-in
 * address that is never emailed or shown: 9876543210 -> 919876543210@<domain>.
 */
export function phoneLoginEmail(mobile: string, domain: string) {
  return `91${mobile}@${domain}`;
}

/** Test numbers that skip SMS, from "9999999999:123456,9888888888:654321". */
export function parseTestNumbers(value: string | undefined) {
  const numbers = new Map<string, string>();
  for (const pair of (value ?? "").split(",")) {
    const [phone, code] = pair.split(":").map((s) => s.trim());
    const mobile = phone ? normalizeIndianMobile(phone) : null;
    if (mobile && code && /^\d{4,8}$/.test(code)) numbers.set(mobile, code);
  }
  return numbers;
}
