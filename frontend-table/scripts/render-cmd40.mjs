import { chromium } from "playwright-core";
const CHROME="/opt/pw-browsers/chromium-1194/chrome-linux/chrome", BASE="http://127.0.0.1:3300";
const OUT="/tmp/claude-0/-home-user-poker-next-gen/392cc787-6489-50fa-8651-c53dd904e186/scratchpad/shots/commands";
const b=await chromium.launch({executablePath:CHROME,headless:true,args:["--enable-unsafe-swiftshader","--use-gl=angle","--use-angle=swiftshader","--no-sandbox","--disable-dev-shm-usage"]});
const ctx=await b.newContext({viewport:{width:1440,height:900}});
await ctx.addInitScript((id)=>{try{localStorage.setItem("png-device-id",id)}catch{}},"e2e-owner-aaaaaaaa1111");
const p=await ctx.newPage();p.on("pageerror",()=>{});const w=(ms)=>p.waitForTimeout(ms);
await p.goto(BASE+"/login",{waitUntil:"networkidle"}).catch(()=>{});await w(1000);
try{await p.getByText(/Play now as guest/i).first().click({timeout:4000});await w(2500)}catch{}
await p.goto(BASE+"/hub",{waitUntil:"networkidle"}).catch(()=>{});await w(1500);
try{const c=p.getByText("Start Hand / Deal Cards",{exact:true}).first();await c.scrollIntoViewIfNeeded();await c.click({timeout:4000});await w(1200);await p.screenshot({path:`${OUT}/cc-40-start-hand-deal-cards.png`});console.log("OK cc-40")}catch(e){console.log("ERR",e.message)}
await b.close();console.log("done");
