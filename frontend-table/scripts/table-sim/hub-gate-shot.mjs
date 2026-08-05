// Prove /hub's ops gate BOTH ways: an admin sees the console, a normal player
// does not.
//
// Why this is a script and not a click: /hub was demoted to ops-only with
// RequireRole require="platform_admin", and a gate is only verified when you
// have seen it ALLOW and DENY. Checking one side proves nothing — a gate that
// denies everybody looks identical to a working one until an operator complains.
//
// platform_admin comes from the ADMIN_USER_IDS env var on Nakama
// (rpc/subscription.go isAdmin), so this prints the admin's user id and expects
// Nakama to have been restarted with it set. me_roles then reports
// platform_admin: true for that account and false for everyone else.
//
//   1. node scripts/table-sim/hub-gate-shot.mjs --ids     # print the two ids
//   2. restart Nakama with ADMIN_USER_IDS=<admin id>
//   3. node scripts/table-sim/hub-gate-shot.mjs           # shoot both
//
// Seeds accounts — throwaway local database only.

import { Client } from "@heroiclabs/nakama-js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const client = new Client("defaultkey", "127.0.0.1", "7350", false);
const OUT = process.env.SHOT_DIR ?? "/tmp";
const IDFILE = "/tmp/hub-gate-ids.json";
const IDS_ONLY = process.argv.includes("--ids");

// Reuse the same two accounts across both invocations, so the id handed to
// ADMIN_USER_IDS in step 2 is the one actually rendered in step 3.
let creds;
if (existsSync(IDFILE) && !IDS_ONLY) {
  creds = JSON.parse(readFileSync(IDFILE, "utf8"));
} else {
  const stamp = Date.now();
  creds = { admin: `hubadmin_${stamp}@t.local`, player: `hubplayer_${stamp}@t.local` };
}

const admin = await client.authenticateEmail(creds.admin, "Passw0rd!123", true);
const player = await client.authenticateEmail(creds.player, "Passw0rd!123", true);
// A CLUB OWNER: not in ADMIN_USER_IDS, but granted ops responsibility. /hub
// gates on "club_admin" (platform_admin OR administers a club), so this account
// must get IN while the plain player stays out — that middle case is the whole
// point of the wider gate and testing only the extremes would miss it.
const owner = await client.authenticateEmail(creds.owner ?? (creds.owner = `hubowner_${Date.now()}@t.local`), "Passw0rd!123", true);
creds.ownerId = owner.user_id;
creds.adminId = admin.user_id;
creds.playerId = player.user_id;
writeFileSync(IDFILE, JSON.stringify(creds, null, 2));

if (IDS_ONLY) {
  console.log(`ADMIN_USER_IDS=${admin.user_id}`);
  console.log(`player (must be denied): ${player.user_id}`);
  process.exit(0);
}

// What does the server actually say about each account? The UI gate reads this.
const roles = async (s) => {
  const r = await client.rpc(s, "me_roles", {});
  return typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload;
};
console.log("admin  me_roles.platform_admin =", (await roles(admin)).platform_admin);
console.log("player me_roles.platform_admin =", (await roles(player)).platform_admin);
{
  // Give the owner a club so me_roles reports club_admin_of for them.
  const { execSync } = await import("node:child_process");
  const sql = (q) => execSync(`psql -h 127.0.0.1 -p 5433 -U postgres -d nakama -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
  sql(`INSERT INTO poker_subscription (user_id,tier,status) VALUES ('${owner.user_id}','platinum','active') ON CONFLICT (user_id) DO UPDATE SET tier='platinum',status='active'`);
  const r = await client.rpc(owner, "club_create", { name: `Ops ${Date.now()}`, slug: `ops${Date.now()}` });
  void r;
  const or_ = await roles(owner);
  console.log("owner  platform_admin =", or_.platform_admin, "| club_admin_of =", (or_.club_admin_of ?? []).length);
}

const pw = (await import("/opt/node22/lib/node_modules/playwright/index.js")).default;
const b = await pw.chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  headless: true,
  args: ["--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader", "--no-sandbox", "--disable-dev-shm-usage", "--no-proxy-server"],
});

async function shoot(session, name) {
  const ctx = await b.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(
    ({ token, refresh, uid, uname }) => {
      try {
        localStorage.setItem("hrc.age.ok", "1");
        localStorage.setItem("png-nakama-session", JSON.stringify({ token, refresh_token: refresh, user_id: uid, username: uname }));
        localStorage.setItem("png-auth-method", "email");
      } catch { /* ignore */ }
    },
    { token: session.token, refresh: session.refresh_token, uid: session.user_id, uname: session.username },
  );
  const p = await ctx.newPage();
  await p.goto("http://localhost:3000/hub", { waitUntil: "domcontentloaded", timeout: 120000 });
  await p.waitForTimeout(12000);
  const m = await p.evaluate(() => {
    const t = document.body.innerText;
    return {
      console: /Command Center/i.test(t) && /LIVE COMMANDS|Workspaces/i.test(t),
      denied: /Not authorized|don't have access|no access/i.test(t),
    };
  });
  console.log(`${name}:`, JSON.stringify(m));
  await p.addStyleTag({ content: "nextjs-portal,[data-next-badge-root],[data-nextjs-toast]{display:none!important}" }).catch(() => {});
  await p.screenshot({ path: `${OUT}/${name}.png` });
  await ctx.close();
  return m;
}

const a = await shoot(admin, "HUB-gate-admin");
const o = await shoot(owner, "HUB-gate-clubowner");
const p2 = await shoot(player, "HUB-gate-player");
await b.close();

const ok = a.console && !a.denied && o.console && !o.denied && p2.denied && !p2.console;
console.log(ok ? "\n=== GATE HOLDS: admin + club owner get in, plain player is denied ===" : "\n=== GATE WRONG ===");
process.exit(ok ? 0 : 2);
