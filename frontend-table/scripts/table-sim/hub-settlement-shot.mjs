// Render the Owner Hub's settlement panel against the real stack and screenshot it.
//
// Why this exists: TableSettlements.tsx was shipped verified only by its RPCs
// and by tsc/build. That is the same compile-signals-instead-of-rendering
// substitution that has burned this project repeatedly, and a panel is exactly
// the kind of thing that typechecks fine and renders wrong.
//
// The Owner Hub needs an authenticated club owner, and Clerk cannot authenticate
// in this sandbox (dummy keys). But the app's Nakama session is just localStorage
// under "png-nakama-session" (see lib/nakama/auth.ts persistSession), so a real
// session minted straight from Nakama can be injected before the page loads.
//
// Run with the local stack up (postgres:5433, nakama:7350 with backend-core.so)
// and the dev server on :3000:
//
//   node scripts/table-sim/hub-settlement-shot.mjs
//
// Seeds a club and a finished game — throwaway local database only.

import { Client } from "@heroiclabs/nakama-js";
import { execSync } from "node:child_process";

const pw = (await import("/opt/node22/lib/node_modules/playwright/index.js")).default;
const OUT = process.env.SHOT_DIR ?? "/tmp";
const sql = (q) => execSync(`psql -h 127.0.0.1 -p 5433 -U postgres -d nakama -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const client = new Client("defaultkey", "127.0.0.1", "7350", false);
const rpc = async (s, n, p = {}) => {
  const r = await client.rpc(s, n, p);
  return typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload;
};

const stamp = Date.now();
const host = await client.authenticateEmail(`hub_${stamp}@t.local`, "Passw0rd!123", true);
sql(`INSERT INTO poker_subscription (user_id,tier,status) VALUES ('${host.user_id}','platinum','active') ON CONFLICT (user_id) DO UPDATE SET tier='platinum',status='active'`);
sql(`INSERT INTO poker_global_wallet (user_id,balance) VALUES ('${host.user_id}',5000000) ON CONFLICT (user_id) DO UPDATE SET balance=5000000`);

const club = await rpc(host, "club_create", { name: "Riverside Poker Club", slug: `rpc${stamp}` });
const clubId = club?.club?.id ?? club?.id;

// A finished club game: three players seated on club credit (a loan), with the
// owner's own worked example in the middle two lines — 1,000 advanced, one ends
// on 200 (owes 800), one ends on 1,800 (owed 800), and one breaks even.
const stl = `stl_hub_${stamp}`;
sql(`INSERT INTO poker_table_settlement (id,club_id,match_id,status) VALUES ('${stl}','${clubId}','friday-night-100','open')`);
const line = (i, name, member, loaned, back) =>
  sql(`INSERT INTO poker_table_settlement_line (id,settlement_id,user_id,username,is_member,loaned_minor,returned_minor)
       VALUES ('ln${i}_${stamp}','${stl}','u${i}_${stamp}','${name}',${member},${loaned},${back})`);
line(1, "Marcus", true, 100000, 20000);
line(2, "Priya", true, 100000, 180000);
line(3, "Dev", false, 50000, 50000);
console.log(`club ${clubId}`);

const b = await pw.chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  headless: true,
  args: ["--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader", "--no-sandbox", "--disable-dev-shm-usage", "--no-proxy-server"],
});
const ctx = await b.newContext({ viewport: { width: 1500, height: 1300 }, deviceScaleFactor: 1 });
// Exactly the shape persistSession writes, so ensureSession() restores it
// instead of falling back to a fresh device account with no club.
await ctx.addInitScript(
  ({ token, refresh, uid, uname }) => {
    try {
      localStorage.setItem("hrc.age.ok", "1");
      localStorage.setItem("png-nakama-session", JSON.stringify({
        token, refresh_token: refresh, user_id: uid, username: uname,
      }));
      localStorage.setItem("png-auth-method", "email");
    } catch { /* ignore */ }
  },
  { token: host.token, refresh: host.refresh_token, uid: host.user_id, uname: host.username },
);

const p = await ctx.newPage();
await p.goto("http://localhost:3000/clubs", { waitUntil: "domcontentloaded", timeout: 180000 });
await p.waitForTimeout(16000);

// The hub opens on Club Overview; the settlement panel lives under the
// "Member Registry" section (OwnerHub renders it inside section === "members").
// It is state-driven nav, not a route, so it has to be clicked.
const navigated = await p.evaluate(() => {
  const el = [...document.querySelectorAll("button,a,[role=button]")]
    .find((e) => /Member Registry/i.test(e.textContent || ""));
  if (!el) return false;
  el.click();
  return true;
});
console.log("clicked Member Registry:", navigated);
await p.waitForTimeout(6000);

const info = await p.evaluate(() => {
  const t = document.body.innerText;
  return {
    settlementsPanel: /Table settlements/i.test(t),
    owesTheClub: /owes club/i.test(t),
    clubOwes: /club owes/i.test(t),
    confirmButton: /Confirm books balanced/i.test(t),
    couldntLoad: /COULDN'T LOAD/i.test(t),
  };
});
console.log(JSON.stringify(info));

await p.evaluate(() => {
  const h = [...document.querySelectorAll("h3")].find((e) => /Table settlements/i.test(e.textContent || ""));
  if (h) h.scrollIntoView({ block: "center" });
});
await p.waitForTimeout(1200);
await p.addStyleTag({ content: "nextjs-portal,[data-next-badge-root],[data-nextjs-toast]{display:none!important}" }).catch(() => {});
await p.screenshot({ path: `${OUT}/HUB-settlements.png` });
await b.close();
