"use client";

import { useRef, useState } from "react";

import { GLASS_PANEL, cn } from "@/features/ui/tokens";
import { InlineMarkup } from "@/features/ui/InlineMarkup";

import { relTime } from "./ownerRpc";
import { SectionTitle } from "./ui";
import type { ClubAnnouncement } from "./types";

type Audience = "all" | "private" | "tournament";
type DeliveryStyle = "overlay" | "modal" | "chat";

const AUDIENCE: Array<{ id: Audience; label: string }> = [
  { id: "all", label: "All Players" },
  { id: "private", label: "Private Tables Only" },
  { id: "tournament", label: "Tournament Players Only" },
];

type Severity = "info" | "warning" | "critical";

const DELIVERY: Array<{ id: DeliveryStyle; label: string }> = [
  { id: "overlay", label: "Sleek Overlay" },
  { id: "modal", label: "Breaking News Modal" },
  { id: "chat", label: "Table Chat Blast" },
];

// Severity used to be DERIVED from the delivery style (overlay→info,
// modal→critical, chat→warning), so an operator could never send an
// informational modal or an urgent overlay. They are independent concerns:
// delivery is HOW it appears, severity is HOW LOUD it is.
const SEVERITY: Array<{ id: Severity; label: string; dot: string }> = [
  { id: "info", label: "Info", dot: "#22c55e" },
  { id: "warning", label: "Warning", dot: "#f5c518" },
  { id: "critical", label: "Critical", dot: "#e01e2b" },
];

/** Global Announcement Control Center (master: detailed_private_table_setup_4).
 * The composer (message + audience + delivery style) posts through
 * club_announcement_create; the sidebar lists prior broadcasts from
 * club_announcement_list. */
