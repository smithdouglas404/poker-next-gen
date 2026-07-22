"use client";

import { useEffect, useMemo, useState } from "react";

import { callSessionRpc } from "@/lib/nakama/sessionRpc";
import { getRpcSchema } from "./schemas";
import { SchemaForm } from "./schemaForm/SchemaForm";
import { initialValues, validate } from "./schemaForm/validate";
import { describeSubmission } from "./schemaForm/confirm";
import type { RpcSchema } from "./schemaForm/schemaTypes";

// First-time club setup wizard (UI review P1-1): the flat grid never told an
// operator that Create → Rake → Roles → Balance is the right order. This walks
// them through it with the same schema-driven forms, carrying the new club's id
// forward so nothing is retyped.

interface Step {
  rpc?: string;
  title: string;
  blurb: string;
  cta: string;
  optional?: boolean;
}

const STEPS: Step[] = [
  { rpc: "club_create", title: "Create your club", blurb: "Name it and pick a currency. You become the owner.", cta: "Create club" },
  { rpc: "rake_config_set", title: "Set your rake", blurb: "Your commission per pot. You can change this any time.", cta: "Save rake" },
  { rpc: "club_owner_add", title: "Add a manager", blurb: "Optional — grant a trusted player a manager or agent role.", cta: "Add manager", optional: true },
  { rpc: "balance_allocate", title: "Allocate a starting balance", blurb: "Optional — credit a player chips so they can sit down.", cta: "Allocate balance", optional: true },
  { title: "You're all set", blurb: "Your club is live. Invite players and open a table when you're ready.", cta: "Finish" },
];

export function ClubSetupWizard({
  onClose,
  onComplete,
}: {
  onClose: () => void;
  onComplete: (clubId: string | null) => void;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [createdClubId, setCreatedClubId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const step = STEPS[stepIndex];
  const schema: RpcSchema | undefined = step.rpc ? getRpcSchema(step.rpc) : undefined;
  const isDone = !step.rpc;

  // Initialize the form when entering a step; carry the created club id forward.
  useEffect(() => {
    if (!schema) return;
    setValues(initialValues(schema, createdClubId ? { club_id: createdClubId } : {}));
    setError(null);
    setConfirming(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex]);

  const errors = useMemo(() => (schema ? validate(schema, values) : []), [schema, values]);
  const isMoney = step.rpc === "balance_allocate";

  async function run() {
    if (!step.rpc || !schema) return;
    setBusy(true);
    setError(null);
    try {
      const res = (await callSessionRpc(step.rpc, values)) as Record<string, unknown> | null;
      if (step.rpc === "club_create" && res && typeof res.id === "string") {
        setCreatedClubId(res.id);
      }
      setStepIndex((i) => i + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const advance = () => {
    if (errors.length > 0) return;
    if (isMoney && !confirming) {
      setConfirming(true);
      return;
    }
    void run();
  };

  const desc =
    isMoney && schema ? describeSubmission("balance_allocate", schema, values) : null;

  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-gold/30 bg-neutral-900 p-6 shadow-2xl">
        {/* Progress */}
        <div className="mb-5 flex items-center gap-2">
          {STEPS.map((s, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full ${
                i < stepIndex ? "bg-gold" : i === stepIndex ? "bg-gold/60" : "bg-white/10"
              }`}
              title={s.title}
            />
          ))}
        </div>

        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-gold/80">
          {isDone ? "Setup complete" : `Step ${stepIndex + 1} of ${STEPS.length - 1}`}
        </p>
        <h3 className="mt-1 text-xl font-semibold text-white">{step.title}</h3>
        <p className="mt-2 text-sm text-neutral-400">{step.blurb}</p>

        {isDone ? (
          <div className="mt-6 rounded-xl border border-green/25 bg-green/[0.06] p-4 text-sm text-neutral-200">
            Your club is created{createdClubId ? "" : ""}. You can allocate more balances, invite
            players, and open a table from the Command Center whenever you like.
          </div>
        ) : confirming && desc ? (
          <div className="mt-5">
            <div className="rounded-xl border border-gold/30 bg-gold/[0.06] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gold/80">Confirm</p>
              <p className="mt-1 text-sm font-medium text-white">{desc.sentence}</p>
            </div>
          </div>
        ) : schema ? (
          <div className="mt-5">
            <SchemaForm schema={schema} values={values} onChange={setValues} />
          </div>
        ) : null}

        {error && (
          <p className="mt-3 rounded-lg border border-brand/30 bg-brand/10 px-3 py-2 text-sm text-brand">
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          {isDone ? (
            <button
              type="button"
              onClick={() => onComplete(createdClubId)}
              className="rounded-full bg-gradient-to-r from-[#9a7b2c] via-gold to-gold-lite px-6 py-2.5 text-sm font-bold uppercase tracking-wider text-black transition hover:shadow-[0_0_22px_rgba(212,175,55,0.35)]"
            >
              Go to Command Center
            </button>
          ) : (
            <>
              {confirming ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run()}
                  className="rounded-full bg-gradient-to-r from-[#9a7b2c] via-gold to-gold-lite px-6 py-2.5 text-sm font-bold uppercase tracking-wider text-black transition hover:shadow-[0_0_22px_rgba(212,175,55,0.35)] disabled:opacity-50"
                >
                  Confirm &amp; continue
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy || errors.length > 0}
                  onClick={advance}
                  className="rounded-full bg-gradient-to-r from-[#9a7b2c] via-gold to-gold-lite px-6 py-2.5 text-sm font-bold uppercase tracking-wider text-black transition hover:shadow-[0_0_22px_rgba(212,175,55,0.35)] disabled:opacity-50"
                >
                  {step.cta}
                </button>
              )}
              {confirming && (
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="rounded-full border border-white/20 px-5 py-2.5 text-sm font-semibold uppercase tracking-wider text-neutral-300 hover:bg-white/5"
                >
                  Back
                </button>
              )}
              {step.optional && !confirming && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setStepIndex((i) => i + 1)}
                  className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-semibold uppercase tracking-wider text-neutral-400 hover:bg-white/5"
                >
                  Skip
                </button>
              )}
            </>
          )}
          <button
            type="button"
            onClick={onClose}
            className="ml-auto text-[11px] font-semibold uppercase tracking-wider text-neutral-500 hover:text-white"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
