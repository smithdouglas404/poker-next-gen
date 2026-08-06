// Proof that the Owner Hub's guest-approval nav badge is driven by real server
// state, and that it disappears when the queue empties.
//
// It belongs on /clubs and NOT on the Command Center: /hub is wrapped in
// RequireRole "platform_admin", so a club owner opening it gets NOT AUTHORIZED —
// and the club owner is the only person `guest_approvals_pending` will answer
// for (requireClubConfigurer). A badge there would have been invisible to
// everyone able to act on it. Measured, not assumed: the first version of this
// script screenshotted /hub as the club owner and photographed the refusal.
//
// Nothing here is faked. The sit-down gate has THREE tiers, and only the middle
// one queues: no identity at all is refused outright and deliberately writes no
// row, a club member goes through the normal KYC/wallet rules, and an
// EMAIL-VERIFIED NON-MEMBER arriving on a table code is the one who waits for an
// operator. So the waiting guest here authenticates by email and never joins the
// club — a device-auth account (what `guest-approval-e2e.mjs` uses) is tier 1
// and would never reach the queue. Then the club owner's own Nakama session is
// put in localStorage and /clubs is rendered.
//
// Run against the local stack (postgres:5433, engine-math:8080, nakama:7350)
// with `npm run dev` on :3000. Seeds prerequisites into the DB — throwaway
// local database only.
//
//   node scripts/table-sim/guest-approval-badge-shot.mjs
//
// Asserts:
//   1. with a guest waiting, the nav badge shows the SERVER's count, in gold
//   2. the badged row opens the Guest Approvals queue it is counting
//   3. approving clears the server queue AND the badge disappears entirely

import { Client } from "@heroiclabs/nakama-js";
import { execSync } from "node:child_process";
const pw = (await import("/opt/node22/lib/node_modules/playwright/index.js")).default;

const client = new Client("defaultkey", "127.0.0.1", "7350", false);
const sql = (q) =>
  execSync(`psql -h 127.0.0.1 -p 5433 -U postgres -d nakama -tAc "${q.replace(/"/g, '\\"')}"`)
    .toString()
    .trim();
const rpc = async (s, n, p = {}) => {
  const r = await client.rpc(s, n, p);
  return typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload;
};
const OP_SIT = 1;
const SHOTS = "/tmp/claude-0/-home-user-poker-next-gen/392cc787-6489-50fa-8651-c53dd904e186/scratchpad";

const fail = [];
const check = (ok, label, detail = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) fail.push(label);
};

// ---------------------------------------------------------------- server state
const host = await client.authenticateEmail(`badge_${Date.now()}@t.local`, "Passw0rd!123", true);
// Email-verified, non-member, arriving on a code = tier 2, the only tier that queues.
const guest = await client.authenticateEmail(`waiting_${Date.now()}@t.local`, "Passw0rd!123", true);
sql(
  `INSERT INTO poker_subscription (user_id,tier,status) VALUES ('${host.user_id}','platinum','active') ON CONFLICT (user_id) DO UPDATE SET tier='platinum', status='active'`,
);
sql(
  `INSERT INTO poker_global_wallet (user_id,balance) VALUES ('${host.user_id}',5000000) ON CONFLICT (user_id) DO UPDATE SET balance=5000000`,
);

const club = await rpc(host, "club_create", {
  name: `BadgeTest ${Date.now()}`,
  slug: `bt${Date.now()}`,
});
const clubId = club?.club?.id ?? club?.id;
const table = await rpc(host, "table_create", {
  club_id: clubId,
  small_blind: 100,
  big_blind: 200,
  max_seats: 6,
  access_type: "invite",
  join_code: "BADGE1",
  allow_spectators: true,
  stake_mode: "play",
  trust_code_guests: false,
});
const matchId = table?.match_id ?? table?.table?.match_id;
if (!matchId) {
  console.log("NO MATCH — cannot create a pending approval");
  process.exit(1);
}

const sock = client.createSocket(false, false);
// Surface the gate's refusal. Without this a wrong tier looks identical to a
// broken badge: both just report "0 pending".
sock.onmatchdata = (md) => {
  if (md.op_code !== 108) return;
  try {
    console.log("  <- OpError:", new TextDecoder().decode(md.data));
  } catch {
    /* ignore */
  }
};
await sock.connect(guest, true);
await sock.joinMatch(matchId, undefined, { join_code: "BADGE1" });
await sock.sendMatchState(matchId, OP_SIT, JSON.stringify({ seat: 1, buy_in: 100000 }));
await new Promise((r) => setTimeout(r, 4000));

// The count the badge must agree with comes from the server, not from this test.
const queue = await rpc(host, "guest_approvals_pending", { club_id: clubId });
console.log(`\nserver says ${queue.count} pending (club ${clubId})`);
check(queue.count === 1, "a sit attempt created exactly one pending approval", `count=${queue.count}`);

