"use client";

import { useEffect, useState } from "react";

import { LegalDialog, type LegalDoc } from "@/features/landing/LegalDialog";

// One-time gate in front of the Clerk sign-up widget. Real-money gaming
// requires an affirmative, on-record disclosure at registration — age, ToS,
// gambling risk, and that identity verification (KYC/AML) is required before
// money moves — not just copy on a marketing page nobody has to read. The
// checkbox here is the front-door affirmation; ClerkNakamaBridge records the
// backend consent (consent_record: signup_tos) once the account exists, since
// there is no Nakama session yet to attach it to on this pre-auth page.
export const SIGNUP_CONSENT_KEY = "hrc.signup.consent.v1";

export function SignupConsentGate({ children }: { children: React.ReactNode }) {
  const [ok, setOk] = useState(true); // assume ok during SSR to avoid a flash
  const [checked, setChecked] = useState(false);
  const [doc, setDoc] = useState<LegalDoc>(null);

  useEffect(() => {
    setOk(window.localStorage.getItem(SIGNUP_CONSENT_KEY) === "1");
  }, []);

  if (ok) return <>{children}</>;

  return (
    <>
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#191d25] p-8 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-gold/80">
          High Rollers Club
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-white">Before you create an account</h2>
        <p className="mt-3 text-left text-sm leading-relaxed text-neutral-300">
          You must be at least 18 (or 21 where required in your jurisdiction) to register. Real-money
          play carries a risk of financial loss, and deposits &amp; withdrawals require identity
          verification (KYC/AML) before funds can move.
        </p>
        <label className="mt-5 flex items-start gap-3 text-left text-xs leading-relaxed text-neutral-300">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/30 bg-transparent accent-gold"
          />
          <span>
            I confirm I meet the age requirement above and agree to the{" "}
            <button
              type="button"
              onClick={() => setDoc("terms")}
              className="font-semibold text-gold underline underline-offset-2"
            >
              Terms of Service
            </button>{" "}
            and{" "}
            <button
              type="button"
              onClick={() => setDoc("privacy")}
              className="font-semibold text-gold underline underline-offset-2"
            >
              Privacy Policy
            </button>
            , including that identity verification is required for real-money deposits and
            withdrawals.
          </span>
        </label>
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            disabled={!checked}
            onClick={() => {
              window.localStorage.setItem(SIGNUP_CONSENT_KEY, "1");
              setOk(true);
            }}
            className="flex-1 rounded-full bg-gradient-to-r from-[#9a7b2c] via-gold to-gold-lite px-6 py-2.5 text-sm font-bold uppercase tracking-wider text-black disabled:cursor-not-allowed disabled:opacity-40"
          >
            Continue to sign up
          </button>
          <a
            href="https://www.begambleaware.org/"
            className="rounded-full border border-white/20 px-5 py-2.5 text-sm font-semibold uppercase tracking-wider text-neutral-300 hover:bg-white/5"
          >
            Leave
          </a>
        </div>
      </div>
      <LegalDialog doc={doc} onClose={() => setDoc(null)} />
    </>
  );
}
