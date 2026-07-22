import { chromium } from "playwright-core";
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = "http://127.0.0.1:3300";
const OUT = "/tmp/claude-0/-home-user-poker-next-gen/392cc787-6489-50fa-8651-c53dd904e186/scratchpad/shots";
const b = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--enable-unsafe-swiftshader","--use-gl=angle","--use-angle=swiftshader","--no-sandbox","--disable-dev-shm-usage"] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript((id)=>{try{localStorage.setItem("png-device-id",id)}catch{}}, "e2e-owner-aaaaaaaa1111");
const p = await ctx.newPage(); p.on("pageerror",()=>{});
const w=(ms)=>p.waitForTimeout(ms);
await p.goto(BASE+"/login",{waitUntil:"networkidle"}).catch(()=>{}); await w(1000);
try{ await p.getByText(/Play now as guest/i).first().click({timeout:4000}); await w(2500);}catch{}
await p.goto(BASE+"/hub",{waitUntil:"networkidle"}).catch(()=>{}); await w(2500);
// FULL PAGE — all command groups
await p.screenshot({ path: `${OUT}/03-command-center-FULL.png`, fullPage: true });
console.log("OK full command center");
// command-run modal state: click a RUN COMMAND
try{ await p.getByText(/RUN COMMAND/i).first().click({timeout:4000}); await w(1500); await p.screenshot({path:`${OUT}/03b-command-run-modal.png`}); console.log("OK command modal"); }catch(e){console.log("modal skip",e.message)}
await b.close(); console.log("done");
