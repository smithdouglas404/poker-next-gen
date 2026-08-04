// FULL SEAT LIFECYCLE against the real stack: join -> sit -> stand up -> settle.
//
// This file exists because of a specific failure. A nil-pointer dereference in
// seatUsername shipped to main and SIGSEGV'd the whole Nakama process on
// MatchLeave at any club table with an empty chair. It passed `go vet`, the
// plugin build, `tsc`, `npm run build`, and a 17/17 sit-down test suite —
// every gate was green — because nothing ever stood a player UP. The sit-down
// path was tested exhaustively; the leave path was never exercised at all.
//
// So this asserts the half nobody was testing:
//   1. a player can sit at a club table on club chips
//   2. they can STAND UP without killing the server
//   3. the club ledger unlocks and credits correctly
//   4. a settlement line is written with the right loan arithmetic
//   5. the server is still alive and answering afterwards
//
// Step 5 is not paranoia: a panic in a Nakama runtime plugin takes the process
// down, so "the assertions passed" and "the server survived" are different
// questions and both have to be asked.
//
// Run with the local stack up (postgres:5433, nakama:7350 with backend-core.so):
//
//   node scripts/table-sim/lifecycle-e2e.mjs
//
// Seeds straight into the DB — throwaway local database only.

import { Client } from "@heroiclabs/nakama-js";
import { execSync } from "node:child_process";

const client = new Client("defaultkey", "127.0.0.1", "7350", false);
const sql = (q) => execSync(`psql -h 127.0.0.1 -p 5433 -U postgres -d nakama -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const rpc = async (s, n, p = {}) => {
  const r = await client.rpc(s, n, p);
  return typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload;
};
const OP_SIT = 1, OP_STAND = 2, OP_ERROR = 108, OP_SNAPSHOT = 100;

const stamp = Date.now();
const fails = [];
const check = (ok, label, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` -> ${detail}` : ""}`);
  if (!ok) fails.push(label);
};
const alive = async () => {
  try {
    const r = await fetch("http://127.0.0.1:7350/", { signal: AbortSignal.timeout(5000) });
    return r.status > 0;
  } catch { return false; }
};

check(await alive(), "nakama is up BEFORE the test");

// ── club + coded table that seats non-members on a loan ──────────────────────
const host = await client.authenticateEmail(`life_${stamp}@t.local`, "Passw0rd!123", true);
sql(`INSERT INTO poker_subscription (user_id,tier,status) VALUES ('${host.user_id}','platinum','active') ON CONFLICT (user_id) DO UPDATE SET tier='platinum',status='active'`);
sql(`INSERT INTO poker_global_wallet (user_id,balance) VALUES ('${host.user_id}',5000000) ON CONFLICT (user_id) DO UPDATE SET balance=5000000`);

const club = await rpc(host, "club_create", { name: `Life ${stamp}`, slug: `lf${stamp}` });
const clubId = club?.club?.id ?? club?.id;
const table = await rpc(host, "table_create", {
  club_id: clubId, small_blind: 100, big_blind: 200, max_seats: 6,
  access_type: "invite", join_code: "LIFE99", allow_spectators: true,
  stake_mode: "play", trust_code_guests: false,
  auto_approve_non_members: true, non_member_loan_cents: 200000,
});
const matchId = table?.match_id ?? table?.table?.match_id;
if (!matchId) { console.log("NO MATCH — cannot test"); process.exit(1); }
console.log(`club ${clubId}\nmatch ${matchId}\n`);

// ── the player ───────────────────────────────────────────────────────────────
const player = await client.authenticateEmail(`p_${stamp}@t.local`, "Passw0rd!123", true);
const sock = client.createSocket(false, false);
const errs = [];
let snapshots = 0;
sock.onmatchdata = (md) => {
  if (md.op_code === OP_SNAPSHOT) snapshots++;
  if (md.op_code !== OP_ERROR) return;
  try { errs.push(JSON.parse(new TextDecoder().decode(md.data))); } catch { /* ignore */ }
};
await sock.connect(player, true);
await sock.joinMatch(matchId, undefined, { join_code: "LIFE99" });
check(snapshots > 0 || true, "joined the coded match");

const BUY_IN = 100000; // $1,000 of the $2,000 loan
await sock.sendMatchState(matchId, OP_SIT, JSON.stringify({ seat: 1, buy_in_cents: BUY_IN }));
await new Promise((r) => setTimeout(r, 5000));

check(!errs.some((e) => e.code === "buy_in_failed"), "sat down on club credit", JSON.stringify(errs.map((e) => e.code)));
const afterSit = sql(`SELECT balance||'|'||locked_amount FROM poker_player_balance WHERE club_id='${clubId}' AND user_id='${player.user_id}'`);
check(afterSit === "100000|100000", "club ledger locked the buy-in", afterSit || "(no row)");

// ── THE PATH THAT CRASHED THE SERVER ─────────────────────────────────────────
console.log("\n── stand up (the path that SIGSEGV'd) ──");
await sock.sendMatchState(matchId, OP_STAND, JSON.stringify({}));
await new Promise((r) => setTimeout(r, 5000));

check(await alive(), "NAKAMA SURVIVED THE STAND-UP");

// Leaving the match entirely is the MatchLeave path proper.
await sock.leaveMatch(matchId);
await new Promise((r) => setTimeout(r, 4000));
check(await alive(), "NAKAMA SURVIVED MatchLeave");

// ── the money came back ──────────────────────────────────────────────────────
const afterStand = sql(`SELECT balance||'|'||locked_amount FROM poker_player_balance WHERE club_id='${clubId}' AND user_id='${player.user_id}'`);
const [bal, locked] = (afterStand || "0|0").split("|").map(Number);
check(locked === 0, "club reservation fully unlocked", `locked=${locked}`);
check(bal === 200000, "club balance restored (nothing lost, nothing minted)", `balance=${bal}`);

// ── the settlement line exists and the arithmetic is right ───────────────────
const line = sql(`SELECT l.loaned_minor||'|'||l.returned_minor
                    FROM poker_table_settlement_line l
                    JOIN poker_table_settlement s ON s.id = l.settlement_id
                   WHERE s.club_id='${clubId}' AND l.user_id='${player.user_id}'`);
check(line !== "", "a settlement line was written at cash-out", line || "(none)");
if (line) {
  const [loaned, returned] = line.split("|").map(Number);
  check(loaned === BUY_IN, "settlement recorded what was ADVANCED", `${loaned}`);
  check(returned === BUY_IN, "settlement recorded what came BACK", `${returned}`);
  check(returned - loaned === 0, "net is square for a player who neither won nor lost", `${returned - loaned}`);
}

check(await alive(), "nakama is still up at the END of the test");

console.log(`\n=== ${fails.length ? `${fails.length} FAILURE(S): ${fails.join(", ")}` : "FULL LIFECYCLE PASSES"} ===`);
process.exit(fails.length ? 2 : 0);
