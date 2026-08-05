// SIDE POTS: a short stack all-in, over-bet by two deeper players.
//
// WHY THIS EXISTS
//
// handplay-e2e.mjs plays a hand where everyone calls, so every player
// contributes the same amount and NO side pot is ever created. Side-pot
// arithmetic — the part that decides who is eligible for which chips when
// someone is all-in for less — was still exercised by nothing that runs the
// real server. It is also the classic place for money bugs: a short stack
// scooping chips they were never eligible for, or the uncontested excess
// vanishing instead of returning to the player who put it in.
//
// The protocol does not expose the pot BREAKDOWN — TableSnapshot carries a
// single `pot` — so this asserts the property that side pots exist to enforce,
// which IS visible from the client:
//
//   AN ALL-IN PLAYER CAN WIN AT MOST THEIR OWN CONTRIBUTION FROM EACH OPPONENT.
//
// Short stack all-in for X against N opponents can take home at most X*(N+1).
// If the side pot is mis-built they end up with more than that. Combined with
// chip conservation across the table, that pins both directions: nothing
// created, and nothing awarded to someone ineligible.
//
//   node scripts/table-sim/sidepot-e2e.mjs
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

const SHORT = 4000;   // the all-in stack — deliberately tiny
const DEEP = 200000;  // the two stacks that will bet past it

const host = await client.authenticateEmail(`sp_${stamp}@t.local`, "Passw0rd!123", true);
sql(`INSERT INTO poker_subscription (user_id,tier,status) VALUES ('${host.user_id}','platinum','active') ON CONFLICT (user_id) DO UPDATE SET tier='platinum',status='active'`);
sql(`INSERT INTO poker_global_wallet (user_id,balance) VALUES ('${host.user_id}',5000000) ON CONFLICT (user_id) DO UPDATE SET balance=5000000`);
const club = await rpc(host, "club_create", { name: `Side ${stamp}`, slug: `sp${stamp}` });
const clubId = club?.club?.id ?? club?.id;
const table = await rpc(host, "table_create", {
  club_id: clubId, small_blind: 100, big_blind: 200, max_seats: 6,
  access_type: "invite", join_code: "SIDE99", allow_spectators: true, stake_mode: "play",
  // min_buy_in must allow the short stack, or SitDown clamps it up to the floor
  // and no all-in-for-less can happen at all.
  min_buy_in: SHORT, max_buy_in: DEEP,
  auto_approve_non_members: true, non_member_loan_cents: 1000000,
});
const matchId = table?.match_id ?? table?.table?.match_id;
if (!matchId) { console.log("NO MATCH — cannot test"); process.exit(1); }
console.log(`match ${matchId}\n`);

async function seat(session, seatIdx, buyIn, policy) {
  const sock = client.createSocket(false, false);
  const st = { snapshots: [], errors: [], acted: 0, lastSnapshot: null };
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
    st.acted++;
    await sock.sendMatchState(matchId, OP_ACTION, JSON.stringify(policy(req)));
  };
  await sock.connect(session, true);
  await sock.joinMatch(matchId, undefined, { join_code: "SIDE99" });
  await sock.sendMatchState(matchId, OP_SIT, JSON.stringify({ seat: seatIdx, buy_in: buyIn }));
  return { sock, st };
}

// The short stack shoves at the first opportunity.
const shove = (req) => {
  const v = req.valid_actions ?? [];
  if (v.includes("all_in")) return { type: "all_in", amount: req.max_raise ?? 0 };
  if (v.includes("call")) return { type: "call", amount: req.to_call ?? 0 };
  return { type: "check", amount: 0 };
};
// One deep stack raises so the betting goes PAST the short stack's all-in —
// that surplus is what has to become a side pot the short stack cannot touch.
const raiser = (req) => {
  const v = req.valid_actions ?? [];
  if (v.includes("raise") && (req.min_raise ?? 0) > 0) {
    const amt = Math.min(req.min_raise * 4, req.max_raise ?? req.min_raise);
    return { type: "raise", amount: amt };
  }
  if (v.includes("call")) return { type: "call", amount: req.to_call ?? 0 };
  return { type: "check", amount: 0 };
};
// The other deep stack just pays it off, so the side pot is genuinely contested.
const caller = (req) => {
  const v = req.valid_actions ?? [];
  if (v.includes("call")) return { type: "call", amount: req.to_call ?? 0 };
  if (v.includes("check")) return { type: "check", amount: 0 };
  return { type: "fold", amount: 0 };
};

