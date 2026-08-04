// End-to-end proof of the THREE-TIER sit-down gate, over the real Nakama wire
// protocol against a real plugin and a real Postgres. Not a mock.
//
// The tiers the owner specified:
//
//   no identity at all                -> WATCH ONLY, never seated, never queued
//   email verified + code, non-member -> seat after operator approval
//   club member                       -> existing KYC/geo/wallet rules
//
// Why this file exists beside guest-approval-e2e.mjs: that harness only ever
// exercised a device-only account, so it could not tell the difference between
// "queued for approval" and "refused outright". The gate keyed off isGuest
// ("no email AND no clerk: prefix"), which meant an identity-less visitor was
// QUEUED and could be approved into a seat — tier 1 holding tier 2's rights —
// and, in the other direction, that verifying an email made a coded visitor
// stop matching isGuest and walk straight past the gate.
//
// Run after standing the local stack up (postgres:5433, engine-math:8080,
// nakama:7350 with backend-core.so loaded):
//
//   node scripts/table-sim/guest-tiers-e2e.mjs
//
// Seeds plan/balance prerequisites straight into the DB — point it only at a
// throwaway local database, never anything real.

import { Client } from "@heroiclabs/nakama-js";
import { execSync } from "node:child_process";

const client = new Client("defaultkey", "127.0.0.1", "7350", false);
const P = (o) => { try { return JSON.stringify(o ?? null).slice(0, 240); } catch { return String(o); } };
const sql = (q) => execSync(`psql -h 127.0.0.1 -p 5433 -U postgres -d nakama -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const OP_SIT = 1, OP_ERROR = 108;
const rpc = async (s, n, p = {}) => {
  const r = await client.rpc(s, n, p);
  return typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload;
};

const stamp = Date.now();
const fails = [];
const check = (ok, label, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` -> ${detail}` : ""}`);
  if (!ok) fails.push(label);
};

// ── host + club + coded table ────────────────────────────────────────────────
const hostS = await client.authenticateEmail(`host_${stamp}@t.local`, "Passw0rd!123", true);
sql(`INSERT INTO poker_subscription (user_id,tier,status) VALUES ('${hostS.user_id}','platinum','active') ON CONFLICT (user_id) DO UPDATE SET tier='platinum', status='active'`);
sql(`INSERT INTO poker_global_wallet (user_id,balance) VALUES ('${hostS.user_id}',5000000) ON CONFLICT (user_id) DO UPDATE SET balance=5000000`);

const club = await rpc(hostS, "club_create", { name: `Tiers ${stamp}`, slug: `tr${stamp}` });
const clubId = club?.club?.id ?? club?.id;
const table = await rpc(hostS, "table_create", {
  club_id: clubId, small_blind: 100, big_blind: 200, max_seats: 6,
  access_type: "invite", join_code: "TIER99", allow_spectators: true,
  stake_mode: "play", trust_code_guests: false,
});
const matchId = table?.match_id ?? table?.table?.match_id;
if (!matchId) { console.log("NO MATCH — cannot test"); process.exit(1); }
console.log(`club ${clubId}\ntable ${matchId}\n`);

/** Join the coded table as `session` and try to sit; return the error codes seen. */
async function trySit(session, seat) {
  const sock = client.createSocket(false, false);
  const errs = [];
  sock.onmatchdata = (md) => {
    if (md.op_code !== OP_ERROR) return;
    try { errs.push(JSON.parse(new TextDecoder().decode(md.data))); } catch { /* ignore */ }
  };
  await sock.connect(session, true);
  await sock.joinMatch(matchId, undefined, { join_code: "TIER99" });
  await sock.sendMatchState(matchId, OP_SIT, JSON.stringify({ seat, buy_in_cents: 100000 }));
  await new Promise((r) => setTimeout(r, 4000));
  return errs;
}

const approvalRows = (uid) => Number(sql(`SELECT count(*) FROM poker_guest_approval WHERE user_id='${uid}'`));

// ── TIER 1: no identity — watch only ─────────────────────────────────────────
console.log("── tier 1: device-only account, no email ──");
const anonS = await client.authenticateDevice(`anon_${stamp}`, true);
const e1 = await trySit(anonS, 1);
check(e1.some((e) => e.code === "guest_identity_required"), "tier 1 refused with guest_identity_required", P(e1[0]?.code));
check(!e1.some((e) => e.code === "guest_approval_pending"), "tier 1 NOT sent to the approval queue");
// The point of the tier: an operator cannot approve someone they cannot identify.
check(approvalRows(anonS.user_id) === 0, "tier 1 wrote NO approval row", `rows=${approvalRows(anonS.user_id)}`);

// ── TIER 2: email verified, not a club member — approval required ────────────
console.log("\n── tier 2: email account, not a member of this club ──");
const mailAddr = `visitor_${stamp}@t.local`;
const mailS = await client.authenticateEmail(mailAddr, "Passw0rd!123", true);
sql(`INSERT INTO poker_global_wallet (user_id,balance) VALUES ('${mailS.user_id}',5000000) ON CONFLICT (user_id) DO UPDATE SET balance=5000000`);
const e2 = await trySit(mailS, 2);
check(e2.some((e) => e.code === "guest_approval_pending"), "tier 2 queued for operator approval", P(e2[0]?.code));
check(approvalRows(mailS.user_id) === 1, "tier 2 wrote exactly one approval row");
const storedEmail = sql(`SELECT email FROM poker_guest_approval WHERE user_id='${mailS.user_id}'`);
check(storedEmail === mailAddr, "tier 2 recorded the EMAIL on the approval row", storedEmail || "(blank)");

