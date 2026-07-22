import { chromium } from "playwright-core";
const CHROME="/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE="http://127.0.0.1:3330";
const OUT="/tmp/claude-0/-home-user-poker-next-gen/392cc787-6489-50fa-8651-c53dd904e186/scratchpad/forms";
const b=await chromium.launch({executablePath:CHROME,headless:true,args:["--no-sandbox","--disable-dev-shm-usage","--enable-unsafe-swiftshader","--use-gl=angle","--use-angle=swiftshader"]});
const ctx=await b.newContext({viewport:{width:1600,height:1000}});
const p=await ctx.newPage(); p.on("pageerror",()=>{});
const log=[]; p.on("console",m=>{if(m.type()==="error")log.push(m.text().slice(0,100));});
await p.goto(BASE+"/table",{waitUntil:"domcontentloaded"}).catch(()=>{});
await p.waitForTimeout(8000);
await p.screenshot({path:`${OUT}/tbl-empty-state.png`});
console.log("empty-state shot");
try{
  await p.getByRole("button",{name:/Add bots & deal me in/i}).click({timeout:6000});
  console.log("clicked deal me in");
  await p.waitForTimeout(9000); // create+join+sit+deal
  await p.screenshot({path:`${OUT}/tbl-seated.png`});
  console.log("seated shot");
}catch(e){console.log("deal skip",e.message.split("\n")[0]);}
log.slice(0,6).forEach(l=>console.log(" •",l));
await b.close();
