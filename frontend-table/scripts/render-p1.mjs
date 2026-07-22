import { chromium } from "playwright-core";
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE || "http://127.0.0.1:3317";
const OUT = "/tmp/claude-0/-home-user-poker-next-gen/392cc787-6489-50fa-8651-c53dd904e186/scratchpad/forms";

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
const exp = Math.floor(Date.now() / 1000) + 86400;
const jwt = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ exp, uid: "u_doug_0001", usn: "doug_s" })}.s`;
const blob = JSON.stringify({ token: jwt, refresh_token: jwt, user_id: "u_doug_0001", username: "doug_s" });

const b = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 1200 } });
await ctx.addInitScript((s) => { try { localStorage.setItem("png-nakama-session", s); localStorage.setItem("png.activeClubId", "club_demo_1"); } catch {} }, blob);
const p = await ctx.newPage();
p.on("pageerror", () => {});
const w = (ms) => p.waitForTimeout(ms);
await p.route("**/v2/rpc/**", async (route) => {
  const url = route.request().url();
  let payload = { ok: true };
  if (url.includes("club_list")) payload = { clubs: [{ id: "club_demo_1", name: "Midnight Hold'em Society", currency: "USD" }] };
  else if (url.includes("me_roles")) payload = { platform_admin: false, club_admin_of: ["club_demo_1"], clubs: [{ club_id: "club_demo_1", role: "owner", can_configure: true, operator: true }] };
  else if (url.includes("hand_history")) payload = { hands: [
    { id: "h1", match_id: "m1", table_label: "Midnight $1/$2", hand_no: 142, pot: 34500, rake: 300, net_cents: 18800, won: true, anchored: true, created_at: "2026-07-22T18:04:00Z" },
    { id: "h2", match_id: "m1", table_label: "Midnight $1/$2", hand_no: 141, pot: 12000, rake: 150, net_cents: -6000, won: false, anchored: false, created_at: "2026-07-22T18:01:00Z" },
    { id: "h3", match_id: "m1", table_label: "Midnight $1/$2", hand_no: 140, pot: 8800, rake: 100, net_cents: 4200, won: true, anchored: false, created_at: "2026-07-22T17:58:00Z" },
  ]};
  else if (url.includes("audit_verify")) payload = { chain_ok: true, deck_commit_hash: "7f3a9c2e8b41d05f6a2c9e1b4d8f0a3c5e7b9d1f2a4c6e8b0d2f4a6c8e0b2d4f6", event_count: 24 };
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ payload: JSON.stringify(payload) }) });
});

// Tournament wizard
await p.goto(BASE + "/hub", { waitUntil: "domcontentloaded" }).catch(() => {});
await w(2500);
try {
  await p.getByRole("button", { name: /Build a tournament/i }).click({ timeout: 5000 });
  await w(900);
  await p.screenshot({ path: `${OUT}/t1-tourney-basics.png` });
  await p.getByRole("button", { name: /Create & continue/i }).click({ timeout: 4000 });
  await w(1200);
  await p.screenshot({ path: `${OUT}/t2-tourney-blinds.png` });
  await p.getByRole("button", { name: /Save blinds & continue/i }).click({ timeout: 4000 });
  await w(1000);
  await p.screenshot({ path: `${OUT}/t3-tourney-payouts.png` });
  console.log("OK tourney wizard");
} catch (e) { console.log("tourney skip", e.message.split("\n")[0]); }

// Hand history + verify
await p.goto(BASE + "/hands", { waitUntil: "domcontentloaded" }).catch(() => {});
await w(1800);
await p.screenshot({ path: `${OUT}/h1-hand-history.png`, fullPage: true });
try {
  await p.getByRole("button", { name: /Verify →/i }).first().click({ timeout: 4000 });
  await w(1000);
  await p.screenshot({ path: `${OUT}/h2-hand-verify.png` });
  console.log("OK hand history");
} catch (e) { console.log("hands skip", e.message.split("\n")[0]); }

await b.close();
console.log("done");