const q = await rpc(hostS, "guest_approvals_pending", { club_id: clubId });
const queued = (q.pending ?? []).find((r) => r.user_id === mailS.user_id);
check(!!queued, "tier 2 appears in the operator queue");
check(queued?.email === mailAddr, "operator sees the email in the queue", queued?.email || "(blank)");

await rpc(hostS, "guest_approval_decide", { club_id: clubId, match_id: "table-100", user_id: mailS.user_id, approve: true });
const e2b = await trySit(mailS, 2);
check(!e2b.some((e) => e.code === "guest_approval_pending"), "tier 2 seats after approval", P(e2b.map((e) => e.code)));

// ── TIER 3: club member — no coded-guest gate at all ─────────────────────────
console.log("\n── tier 3: club member ──");
const memberS = await client.authenticateEmail(`member_${stamp}@t.local`, "Passw0rd!123", true);
sql(`INSERT INTO poker_global_wallet (user_id,balance) VALUES ('${memberS.user_id}',5000000) ON CONFLICT (user_id) DO UPDATE SET balance=5000000`);
sql(`INSERT INTO poker_club_member (club_id,user_id,username,role,status,joined_at) VALUES ('${clubId}','${memberS.user_id}','member${stamp}','member','active',NOW()) ON CONFLICT DO NOTHING`);
const e3 = await trySit(memberS, 3);
check(!e3.some((e) => e.code === "guest_identity_required" || e.code === "guest_approval_pending"),
  "tier 3 bypasses the coded-guest gate entirely", P(e3.map((e) => e.code)));
check(approvalRows(memberS.user_id) === 0, "tier 3 wrote NO approval row");

// ── auto-approve non-members: skips the queue, NEVER skips tier 1 ────────────
console.log("\n── auto_approve_non_members table ──");
const autoTable = await rpc(hostS, "table_create", {
  club_id: clubId, small_blind: 100, big_blind: 200, max_seats: 6,
  access_type: "invite", join_code: "AUTO99", allow_spectators: true,
  stake_mode: "play", trust_code_guests: false, auto_approve_non_members: true,
  non_member_loan_cents: 200000, // $2,000 club credit per stranger
});
const autoMatch = autoTable?.match_id ?? autoTable?.table?.match_id;

async function trySitAt(session, matchId, code, seat) {
  const sock = client.createSocket(false, false);
  const errs = [];
  sock.onmatchdata = (md) => {
    if (md.op_code !== OP_ERROR) return;
    try { errs.push(JSON.parse(new TextDecoder().decode(md.data))); } catch { /* ignore */ }
  };
  await sock.connect(session, true);
  await sock.joinMatch(matchId, undefined, { join_code: code });
  await sock.sendMatchState(matchId, OP_SIT, JSON.stringify({ seat, buy_in_cents: 100000 }));
  await new Promise((r) => setTimeout(r, 4000));
  return errs;
}

// An identified non-member sits with no operator decision.
const auto1 = await client.authenticateEmail(`auto_${stamp}@t.local`, "Passw0rd!123", true);
const eA = await trySitAt(auto1, autoMatch, "AUTO99", 1);
check(!eA.some((e) => e.code === "guest_approval_pending"),
  "auto-approve: identified non-member is NOT queued", P(eA.map((e) => e.code)));
// Still recorded, decided by "system" — the audit trail must never have a hole.
const decidedBy = sql(`SELECT decided_by FROM poker_guest_approval WHERE user_id='${auto1.user_id}'`);
check(decidedBy === "system", "auto-approve still WRITES the approval, decided by system", decidedBy || "(none)");

// Tier 1 is untouched: no identity is still refused, even here.
const anon2 = await client.authenticateDevice(`anon2_${stamp}`, true);
const eB = await trySitAt(anon2, autoMatch, "AUTO99", 2);
check(eB.some((e) => e.code === "guest_identity_required"),
  "auto-approve does NOT relax tier 1", P(eB[0]?.code));

// The LOAN itself: a stranger holds no club balance, so without this the seat
// dies with buy_in_failed the instant after they are approved.
check(!eA.some((e) => e.code === "buy_in_failed"),
  "auto-approve LOAN lets the non-member actually sit", P(eA.map((e) => e.code)));
const bal = sql(`SELECT balance, locked_amount FROM poker_player_balance WHERE club_id='${clubId}' AND user_id='${auto1.user_id}'`);
check(bal !== "", "club credit was allocated to the stranger", bal || "(no row)");
check(Number(sql(`SELECT count(*) FROM poker_guest_approval WHERE user_id='${anon2.user_id}'`)) === 0,
  "tier 1 still writes NO approval row on an auto-approve table");

console.log(`\n=== ${fails.length ? `${fails.length} FAILURE(S): ${fails.join(", ")}` : "ALL TIERS PASS"} ===`);
process.exit(fails.length ? 2 : 0);