const sA = await client.authenticateEmail(`spa_${stamp}@t.local`, "Passw0rd!123", true);
const sB = await client.authenticateEmail(`spb_${stamp}@t.local`, "Passw0rd!123", true);
const sC = await client.authenticateEmail(`spc_${stamp}@t.local`, "Passw0rd!123", true);
const A = await seat(sA, 0, DEEP, raiser);
await sleep(1200);
const B = await seat(sB, 1, DEEP, caller);
await sleep(1200);
const C = await seat(sC, 2, SHORT, shove);   // the short stack

const deadline = Date.now() + 90_000;
const handNos = new Set();
let sawAllIn = false;
while (Date.now() < deadline) {
  await sleep(1000);
  for (const s of [...A.st.snapshots, ...B.st.snapshots, ...C.st.snapshots]) {
    if (typeof s.hand_no === "number" && s.hand_no > 0) handNos.add(s.hand_no);
    if ((s.seats ?? []).some((x) => (x.status ?? "") === "all_in")) sawAllIn = true;
  }
  if (handNos.size >= 2 && sawAllIn) break;
}

const all = [...A.st.snapshots, ...B.st.snapshots, ...C.st.snapshots];
const last = C.st.lastSnapshot ?? B.st.lastSnapshot ?? A.st.lastSnapshot;
const seated = (s) => (s?.seats ?? []).filter((x) => (x.status ?? "") !== "" && (x.status ?? "") !== "empty");
const totalChips = (s) => seated(s).reduce((n, x) => n + (x.stack ?? 0), 0) + (s?.pot ?? 0);

check(all.length > 0, "the server sent snapshots", `${all.length}`);
check(seated(last).length === 3, "three players seated", `${seated(last).length}`);
check(sawAllIn, "the short stack went ALL-IN (side pot condition reached)");
check(handNos.size >= 2, "a contested hand COMPLETED",
  `hands seen: ${[...handNos].sort((x, y) => x - y).join(",")}`);

// ── the side-pot property ───────────────────────────────────────────────────
//
// C committed at most SHORT. Against two opponents they can take home at most
// SHORT*3 — their own chips back plus SHORT from each. Anything above that means
// they were paid out of a side pot they were never eligible for.
const cSeat = seated(last).find((x) => x.user_id === sC.user_id);
const cap = SHORT * 3;
check(!!cSeat, "found the short stack's seat", cSeat ? `stack ${cSeat.stack}` : "(missing)");
if (cSeat) {
  check(cSeat.stack <= cap,
    "ALL-IN PLAYER CANNOT WIN MORE THAN THE MAIN POT",
    `stack ${cSeat.stack} <= cap ${cap}`);

  // BE HONEST ABOUT WHAT THAT ACTUALLY PROVED.
  //
  // The ceiling only bites when the short stack WINS. If they busted, their
  // stack is 0 and `0 <= 12000` is trivially true — the assertion passed
  // without ever testing the thing it exists to test. Cards decide that, so
  // this run may or may not have exercised it, and a suite that cannot tell
  // you which is a suite that overstates its own coverage.
  //
  // Reported, never silently counted as proof.
  const everWonSomething = all.some((s) => {
    const c = seated(s).find((x) => x.user_id === sC.user_id);
    return c && (c.stack ?? 0) > SHORT;
  });
  console.log(everWonSomething
    ? `      (ceiling EXERCISED — the short stack was ahead of its ${SHORT} buy-in at some point)`
    : `      (ceiling NOT exercised this run — the short stack never got above its ${SHORT} buy-in, so the cap passed trivially. Cards decide; re-run to sample again.)`);
}

// ── conservation, with a short stack in the mix ─────────────────────────────
const firstFull = all.find((s) => seated(s).length === 3);
if (firstFull) {
  const before = totalChips(firstFull);
  const after = totalChips(last);
  check(before === after, "CHIPS CONSERVED with a side pot in play",
    `${before} -> ${after} (delta ${after - before})`);
} else {
  check(false, "CHIPS CONSERVED with a side pot in play", "never saw all three seated");
}

check(await alive(), "NAKAMA SURVIVED AN ALL-IN / SIDE-POT HAND");
check(!A.st.errors.length && !B.st.errors.length && !C.st.errors.length, "no server errors",
  JSON.stringify([...A.st.errors, ...B.st.errors, ...C.st.errors].map((e) => e.code)));

for (const p of [A, B, C]) await p.sock.leaveMatch(matchId).catch(() => {});
await sleep(3000);
check(await alive(), "NAKAMA SURVIVED THE TABLE EMPTYING");

console.log(`\n=== ${fails.length ? `${fails.length} FAILURE(S): ${fails.join(", ")}` : "SIDE POTS HOLD"} ===`);
process.exit(fails.length ? 2 : 0);
