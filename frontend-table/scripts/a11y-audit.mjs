import { chromium } from "playwright-core";
import { readFileSync } from "fs";

const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE || "http://127.0.0.1:3314";
const OUT = "/tmp/claude-0/-home-user-poker-next-gen/392cc787-6489-50fa-8651-c53dd904e186/scratchpad/forms";
const axe = readFileSync("node_modules/axe-core/axe.min.js", "utf8");

const b64url = (o) => Buffer.from(JSON.stringify(o)).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
const exp = Math.floor(Date.now() / 1000) + 86400;
const jwt = `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({ exp, uid: "u1", usn: "doug_s" })}.s`;
const blob = JSON.stringify({ token: jwt, refresh_token: jwt, user_id: "u1", username: "doug_s" });

const b = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 1200 } });
await ctx.addInitScript((s) => { try { localStorage.setItem("png-nakama-session", s); localStorage.setItem("png.activeClubId", "club_demo_1"); } catch {} }, blob);
const p = await ctx.newPage();
p.on("pageerror", () => {});
await p.route("**/v2/rpc/**", async (route) => {
  const url = route.request().url();
  let payload = { ok: true };
  if (url.includes("club_list")) payload = { clubs: [{ id: "club_demo_1", name: "Midnight Hold'em Society", currency: "USD" }] };
  else if (url.includes("me_roles")) payload = { platform_admin: false, club_admin_of: ["club_demo_1"], clubs: [{ club_id: "club_demo_1", role: "owner", can_configure: true, operator: true }] };
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ payload: JSON.stringify(payload) }) });
});

await p.goto(BASE + "/hub", { waitUntil: "domcontentloaded" }).catch(() => {});
await p.waitForTimeout(2500);
await p.screenshot({ path: `${OUT}/a11y-hub-lighter.png`, fullPage: false });

await p.evaluate(axe);
const results = await p.evaluate(async () => {
  // WCAG 2 AA rule set.
  return await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] } });
});

const summarize = (arr) =>
  arr.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })).sort((a, b) => b.nodes - a.nodes);

console.log("=== AXE WCAG 2 AA — /hub ===");
console.log("violations:", results.violations.length);
console.log(JSON.stringify(summarize(results.violations), null, 2));
const contrast = results.violations.find((v) => v.id === "color-contrast");
if (contrast) {
  console.log("\n--- color-contrast offenders (first 8) ---");
  for (const n of contrast.nodes.slice(0, 8)) {
    console.log("•", (n.target || []).join(" "), "—", (n.any?.[0]?.message || "").slice(0, 120));
  }
} else {
  console.log("\ncolor-contrast: PASS (no violations)");
}
console.log("\npasses:", results.passes.length, "| incomplete:", results.incomplete.length);

await b.close();
