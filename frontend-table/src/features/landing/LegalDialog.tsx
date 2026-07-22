"use client";

import { Modal } from "./Modal";

export type LegalDoc = "about" | "terms" | "privacy" | null;

const COPY: Record<Exclude<LegalDoc, null>, { eyebrow: string; title: string; body: string[] }> = {
  about: {
    eyebrow: "The network",
    title: "About",
    body: [
      "High Rollers Club is a provably-fair, community-first Texas Hold'em network. Every deck is cryptographically committed before the deal and anchored to a public chain, so any hand can be independently verified.",
      "The table runs on a real GPU renderer with 3D characters, a Rust poker engine for correct side-pots and equity, and a wallet that moves in crypto or card. Members can own their own clubs, set their own rake, and run their own rooms.",
      "This is poker infrastructure built to be checked, not trusted.",
    ],
  },
  terms: {
    eyebrow: "Legal",
    title: "Terms of Service",
    body: [
      "By accessing the network you agree to play fairly, to be of legal age in your jurisdiction, and to use the platform only where online poker is permitted by law.",
      "Chips, balances, and cosmetics are subject to the platform's economy rules. Deposits and withdrawals are processed subject to AML review; fraudulent or collusive play may result in forfeiture and account closure.",
      "The service is provided as-is. These terms are a plain-language summary for the marketing site; the binding legal agreement is presented in full during account registration.",
    ],
  },
  privacy: {
    eyebrow: "Legal",
    title: "Privacy Policy",
    body: [
      "We collect only what's needed to run your account, secure the network, and meet regulatory obligations: your login identity, wallet activity, hand history, and device signals used for fraud prevention.",
      "Your hole cards are encrypted per session and are never shared with other players. Aggregate, non-identifying network statistics may be shown publicly (hands dealt, players online).",
      "You can request account recovery or contact support at any time from this page. Full data-handling details are provided during registration.",
    ],
  },
};

export function LegalDialog({ doc, onClose }: { doc: LegalDoc; onClose: () => void }) {
  if (!doc) return null;
  const c = COPY[doc];
  return (
    <Modal open onClose={onClose} eyebrow={c.eyebrow} title={c.title} wide>
      <div className="space-y-3">
        {c.body.map((p, i) => (
          <p key={i} className="text-sm leading-relaxed text-neutral-400">
            {p}
          </p>
        ))}
      </div>
    </Modal>
  );
}
