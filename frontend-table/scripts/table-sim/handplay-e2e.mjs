// PLAY A REAL HAND end to end: blinds -> betting -> streets -> showdown -> pot.
//
// WHY THIS EXISTS
//
// lifecycle-e2e.mjs closed the seat gap (join/sit/stand/settle) after a nil
// deref on MatchLeave SIGSEGV'd the whole server. But it never plays a hand, so
// the entire betting engine — blinds, action order, street progression, the
// showdown, awarding the pot, side pots — was still unexercised by anything
// that runs the actual server. A crash or a mis-awarded pot in there would
// reach main exactly the way the last one did.
//
// This drives two real websocket clients through a full hand and asserts on
// server-authoritative snapshots only. It never asserts on numbers it computed
// itself — the point is to catch the server being wrong, so believing the
// client's arithmetic would defeat it.
//
// What it proves:
//   1. a hand actually starts once two players are seated
//   2. blinds are posted and the pot reflects them
//   3. action alternates and the server nominates whose turn it is
//   4. the board grows flop -> turn -> river as streets complete
//   5. a hand REACHES SHOWDOWN and the pot is awarded to somebody
//   6. no chips are created or destroyed across the whole hand
//   7. the server is still alive afterwards
//
// (6) is the one worth having: chip conservation catches a whole class of
// side-pot and rake bugs that no unit test on a single function would.
//
//   node scripts/table-sim/handplay-e2e.mjs
//
// Needs the local stack (npm run stack:up). Throwaway local database only.

import { Client } from "@heroiclabs/nakama-js";
import { execSync } from "node:child_process";

const client = new Client("defaultkey", "127.0.0.1", "7350", false);
const sql = (q) => execSync(`psql -h 127.0.0.1 -p 5433 -U postgres -d nakama -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const rpc = async (s, n, p = {}) => {
  const r = await client.rpc(s, n, p);
  return typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload;
};
const OP_SIT = 1, OP_ACTION = 3, OP_SNAPSHOT = 100, OP_ACTION_REQUIRED = 105, OP_ERROR = 108;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const stamp = Date.now();
const fails = [];
const check = (ok, label, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` -> ${detail}` : ""}`);
  if (!ok) fails.push(label);
};
const alive = async () => {
  try { const r = await fetch("http://127.0.0.1:7350/", { signal: AbortSignal.timeout(4000) }); return r.status > 0; }
  catch { return false; }
};

// ── a play-money club table, two seats ──────────────────────────────────────
const host = await client.authenticateEmail(`hp_${stamp}@t.local`, "Passw0rd!123", true);
sql(`INSERT INTO poker_subscription (user_id,tier,status) VALUES ('${host.user_id}','platinum','active') ON CONFLICT (user_id) DO UPDATE SET tier='platinum',status='active'`);
sql(`INSERT INTO poker_global_wallet (user_id,balance) VALUES ('${host.user_id}',5000000) ON CONFLICT (user_id) DO UPDATE SET balance=5000000`);
const club = await rpc(host, "club_create", { name: `Hand ${stamp}`, slug: `hp${stamp}` });
const clubId = club?.club?.id ?? club?.id;
const table = await rpc(host, "table_create", {
  club_id: clubId, small_blind: 100, big_blind: 200, max_seats: 6,
  access_type: "invite", join_code: "HAND99", allow_spectators: true,
  stake_mode: "play", auto_approve_non_members: true, non_member_loan_cents: 500000,
});
const matchId = table?.match_id ?? table?.table?.match_id;
if (!matchId) { console.log("NO MATCH — cannot test"); process.exit(1); }
console.log(`match ${matchId}\n`);

/** One seated websocket player that answers when the server asks it to act. */
async function seat(session, seatIdx, label, policy) {
  const sock = client.createSocket(false, false);
  const st = { label, seatIdx, snapshots: [], errors: [], acted: 0, lastSnapshot: null };
  sock.onmatchdata = async (md) => {
    const text = new TextDecoder().decode(md.data);
    if (md.op_code === OP_SNAPSHOT) {
      try { st.lastSnapshot = JSON.parse(text); st.snapshots.push(st.lastSnapshot); } catch { /* ignore */ }
      return;
    }
    if (md.op_code === OP_ERROR) { try { st.errors.push(JSON.parse(text)); } catch { /* ignore */ } return; }
    if (md.op_code !== OP_ACTION_REQUIRED) return;
    let req; try { req = JSON.parse(text); } catch { return; }
    if (req.seat !== seatIdx) return;
    const move = policy(req);
    st.acted++;
    await sock.sendMatchState(matchId, OP_ACTION, JSON.stringify(move));
  };
  await sock.connect(session, true);
  await sock.joinMatch(matchId, undefined, { join_code: "HAND99" });
  // The wire field is `buy_in` (protocol.SitDownRequest). Sending
  // `buy_in_cents` silently takes the table default — which is exactly why the
  // chip-conservation assertion below derives the expected total from the first
  // snapshot instead of trusting a number this file asked for.
  await sock.sendMatchState(matchId, OP_SIT, JSON.stringify({ seat: seatIdx, buy_in: 200000 }));
  return { sock, st };
}

