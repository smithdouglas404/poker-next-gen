import { chromium } from "playwright-core";
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = "http://127.0.0.1:3300";
const OUT = "/tmp/claude-0/-home-user-poker-next-gen/392cc787-6489-50fa-8651-c53dd904e186/scratchpad/shots/commands";

// All 40 Command Center commands, in registry order (title -> filename slug).
const CMDS = [
  "Check Backend Health", "Live Stack Health", "Sign In / Create Account", "View Player Profile",
  "View Global Wallet", "Loyalty & HRP", "Identity Verification", "Create Community",
  "Browse Communities", "Add Club Owner", "Allocate Player Balance", "Get Club Balance",
  "Configure Rake Rules", "Get Rake Rules", "Create Cash Game", "Join Cash Game",
  "List Open Tables", "Find Match (Matchmaker)", "Hand Rank (rs_poker)", "Monte Carlo Equity (rs_poker)",
  "Leave Table", "Create Tournament", "Browse Tournaments", "Register for Tournament",
  "Add Blind Level", "View Blind Structure", "Add Prize Tier", "View Prize Pool",
  "Start Tournament (Live MTT)", "View Rake Ledger", "Set Table Balancing Rule", "GTO Action Advice",
  "Rank Omaha Hand", "Omaha Showdown", "Smart HUD Coaching Tip", "Anti-Bot Pattern Score",
  "List Hand Audit Events", "Verify Hand Integrity", "Open Table Canvas", "Start Hand / Deal Cards",
];
const slug = (s, i) => `cc-${String(i + 1).padStart(2, "0")}-` + s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const b = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader", "--no-sandbox", "--disable-dev-shm-usage"] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript((id) => { try { localStorage.setItem("png-device-id", id); } catch {} }, "e2e-owner-aaaaaaaa1111");
const p = await ctx.newPage(); p.on("pageerror", () => {});
const w = (ms) => p.waitForTimeout(ms);

await p.goto(BASE + "/login", { waitUntil: "networkidle" }).catch(() => {}); await w(1000);
try { await p.getByText(/Play now as guest/i).first().click({ timeout: 4000 }); await w(2500); } catch {}

let ok = 0;
for (let i = 0; i < CMDS.length; i++) {
  const title = CMDS[i];
  try {
    await p.goto(BASE + "/hub", { waitUntil: "networkidle" }).catch(() => {}); await w(1500);
    const card = p.getByText(title, { exact: true }).first();
    await card.scrollIntoViewIfNeeded({ timeout: 4000 });
    await card.click({ timeout: 4000 });
    await w(1200);
    await p.screenshot({ path: `${OUT}/${slug(title, i)}.png` });
    ok++; console.log("OK  " + slug(title, i));
    await p.keyboard.press("Escape").catch(() => {});
  } catch (e) {
    console.log("ERR " + slug(title, i) + ": " + e.message);
  }
}
await b.close();
console.log(`done ${ok}/${CMDS.length}`);
