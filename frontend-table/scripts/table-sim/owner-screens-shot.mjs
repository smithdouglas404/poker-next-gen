// What a CLUB OWNER actually gets — the designed screens, not the console.
// Renders them signed in as a real club owner (session injected the way
// lib/nakama/auth.ts persists it) so the pages have real data behind them.
import { Client } from "@heroiclabs/nakama-js";
import { execSync } from "node:child_process";
const pw = (await import("/opt/node22/lib/node_modules/playwright/index.js")).default;
const OUT = process.env.SHOT_DIR ?? "/tmp";
const client = new Client("defaultkey","127.0.0.1","7350",false);
const sql = (q) => execSync(`psql -h 127.0.0.1 -p 5433 -U postgres -d nakama -tAc "${q.replace(/"/g,'\\"')}"`).toString().trim();
const rpc = async (s,n,p={}) => { const r = await client.rpc(s,n,p); return typeof r.payload==="string"?JSON.parse(r.payload):r.payload; };

const stamp = Date.now();
const owner = await client.authenticateEmail(`osc_${stamp}@t.local`,"Passw0rd!123",true);
sql(`INSERT INTO poker_subscription (user_id,tier,status) VALUES ('${owner.user_id}','platinum','active') ON CONFLICT (user_id) DO UPDATE SET tier='platinum',status='active'`);
sql(`INSERT INTO poker_global_wallet (user_id,balance) VALUES ('${owner.user_id}',5000000) ON CONFLICT (user_id) DO UPDATE SET balance=5000000`);
const club = await rpc(owner,"club_create",{ name:"Riverside Poker Club", slug:`rv${stamp}` });
const clubId = club?.club?.id ?? club?.id;
// A couple of members so the registry is not empty.
for (const n of ["Marcus","Priya","Dev"]) {
  sql(`INSERT INTO poker_club_member (club_id,user_id,username,role,status,joined_at) VALUES ('${clubId}','u_${n}_${stamp}','${n}','member','active',NOW()) ON CONFLICT DO NOTHING`);
}
console.log("club", clubId);

const b = await pw.chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome",headless:true,args:["--enable-unsafe-swiftshader","--use-gl=angle","--use-angle=swiftshader","--no-sandbox","--disable-dev-shm-usage","--no-proxy-server"]});
const ctx = await b.newContext({viewport:{width:1500,height:1050},deviceScaleFactor:1});
await ctx.addInitScript(({token,refresh,uid,uname})=>{try{
  localStorage.setItem("hrc.age.ok","1");
  localStorage.setItem("png-nakama-session",JSON.stringify({token,refresh_token:refresh,user_id:uid,username:uname}));
  localStorage.setItem("png-auth-method","email");
}catch{}}, {token:owner.token,refresh:owner.refresh_token,uid:owner.user_id,uname:owner.username});

async function shoot(path,name,clickNav) {
  const p = await ctx.newPage();
  await p.goto("http://localhost:3000"+path,{waitUntil:"domcontentloaded",timeout:120000});
  await p.waitForTimeout(13000);
  if (clickNav) {
    await p.evaluate((label)=>{ const e=[...document.querySelectorAll("button,a,[role=button]")].find(x=>new RegExp(label,"i").test(x.textContent||"")); if(e) e.click(); }, clickNav);
    await p.waitForTimeout(6000);
  }
  const t = await p.evaluate(()=>document.body.innerText.slice(0,120).replace(/\n+/g," | "));
  console.log(`${name.padEnd(22)} ${t}`);
  await p.addStyleTag({content:"nextjs-portal,[data-next-badge-root],[data-nextjs-toast]{display:none!important}"}).catch(()=>{});
  await p.screenshot({path:`${OUT}/${name}.png`});
  await p.close();
}
await shoot("/clubs","OWNER-1-hub");
await shoot("/clubs","OWNER-2-members","Member Registry");
await shoot("/lobby","OWNER-3-gamesetup");
await b.close();
