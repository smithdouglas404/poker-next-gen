import { chromium } from "playwright-core";
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = "http://127.0.0.1:3300";
const OUT = "/tmp/claude-0/-home-user-poker-next-gen/392cc787-6489-50fa-8651-c53dd904e186/scratchpad/forms";
import { mkdirSync } from "fs";
mkdirSync(OUT, { recursive: true });

// Craft a non-expired Nakama-style JWT so ensureSession() restores it offline
// (no backend), which unlocks the club-admin-gated cards for the render.
const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64")
  .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
const exp = Math.floor(Date.now() / 1000) + 86400;
const jwt = `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({ exp, uid: "u_doug_0001", usn: "doug_s" })}.sig`;
const sessionBlob = JSON.stringify({ token: jwt, refresh_token: jwt, user_id: "u_doug_0001", username: "doug_s" });

const b = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox","--disable-dev-shm-usage"] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 1200 } });
await ctx.addInitScript((blob) => {
  try {
    localStorage.setItem("png-nakama-session", blob);
    localStorage.setItem("png-device-id", "e2e-owner-doug");
    localStorage.setItem("png.activeClubId", "club_demo_1");
  } catch {}
}, sessionBlob);
const p = await ctx.newPage();
p.on("pageerror", () => {});
const w = (ms) => p.waitForTimeout(ms);

// Intercept the Nakama RPC HTTP calls so club_list/club_members return demo data
// (no backend needed to prove the FORM renders with pickers populated).
await p.route("**/v2/rpc/**", async (route) => {
  const url = route.request().url();
  let payload = {};
  if (url.includes("club_list")) {
    payload = { clubs: [
      { id: "club_demo_1", name: "Midnight Hold'em Society", currency: "USD" },
      { id: "club_demo_2", name: "River Kings Club", currency: "USD" },
    ]};
  } else if (url.includes("club_members")) {
    payload = { members: [
      { user_id: "u_doug_0001", username: "doug_s", role: "owner" },
      { user_id: "u_mia_0002", username: "mia_river", role: "member" },
      { user_id: "u_kai_0003", username: "kai_the_grinder", role: "member" },
    ]};
  } else if (url.includes("me_roles")) {
    payload = { platform_admin: true, club_admin: true };
  } else {
    payload = { ok: true };
  }
  await route.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ payload: JSON.stringify(payload) }) });
});

await p.goto(BASE + "/hub", { waitUntil: "domcontentloaded" }).catch(() => {});
await w(2500);
await p.screenshot({ path: `${OUT}/00-command-center.png`, fullPage: true });
console.log("OK command center");

async function openCard(title, shot) {
  // Reset to top and click the card whose heading matches.
  await p.evaluate(() => window.scrollTo(0, 0));
  try {
    const card = p.locator("button", { hasText: new RegExp(title, "i") }).first();
    await card.scrollIntoViewIfNeeded();
    await card.click({ timeout: 5000 });
    await w(1200);
    await p.screenshot({ path: `${OUT}/${shot}` });
    console.log("OK modal:", title);
  } catch (e) {
    console.log("skip", title, e.message.split("\n")[0]);
  }
}

// club_create — text/select form (name, description, currency dropdown)
await openCard("Create Community", "01-club_create.png");
await p.keyboard.press("Escape").catch(()=>{});
// Close via Cancel if present
try { await p.getByRole("button", { name: /^Cancel$/ }).click({ timeout: 1500 }); } catch {}
await w(400);

// table_create — MONEY inputs ($ blinds, buy-in) + variant select
await openCard("Create Cash Game", "02-table_create_money.png");
try { await p.getByRole("button", { name: /^Cancel$/ }).click({ timeout: 1500 }); } catch {}
await w(400);

// balance_allocate — club dropdown + user typeahead + MoneyInput + confirm
await openCard("Allocate Player Balance", "03-balance_allocate.png");
// open the user typeahead
try {
  const userInput = p.locator("input[placeholder*='member' i]").first();
  await userInput.click({ timeout: 2000 });
  await w(600);
  await p.screenshot({ path: `${OUT}/04-user_typeahead.png` });
  console.log("OK user typeahead");
  // pick the first suggestion
  await p.locator("ul li button").first().click({ timeout: 2000 });
  await w(400);
} catch (e) { console.log("typeahead skip", e.message.split("\n")[0]); }
// Review & Run -> confirm dialog
try {
  await p.getByRole("button", { name: /Review & Run/i }).click({ timeout: 3000 });
  await w(800);
  await p.screenshot({ path: `${OUT}/05-confirm_dialog.png` });
  console.log("OK confirm dialog");
} catch (e) { console.log("confirm skip", e.message.split("\n")[0]); }
try { await p.getByRole("button", { name: /^Back$/ }).click({ timeout: 1500 }); } catch {}
try { await p.getByRole("button", { name: /^Cancel$/ }).click({ timeout: 1500 }); } catch {}
await w(400);

// rake_config_set — BasisPointsInput (5%) + money cap + public toggle
await openCard("Configure Rake", "06-rake_config_bps.png");
try { await p.getByRole("button", { name: /^Cancel$/ }).click({ timeout: 1500 }); } catch {}
await w(400);

// tournament_create — the "unit stew" fix: buy-in/fee money + chips count
await openCard("Create Tournament", "07-tournament_create.png");

await b.close();
console.log("done");
