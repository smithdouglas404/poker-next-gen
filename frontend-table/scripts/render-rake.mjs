import { chromium } from "playwright-core";
const CHROME="/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE=process.env.BASE, OUT="/tmp/claude-0/-home-user-poker-next-gen/392cc787-6489-50fa-8651-c53dd904e186/scratchpad/forms";
const b64=(o)=>Buffer.from(JSON.stringify(o)).toString("base64").replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
const jwt=`${b64({alg:"HS256",typ:"JWT"})}.${b64({exp:Math.floor(Date.now()/1000)+86400,uid:"u1",usn:"doug"})}.s`;
const b=await chromium.launch({executablePath:CHROME,headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
const ctx=await b.newContext({viewport:{width:1200,height:900}});
await ctx.addInitScript((s)=>{try{localStorage.setItem("png-nakama-session",s)}catch{}},JSON.stringify({token:jwt,refresh_token:jwt,user_id:"u1",username:"doug"}));
const p=await ctx.newPage(); p.on("pageerror",()=>{});
await p.route("**/v2/rpc/**", r=>{const u=r.request().url(); let pl={ok:true};
  if(u.includes("club_list")) pl={clubs:[{id:"c1",name:"Midnight Hold'em Society"}]};
  else if(u.includes("rake_config_get")) pl={club_id:"c1",name:"Standard",percent_bps:500,cap_minor:500,min_pot_minor:0,no_flop_no_drop:true,public:true};
  return r.fulfill({status:200,contentType:"application/json",body:JSON.stringify({payload:JSON.stringify(pl)})});});
await p.goto(BASE+"/provably-fair",{waitUntil:"domcontentloaded"}).catch(()=>{}); await p.waitForTimeout(1500);
try{await p.getByRole("button",{name:/^Rake$/}).click({timeout:4000});await p.waitForTimeout(1200);}catch(e){console.log("tab",e.message.split("\n")[0]);}
await p.screenshot({path:`${OUT}/r1-rake-transparency.png`});
console.log("OK rake"); await b.close();
