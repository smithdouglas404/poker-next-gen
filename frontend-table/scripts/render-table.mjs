import { chromium } from "playwright-core";
const CHROME="/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE=process.env.BASE||"http://127.0.0.1:3320";
const OUT="/tmp/claude-0/-home-user-poker-next-gen/392cc787-6489-50fa-8651-c53dd904e186/scratchpad/forms";
const b=await chromium.launch({executablePath:CHROME,headless:true,args:["--no-sandbox","--disable-dev-shm-usage","--enable-unsafe-swiftshader","--use-gl=angle","--use-angle=swiftshader"]});
const ctx=await b.newContext({viewport:{width:1600,height:1000}});
const p=await ctx.newPage();
const logs=[]; p.on("console",m=>{if(m.type()==="error")logs.push(m.text().slice(0,120));});
p.on("pageerror",e=>logs.push("PAGEERR "+e.message.slice(0,120)));
await p.goto(BASE+"/table",{waitUntil:"domcontentloaded"}).catch(()=>{});
await p.waitForTimeout(9000); // connect + R3F warmup
await p.screenshot({path:`${OUT}/tbl-baseline.png`});
console.log("baseline shot"); logs.slice(0,8).forEach(l=>console.log(" •",l));
await b.close();