// ------------------------------------------------------------------- rendering
const b = await pw.chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  headless: true,
  args: [
    "--enable-unsafe-swiftshader",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--no-proxy-server",
  ],
});
const ctx = await b.newContext({ viewport: { width: 1500, height: 1100 }, deviceScaleFactor: 1 });
await ctx.addInitScript(
  ({ token, refresh, uid, uname }) => {
    try {
      localStorage.setItem("hrc.age.ok", "1");
      localStorage.setItem(
        "png-nakama-session",
        JSON.stringify({ token, refresh_token: refresh, user_id: uid, username: uname }),
      );
      localStorage.setItem("png-auth-method", "email");
    } catch {
      /* ignore */
    }
  },
  { token: host.token, refresh: host.refresh_token, uid: host.user_id, uname: host.username },
);

const p = await ctx.newPage();
await p.goto("http://localhost:3000/clubs", { waitUntil: "domcontentloaded", timeout: 180000 });
await p.waitForTimeout(20000);

// The badge rides the "Member Registry" nav row — GuestApprovals renders inside
// that section, so the count sits on the thing you have to click.
const readNav = () =>
  p.evaluate(() => {
    const row = [...document.querySelectorAll("button")].find((b) =>
      /Member Registry/i.test(b.textContent || ""),
    );
    if (!row) return null;
    const pill = row.querySelector("span[aria-label$='waiting']");
    const r = row.getBoundingClientRect();
    return {
      rowText: (row.textContent || "").replace(/\s+/g, " ").trim(),
      badgeText: pill ? (pill.textContent || "").trim() : null,
      badgeLabel: pill ? pill.getAttribute("aria-label") : null,
      badgeBg: pill ? getComputedStyle(pill).backgroundColor : null,
      rowVisible: r.width > 0 && r.height > 0,
    };
  });

const nav = await readNav();
console.log("\nnav:", JSON.stringify(nav));
await p.screenshot({ path: `${SHOTS}/badge-present.png` });

check(nav !== null && nav.rowVisible, "Member Registry row renders for the club owner");
check(nav !== null && nav.badgeText === String(queue.count), "badge shows the server's count", nav ? `badge=${nav.badgeText} server=${queue.count}` : "no row");
// Gold #f5c518, not brand red: a queue is attention, not danger (non-negotiable 5).
check(nav !== null && nav.badgeBg === "rgb(245, 197, 24)", "badge is gold, not brand red", nav ? String(nav.badgeBg) : "no row");
check(nav !== null && nav.badgeLabel === `${queue.count} waiting`, "badge is announced to screen readers", nav ? String(nav.badgeLabel) : "no row");

// The badged row must actually lead to the queue it is counting.
await p.evaluate(() => {
  const row = [...document.querySelectorAll("button")].find((b) => /Member Registry/i.test(b.textContent || ""));
  row?.click();
});
await p.waitForTimeout(6000);
const onQueue = await p.evaluate(() => /Guest Approvals/i.test(document.body.innerText));
await p.screenshot({ path: `${SHOTS}/badge-destination.png`, fullPage: true });
check(onQueue, "the badged row opens the Guest Approvals queue");

// ------------------------------------------- and it must VANISH when settled
// Decide against the ids the QUEUE reported, not the ones this script holds.
// `table_create` hands back a match id the handler does not necessarily store
// verbatim on the approval row, and Decide's UPDATE is scoped `status='pending'`
// — so a mismatched id matches zero rows and comes back as 409 "already decided
// by someone else", which is indistinguishable from a real conflict.
const waiting = queue.pending[0];
console.log(`decide on ${waiting.match_id} / ${waiting.user_id} (script held ${matchId})`);
await rpc(host, "guest_approval_decide", {
  club_id: clubId,
  match_id: waiting.match_id,
  user_id: waiting.user_id,
  approve: true,
  reason: "badge shot",
});
const after = await rpc(host, "guest_approvals_pending", { club_id: clubId });
check(after.count === 0, "approving clears the server queue", `count=${after.count}`);

await p.goto("http://localhost:3000/clubs", { waitUntil: "domcontentloaded", timeout: 180000 });
await p.waitForTimeout(20000);
const navAfter = await readNav();
console.log("nav after approval:", JSON.stringify(navAfter));
await p.screenshot({ path: `${SHOTS}/badge-absent.png` });
check(navAfter !== null && navAfter.badgeText === null, "badge is ABSENT at zero — not a badge reading 0", navAfter ? String(navAfter.badgeText) : "no row");

await b.close();
await sock.disconnect(false);

console.log(`\n${fail.length === 0 ? "ALL PASS" : `${fail.length} FAILED: ${fail.join(", ")}`}`);
process.exit(fail.length === 0 ? 0 : 1);