// Both players just call/check to the river — the shortest path that still
// crosses every street and reaches a real showdown.
const passive = (req) => {
  const valid = req.valid_actions ?? [];
  if (valid.includes("check")) return { type: "check", amount: 0 };
  if (valid.includes("call")) return { type: "call", amount: req.to_call ?? 0 };
  return { type: "fold", amount: 0 };
};

const pA = await client.authenticateEmail(`a_${stamp}@t.local`, "Passw0rd!123", true);
const pB = await client.authenticateEmail(`b_${stamp}@t.local`, "Passw0rd!123", true);
const a = await seat(pA, 0, "A", passive);
await sleep(1500);
const b = await seat(pB, 1, "B", passive);

// Let the hand run. Polling a condition, never a blind sleep.
const deadline = Date.now() + 75_000;
let sawFlop = false, sawTurn = false, sawRiver = false, sawShowdown = false;
const handNos = new Set();
while (Date.now() < deadline) {
  await sleep(1000);
  for (const s of [...a.st.snapshots, ...b.st.snapshots]) {
    const n = (s.board ?? []).length;
    if (n >= 3) sawFlop = true;
    if (n >= 4) sawTurn = true;
    if (n >= 5) sawRiver = true;
    if ((s.phase ?? "") === "showdown") sawShowdown = true;
    if (typeof s.hand_no === "number" && s.hand_no > 0) handNos.add(s.hand_no);
  }
  // Two distinct hand numbers means one hand ran to completion and the next
  // began — a stronger signal than catching the showdown instant, which the
  // table can pass through between broadcasts on an auto-dealing table.
  if (handNos.size >= 2 && sawRiver) break;
}

const last = b.st.lastSnapshot ?? a.st.lastSnapshot;
const all = [...a.st.snapshots, ...b.st.snapshots];

check(all.length > 0, "the server sent table snapshots", `${all.length}`);
check(all.some((s) => (s.phase ?? "") !== "waiting"), "a hand STARTED once two players were seated",
  last?.phase ?? "(none)");
check(a.st.acted + b.st.acted > 0, "the server asked players to act", `${a.st.acted + b.st.acted} actions sent`);
check(all.some((s) => (s.pot ?? 0) > 0), "blinds went into the pot",
  `max pot seen ${Math.max(0, ...all.map((s) => s.pot ?? 0))}`);
check(sawFlop, "board reached the FLOP");
check(sawTurn, "board reached the TURN");
check(sawRiver, "board reached the RIVER");
// A hand RAN TO COMPLETION. On an auto-dealing table the showdown can pass
// between broadcasts, so the durable proof is the hand counter advancing;
// sawShowdown is reported alongside as the softer signal.
check(handNos.size >= 2, "a hand COMPLETED and the next was dealt",
  `hand numbers seen: ${[...handNos].sort((x, y) => x - y).join(",")}${sawShowdown ? " (showdown observed)" : ""}`);

// ── chip conservation: the assertion worth having ───────────────────────────
//
// Chips on the table must be MOVED between stacks, never created or destroyed.
// This catches side-pot and award bugs that no unit test on a single function
// would.
//
// The baseline is measured from the first snapshot where both players are
// seated — deliberately NOT a number this file asked for. The first version
// asserted against the buy-in it had requested and failed at 200000 vs 400000,
// because the request used the wrong field name and every player silently took
// the table default. The test was wrong and the server was right; measuring the
// baseline instead of assuming it removes that whole class of false alarm.
const seated = (s) => (s?.seats ?? []).filter((x) => (x.status ?? "") !== "" && (x.status ?? "") !== "empty");
const totalChips = (s) => seated(s).reduce((n, x) => n + (x.stack ?? 0), 0) + (s?.pot ?? 0);

const firstFull = all.find((s) => seated(s).length === 2);
const seatsNow = seated(last);
check(seatsNow.length === 2, "both players are still seated", `${seatsNow.length}`);
if (firstFull) {
  const before = totalChips(firstFull);
  const after = totalChips(last);
  // Exact conservation: this is a play-money table with no rake configured, so
  // any drift at all is chips appearing or vanishing.
  check(before === after, "CHIPS CONSERVED across the hand",
    `${before} -> ${after} (delta ${after - before})`);
} else {
  check(false, "CHIPS CONSERVED across the hand", "never saw both players seated");
}
// Somebody actually won: the stacks must have moved apart from a level start.
check(new Set(seatsNow.map((s) => s.stack)).size > 1,
  "the pot was awarded (stacks diverged)", seatsNow.map((s) => s.stack).join(" / "));

check(await alive(), "NAKAMA SURVIVED A FULL HAND");
check(!a.st.errors.length && !b.st.errors.length, "no server errors during the hand",
  JSON.stringify([...a.st.errors, ...b.st.errors].map((e) => e.code)));

await a.sock.leaveMatch(matchId).catch(() => {});
await b.sock.leaveMatch(matchId).catch(() => {});
await sleep(3000);
check(await alive(), "NAKAMA SURVIVED BOTH PLAYERS LEAVING MID-SESSION");

console.log(`\n=== ${fails.length ? `${fails.length} FAILURE(S): ${fails.join(", ")}` : "FULL HAND PLAYS"} ===`);
process.exit(fails.length ? 2 : 0);
