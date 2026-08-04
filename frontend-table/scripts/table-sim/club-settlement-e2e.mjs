// End-to-end proof of the CLUB-CHIP LOAN settlement, against the real stack.
//
// The owner's model, in their words: "The initial Club Wallet is a loan to the
// player vs the global wallet is real cash they have and not a loan. When a club
// game needs to settle, the difference between what is loaned and won and lost
// must be reconciled back to the loan amount, and then the club owner must click
// something to show all books are balanced."
//
// Worked example they gave, which this file asserts numerically:
//
//   club wallet 2,000 -> player takes 1,000 to the table -> ends the session
//   holding 200 -> at settlement they OWE 800 to bring the club back whole.
//   Ends holding 1,800 instead -> the CLUB OWES THEM 800.
//
// Run after standing the local stack up (postgres:5433, engine-math:8080,
// nakama:7350 with backend-core.so loaded):
//
//   node scripts/table-sim/club-settlement-e2e.mjs
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
const money = (c) => `$${(c / 100).toFixed(2)}`;

const stamp = Date.now();
const fails = [];
const check = (ok, label, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` -> ${detail}` : ""}`);
  if (!ok) fails.push(label);
};

const hostS = await client.authenticateEmail(`owner_${stamp}@t.local`, "Passw0rd!123", true);
sql(`INSERT INTO poker_subscription (user_id,tier,status) VALUES ('${hostS.user_id}','platinum','active') ON CONFLICT (user_id) DO UPDATE SET tier='platinum', status='active'`);
sql(`INSERT INTO poker_global_wallet (user_id,balance) VALUES ('${hostS.user_id}',5000000) ON CONFLICT (user_id) DO UPDATE SET balance=5000000`);

const club = await rpc(hostS, "club_create", { name: `Settle ${stamp}`, slug: `st${stamp}` });
const clubId = club?.club?.id ?? club?.id;
const MATCH = `settle-${stamp}`;
console.log(`club  ${clubId}\nmatch ${MATCH}\n`);

// Two players, each ADVANCED 1,000 club chips out of a 2,000 club wallet.
// One ends holding 200 (down 800), one ends holding 1,800 (up 800) — the losing
// player's chips are exactly the winning player's, which is what makes the two
// sides of the settlement equal.
const loser = await client.authenticateEmail(`loser_${stamp}@t.local`, "Passw0rd!123", true);
const winner = await client.authenticateEmail(`winner_${stamp}@t.local`, "Passw0rd!123", true);

const LOAN = 100000;      // 1,000.00 advanced to each
const LOSER_OUT = 20000;  //   200.00 carried off  -> owes 800
const WINNER_OUT = 180000;//  1,800.00 carried off -> owed 800

// RecordSeat is called by the match handler at cash-out. Drive the same store
// path directly through SQL the way the handler would, so this test measures
// the settlement arithmetic and the RPCs rather than re-running a whole hand.
const stlId = `stl_${stamp}`;
sql(`INSERT INTO poker_table_settlement (id, club_id, match_id, status) VALUES ('${stlId}','${clubId}','${MATCH}','open')`);
sql(`INSERT INTO poker_table_settlement_line (id, settlement_id, user_id, username, is_member, loaned_minor, returned_minor)
     VALUES ('l1_${stamp}','${stlId}','${loser.user_id}','Loser',true,${LOAN},${LOSER_OUT})`);
sql(`INSERT INTO poker_table_settlement_line (id, settlement_id, user_id, username, is_member, loaned_minor, returned_minor)
     VALUES ('l2_${stamp}','${stlId}','${winner.user_id}','Winner',true,${LOAN},${WINNER_OUT})`);

// ── the who-pays-whom list ───────────────────────────────────────────────────
console.log("── settlement report ──");
const got = await rpc(hostS, "table_settlement_get", { club_id: clubId, match_id: MATCH });
const st = got.settlement;
check(!!st, "settlement returned for the table");

const lineFor = (uid) => (st?.lines ?? []).find((l) => l.user_id === uid);
const lLine = lineFor(loser.user_id);
const wLine = lineFor(winner.user_id);

for (const l of st?.lines ?? []) {
  const net = l.net_minor;
  console.log(`   ${l.username.padEnd(8)} loaned ${money(l.loaned_minor)}  back ${money(l.returned_minor)}  ` +
    (net < 0 ? `OWES THE CLUB ${money(-net)}` : `CLUB OWES ${money(net)}`));
}

// The owner's exact numbers.
check(lLine?.net_minor === -80000, "player down 800 OWES the club 800", money(-(lLine?.net_minor ?? 0)));
check(wLine?.net_minor === 80000, "player up 800 is OWED 800 by the club", money(wLine?.net_minor ?? 0));
check(st?.total_owed_to_club === 80000, "total owed TO the club", money(st?.total_owed_to_club ?? 0));
check(st?.total_owed_to_players === 80000, "total owed TO players", money(st?.total_owed_to_players ?? 0));
// In a closed table the two sides match; a gap means chips leaked and the
// operator must see it rather than a single netted figure that hides it.
check(st?.total_owed_to_club === st?.total_owed_to_players, "books balance: both sides equal");
check(st?.status === "open", "books start UNCONFIRMED", st?.status);

// ── the owner's sign-off ─────────────────────────────────────────────────────
console.log("\n── owner confirms ──");
const open1 = await rpc(hostS, "table_settlement_list", { club_id: clubId });
check(open1.count === 1, "appears in the owner's open queue", `count=${open1.count}`);

const conf = await rpc(hostS, "table_settlement_confirm", { club_id: clubId, match_id: MATCH });
check(conf.settlement?.status === "confirmed", "owner confirms the books", conf.settlement?.status);
check(conf.settlement?.confirmed_by === hostS.user_id, "sign-off records WHO confirmed");

const open2 = await rpc(hostS, "table_settlement_list", { club_id: clubId });
check(open2.count === 0, "leaves the open queue once confirmed", `count=${open2.count}`);

// A second click must conflict, never silently re-stamp.
let conflicted = false;
try { await rpc(hostS, "table_settlement_confirm", { club_id: clubId, match_id: MATCH }); }
catch { conflicted = true; }
check(conflicted, "a SECOND confirmation is refused, not silently reapplied");

console.log(`\n=== ${fails.length ? `${fails.length} FAILURE(S): ${fails.join(", ")}` : "SETTLEMENT ARITHMETIC AND SIGN-OFF ALL PASS"} ===`);
process.exit(fails.length ? 2 : 0);
