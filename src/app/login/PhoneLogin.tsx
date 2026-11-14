"use client";

import Script from "next/script";
import { useEffect, useRef, useState, useTransition } from "react";
import { sendLoginCode, verifyLoginCode } from "./actions";

declare global {
  interface Window {
    turnstile?: { reset: (el?: HTMLElement) => void };
  }
}

const RESEND_SECONDS = 60;

export function PhoneLogin({ next, siteKey }: { next: string; siteKey?: string }) {
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [requestId, setRequestId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(0);
  const [pending, start] = useTransition();
  const widget = useRef<HTMLDivElement>(null);
  const phoneForm = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  function send(formData: FormData) {
    setError(null);
    start(async () => {
      const result = await sendLoginCode(formData);
      if (widget.current) window.turnstile?.reset(widget.current);
      if ("error" in result) return setError(result.error);
      setRequestId(result.requestId);
      setSentTo(result.mobile);
      setStep("code");
      setWait(RESEND_SECONDS);
    });
  }

  function verify(formData: FormData) {
    setError(null);
    start(async () => {
      const result = await verifyLoginCode(formData);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="space-y-4">
      {siteKey && <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />}

      {/* The phone form stays mounted so the bot check is ready for "Resend". */}
      <form ref={phoneForm} action={send} className={step === "phone" ? "space-y-4" : "hidden"}>
        <div>
          <label className="label" htmlFor="phone">
            Mobile number
          </label>
          <div className="flex gap-2">
            <span className="field w-auto shrink-0 bg-slate-100 text-slate-600">+91</span>
            <input
              id="phone"
              name="phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              className="field"
              placeholder="98765 43210"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
          </div>
        </div>
        {siteKey && <div ref={widget} className="cf-turnstile" data-sitekey={siteKey} data-size="flexible" />}
        <button className="btn-primary w-full" disabled={pending || !phone.trim()}>
          {pending && step === "phone" ? "Sending code…" : "Send code"}
        </button>
      </form>

      {step === "code" && (
        <form action={verify} className="space-y-4">
          <input type="hidden" name="requestId" value={requestId} />
          <input type="hidden" name="next" value={next} />
          <p className="text-sm text-slate-600">
            We sent a 6-digit code to +91 {sentTo.slice(0, 5)} {sentTo.slice(5)}.{" "}
            <button
              type="button"
              className="font-medium text-sky-700"
              onClick={() => {
                setStep("phone");
                setError(null);
              }}
            >
              Change number
            </button>
          </p>
          <div>
            <label className="label" htmlFor="code">
              Code
            </label>
            <input
              id="code"
              name="code"
              className="field text-center text-2xl tracking-[0.5em]"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={8}
              required
              autoFocus
            />
          </div>
          <button className="btn-primary w-full" disabled={pending}>
            {pending ? "Checking…" : "Log in"}
          </button>
          <button
            type="button"
            className="w-full text-sm text-slate-600 disabled:opacity-50"
            disabled={wait > 0 || pending}
            onClick={() => phoneForm.current?.requestSubmit()}
          >
            {wait > 0 ? `Resend code in ${wait}s` : "Resend code"}
          </button>
        </form>
      )}

      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    </div>
  );
}