export function Announcements({
  announcements,
  demo,
  canManage,
  onBroadcast,
}: {
  announcements: ClubAnnouncement[];
  demo: boolean;
  canManage: boolean;
  onBroadcast: (
    title: string,
    body: string,
    severity: Severity,
    audience: Audience,
    channel: DeliveryStyle,
  ) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

  // Wrap the current selection (or caret) in markdown markers — real formatting,
  // not a decorative toolbar.
  const wrapSelection = (before: string, after: string) => {
    const el = bodyRef.current;
    if (!el) return;
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const sel = body.slice(start, end) || "text";
    const next = body.slice(0, start) + before + sel + after + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + before.length, start + before.length + sel.length);
    });
  };
  const [audience, setAudience] = useState<Audience>("all");
  const [delivery, setDelivery] = useState<DeliveryStyle>("modal");
  const [severity, setSeverity] = useState<Severity>("info");
  const [busy, setBusy] = useState(false);

  const deliveryMeta = DELIVERY.find((d) => d.id === delivery) ?? DELIVERY[1];
  const severityMeta = SEVERITY.find((x) => x.id === severity) ?? SEVERITY[0];
  const canSend = canManage && (title.trim() !== "" || body.trim() !== "") && !busy;

  const broadcast = () => {
    if (!canSend) return;
    setBusy(true);
    const finalTitle = title.trim() || body.trim().split("\n")[0].slice(0, 80) || "Club Announcement";
    void (async () => {
      try {
        // Audience, delivery channel and severity are all real params. The
        // server resolves the audience to actual recipients and sends.
        await onBroadcast(finalTitle, body.trim(), severity, audience, delivery);
        setTitle("");
        setBody("");
      } finally {
        setBusy(false);
      }
    })();
  };

  return (
    <div className="space-y-6">
      <SectionTitle eyebrow="Broadcast" title="Global Announcement Control Center" />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* LEFT — composer */}
        <div className="space-y-6">
          <div className={cn(GLASS_PANEL, "p-5")}>
            <p className="font-display text-lg font-semibold text-white">Announcement Message</p>

            {/* Subject */}
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Subject line (optional)"
              maxLength={80}
              className="mt-3 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-gold/40"
            />

            {/* Markdown toolbar — wraps the current selection (real formatting). */}
            <div className="mt-3 flex items-center gap-1 rounded-t-lg border border-b-0 border-white/10 bg-white/[0.03] px-2 py-1.5 text-white/60">
              {([
                { t: "B", before: "**", after: "**" },
                { t: "I", before: "*", after: "*" },
                { t: "U", before: "__", after: "__" },
                { t: "🔗", before: "[", after: "](https://)" },
              ] as const).map((b) => (
                <button
                  key={b.t}
                  type="button"
                  onClick={() => wrapSelection(b.before, b.after)}
                  className="flex h-7 min-w-7 items-center justify-center rounded px-1.5 text-sm font-bold transition hover:bg-white/10 hover:text-white"
                >
                  {b.t}
                </button>
              ))}
            </div>
            <textarea
              ref={bodyRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Enter your club-wide announcement here…"
              rows={6}
              className="w-full resize-none rounded-b-lg border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-gold/40"
            />
          </div>

          <div className={cn(GLASS_PANEL, "p-5")}>
            <p className="font-display text-base font-semibold text-white">Target Audience</p>
            <div className="mt-3 space-y-2">
              {AUDIENCE.map((a) => {
                const on = audience === a.id;
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setAudience(a.id)}
                    className="flex w-full items-center gap-3 rounded-lg px-1 py-1.5 text-left"
                  >
                    <span
                      className={cn(
                        "flex h-5 w-5 items-center justify-center rounded border text-[11px]",
                        on ? "border-gold bg-gold text-black" : "border-white/25 text-transparent",
                      )}
                    >
                      ✓
                    </span>
                    <span className={cn("text-sm", on ? "text-white" : "text-white/60")}>{a.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className={cn(GLASS_PANEL, "p-5")}>
            <p className="font-display text-base font-semibold text-white">Delivery Style</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {DELIVERY.map((d) => {
                const on = delivery === d.id;
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setDelivery(d.id)}
                    className={cn(
                      "rounded-lg border px-4 py-2 text-sm font-medium transition",
                      on
                        ? "border-gold bg-gold/10 text-gold shadow-[0_0_18px_rgba(245,197,24,0.18)]"
                        : "border-white/12 text-white/55 hover:border-white/30 hover:text-white/80",
                    )}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>

            <p className="mt-5 font-display text-base font-semibold text-white">Severity</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {SEVERITY.map((sv) => {
                const on = severity === sv.id;
                return (
                  <button
                    key={sv.id}
                    type="button"
                    onClick={() => setSeverity(sv.id)}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition",
                      on
                        ? "border-white/40 bg-white/[0.06] text-white"
                        : "border-white/12 text-white/55 hover:border-white/30 hover:text-white/80",
                    )}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ background: sv.dot }} />
                    {sv.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* RIGHT — live preview + broadcast */}
        <div className="space-y-6">
          <div className={cn(GLASS_PANEL, "p-5")}>
            <p className="font-display text-lg font-semibold text-white">Live Preview</p>
            <div className="mt-3 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0a0d12] p-4">
              <div className="flex items-center justify-center rounded-[999px/60%] border border-gold/25 bg-gradient-to-b from-[#0f5f39] to-[#053821] px-6 py-14">
                {delivery === "chat" ? (
                  <div className="w-full max-w-sm rounded-lg bg-black/70 px-3 py-2 text-left">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-gold">Table Chat</p>
                    <p className="mt-1 text-sm text-white/85">
                      {body.trim() ? (
                        <InlineMarkup text={body.trim()} />
                      ) : (
                        "Your announcement appears in every table chat."
                      )}
                    </p>
                  </div>
                ) : (
                  <div
                    className={cn(
                      "w-full max-w-sm rounded-lg text-center",
                      delivery === "modal"
                        ? "border border-gold/50 bg-[#12151b] shadow-[0_0_30px_rgba(245,197,24,0.15)]"
                        : "border border-white/15 bg-black/60",
                    )}
                  >
                    <div
                      className={cn(
                        "rounded-t-lg px-4 py-2 font-display text-sm font-bold",
                        delivery === "modal" ? "bg-gold/90 text-black" : "text-gold",
                      )}
                    >
                      {title.trim() || (delivery === "modal" ? "Breaking News Modal" : "Announcement")}
                    </div>
                    <div className="px-4 py-4 text-sm text-white/85">
                      {body.trim() ? (
                        // Same renderer the inbox uses, so the preview cannot
                        // drift from what a player actually reads.
                        <InlineMarkup text={body.trim()} />
                      ) : (
                        "ATTENTION ALL PLAYERS: your message renders here in the chosen style."
                      )}
                    </div>
                  </div>
                )}
              </div>
              <p className="mt-2 text-center text-[10px] uppercase tracking-[0.2em] text-white/35">
                {deliveryMeta.label} · {severityMeta.label} ·{" "}
                {AUDIENCE.find((a) => a.id === audience)?.label}
              </p>
            </div>
            {/* Say what the reach actually is. The in-table renderer lives in the
                table layer, which is frozen until the felt work resumes, so an
                announcement does not appear on the felt yet — and the operator
                should know that before they rely on it. */}
            <p className="mt-3 text-[11px] leading-snug text-white/40">
              Delivered to{" "}
              <span className="text-white/70">
                {audience === "private"
                  ? "members sitting at your tables right now"
                  : audience === "tournament"
                    ? "members entered in your tournaments"
                    : "every active member of your club"}
              </span>
              , and waiting in their notifications. It does not appear on the felt yet.
            </p>
          </div>

          <button
            type="button"
            onClick={broadcast}
            disabled={!canSend}
            className={cn(
              "flex h-16 w-full items-center justify-center rounded-2xl font-display text-xl font-bold uppercase tracking-[0.15em] text-black transition",
              "bg-gradient-to-r from-[#9a7b2c] via-[#f5c518] to-[#f3e2ad] hover:shadow-[0_0_28px_rgba(245,197,24,0.4)]",
              !canSend && "opacity-40",
            )}
          >
            {busy ? "Broadcasting…" : "Broadcast Now"}
          </button>
          {!canManage && (
            <p className="text-[11px] text-amber-300/80">
              Only club owners/admins can broadcast announcements.
            </p>
          )}

          {/* Recent broadcasts */}
          <div className={cn(GLASS_PANEL, "overflow-hidden")}>
            <div className="border-b border-white/[0.08] px-5 py-3">
              <p className="font-display text-[11px] font-bold uppercase tracking-[0.22em] text-gold/80">
                Recent Broadcasts
              </p>
            </div>
            {announcements.length === 0 ? (
              <p className="px-5 py-6 text-sm text-white/40">No announcements sent yet.</p>
            ) : (
              <div className="max-h-72 overflow-y-auto">
                {announcements.map((a) => (
                  <div key={a.id} className="border-b border-white/[0.05] px-5 py-3 last:border-0">
                    <div className="flex items-center gap-2">
                      <SeverityDot severity={a.severity} />
                      <p className="min-w-0 flex-1 truncate font-semibold text-white">{a.title}</p>
                      <span className="shrink-0 text-[10px] text-white/35">{relTime(a.created_at)}</span>
                    </div>
                    {a.body && (
                      <p className="mt-1 line-clamp-2 text-xs text-white/55">
                        <InlineMarkup text={a.body} />
                      </p>
                    )}
                    {(a.audience || a.channel) && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <span className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-white/50">
                          {AUDIENCE.find((x) => x.id === a.audience)?.label ?? "All Players"}
                        </span>
                        <span className="rounded border border-gold/20 bg-gold/[0.06] px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-gold/70">
                          {DELIVERY.find((x) => x.id === a.channel)?.label ?? "Sleek Overlay"}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          {demo && <p className="text-[11px] text-white/40">Demo mode — broadcasts are local only.</p>}
        </div>
      </div>
    </div>
  );
}

function SeverityDot({ severity }: { severity: string }) {
  const color =
    severity === "critical" ? "#e01e2b" : severity === "warning" ? "#f5c518" : "#22c55e";
  return <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />;
}
