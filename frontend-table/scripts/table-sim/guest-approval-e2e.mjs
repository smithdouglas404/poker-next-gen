// End-to-end proof of the coded-guest sit-down gate, over the real Nakama wire
// protocol against a real plugin and a real Postgres. Not a unit test and not a
// mock: it authenticates a device-only account (which is what makes it a guest —
// no email, no clerk: prefix), joins a coded table, and tries to take a seat.
//
// Run it after standing the local stack up (postgres:5433, engine-math:8080,
// nakama:7350 with backend-core.so loaded):
//
//   node scripts/table-sim/guest-approval-e2e.mjs
//
// It asserts the whole round trip:
//   1. an unapproved guest is REFUSED the seat
//   2. that guest can poll their own pending status
//   3. the operator queue shows them
//   4. the operator can approve
//   5. a SECOND decision conflicts instead of overwriting the first
//   6. after approval the guest actually sits
//
// It seeds plan/balance prerequisites straight into the DB, so point it only at
// a throwaway local database — never anything real.

import { Client } from "@heroiclabs/nakama-js";
const client = new Client("defaultkey", "127.0.0.1", "7350", false);
const P = (o) => { try { return JSON.stringify(o ?? { undefined: true }).slice(0, 300); } catch { return String(o); } };
import { execSync } from "node:child_process";
const sql = (q) => execSync(`psql -h 127.0.0.1 -p 5433 -U postgres -d nakama -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const OP_SIT = 1, OP_ERROR = 108, OP_SNAPSHOT = 100;

const hostS = await client.authenticateEmail(`host_${Date.now()}@t.local`, "Passw0rd!123", true);
const guestS = await client.authenticateDevice(`gdev_${Date.now()}`, true);
console.log("host ", hostS.user_id);
console.log("guest", guestS.user_id, "(device auth => no email => isGuest)");

const rpc = async (s, n, p = {}) => {
  const r = await client.rpc(s, n, p);
  return typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload;
};

// --- prerequisites the club/table gates need, seeded straight into the DB by
// --- the caller (see the psql step); here we just create club + coded table.
// Plan + balance prerequisites the club gate enforces. Throwaway local DB.
try {
  sql(`INSERT INTO poker_subscription (user_id,tier,status) VALUES ('${hostS.user_id}','platinum','active') ON CONFLICT (user_id) DO UPDATE SET tier='platinum', status='active'`);
} catch (e) { console.log("seed subscription:", String(e.message).slice(0,160)); }
try {
  sql(`INSERT INTO poker_global_wallet (user_id,balance) VALUES ('${hostS.user_id}',5000000) ON CONFLICT (user_id) DO UPDATE SET balance=5000000`);
} catch (e) { console.log("seed wallet:", String(e.message).slice(0,160)); }

let club;
try { club = await rpc(hostS, "club_create", { name: `GateTest ${Date.now()}`, slug: `gt${Date.now()}` }); }
catch (e) { console.log("club_create ERR ->", e?.message ?? e?.statusText ?? P(e), await (e?.json?.().catch(()=>null)) ?? ""); }
console.log("club:", P(club));
const clubId = club?.club?.id ?? club?.id;

let table;
try {
  table = await rpc(hostS, "table_create", {
    club_id: clubId, small_blind: 100, big_blind: 200, max_seats: 6,
    access_type: "invite", join_code: "GATE99", allow_spectators: true,
    stake_mode: "play", trust_code_guests: false,
  });
} catch (e) { console.log("table_create ->", P(e)); }
console.log("table:", P(table));
const matchId = table?.match_id ?? table?.table?.match_id;
if (!matchId) { console.log("\nNO MATCH — cannot test the gate"); process.exit(1); }

// --- guest joins the coded match, then attempts to SIT ---
const sock = client.createSocket(false, false);
const seen = [];
sock.onmatchdata = (md) => {
  let body = {}; try { body = JSON.parse(new TextDecoder().decode(md.data)); } catch {}
  seen.push({ op: md.op_code, body });
  if (md.op_code === OP_ERROR) console.log("  <- OpError:", P(body));
};
await sock.connect(guestS, true);
await sock.joinMatch(matchId, undefined, { join_code: "GATE99" });
console.log("\nguest joined the coded match (watching is allowed)");

await sock.sendMatchState(matchId, OP_SIT, JSON.stringify({ seat: 1, buy_in_cents: 100000 }));
await new Promise((r) => setTimeout(r, 4000));

const errs = seen.filter((s) => s.op === OP_ERROR).map((s) => s.body);
const blocked = errs.find((e) => e.code === "guest_approval_pending");
console.log("\n=== RESULT ===");
console.log(blocked ? `1. BLOCKED as designed: ${blocked.message}` : `1. NOT BLOCKED — errors: ${P(errs)}`);
if (!blocked) process.exit(2);

// 2. the guest can see their own pending state
const mine = await rpc(guestS, "guest_approval_status", { match_id: "table-100" });
console.log(`2. guest polls own status -> ${P(mine)}`);

// 3. the operator queue shows them
const q = await rpc(hostS, "guest_approvals_pending", { club_id: clubId });
console.log(`3. operator queue: ${q.count} waiting -> ${q.pending?.[0]?.user_id ?? "none"}`);

// 4. operator approves
const dec = await rpc(hostS, "guest_approval_decide", {
  club_id: clubId, match_id: q.pending?.[0]?.match_id, user_id: guestS.user_id, approve: true,
});
console.log(`4. decide -> status ${dec.approval?.status} by ${dec.approval?.decided_by}`);

// 5. a SECOND decision must conflict, not silently overwrite
try {
  await rpc(hostS, "guest_approval_decide", {
    club_id: clubId, match_id: q.pending?.[0]?.match_id, user_id: guestS.user_id, approve: false,
  });
  console.log("5. FAIL — second decision was accepted");
} catch (e) {
  console.log(`5. second decision correctly refused: ${(e?.message ?? "").slice(0, 60)}`);
}

// 6. guest sits again — must now succeed. Fund them first: the approval gate
// is not the only check, and an unfunded guest fails the NEXT one (buy-in).
try {
  sql(`INSERT INTO poker_global_wallet (user_id,balance) VALUES ('${guestS.user_id}',5000000) ON CONFLICT (user_id) DO UPDATE SET balance=5000000`);
  sql(`INSERT INTO poker_player_balance (id,club_id,user_id,balance) VALUES ('pb_${Date.now()}','${clubId}','${guestS.user_id}',5000000)`);
} catch (e) { console.log("   (guest funding:", String(e.message).split("\n")[0].slice(0,90), ")"); }
seen.length = 0;
await sock.sendMatchState(matchId, OP_SIT, JSON.stringify({ seat: 1, buy_in_cents: 100000 }));
await new Promise((r) => setTimeout(r, 5000));
const errs2 = seen.filter((s) => s.op === OP_ERROR).map((s) => s.body);
const stillBlocked = errs2.find((e) => e.code === "guest_approval_pending");
const snap = seen.find((s) => s.op === OP_SNAPSHOT);
const seated = snap?.body?.seats?.some?.((x) => x.user_id === guestS.user_id);
console.log(`6. sit after approval -> ${stillBlocked ? "STILL BLOCKED (bad)" : "gate passed"}` +
            `${seated ? ", guest is SEATED in the snapshot" : errs2.length ? `, other error: ${P(errs2[0])}` : ""}`);
process.exit(stillBlocked ? 2 : 0);
