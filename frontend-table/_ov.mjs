import { chromium } from 'playwright-core';
const dir = '/tmp/claude-0/-home-user-poker-next-gen/392cc787-6489-50fa-8651-c53dd904e186/scratchpad/gallery4';
const base = 'http://localhost:3216';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader','--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => { try { localStorage.setItem('hrc.age.ok','1'); } catch(e){} });
const p = await ctx.newPage();
const ov = [['Approve New Player','ov-1-approve'],['Table Settings','ov-2-settings'],['Global Dashboard','ov-3-dashboard'],['Hand History + Financials','ov-4-summary'],['Game Paused by Admin','ov-5-paused'],['Player Game Report','ov-6-report'],['Player Kick / Ban','ov-7-kickban'],['Breaking News','ov-8-news']];
for (const [label,name] of ov) {
  try {
    await p.goto(base+'/table?demo=1',{waitUntil:'networkidle',timeout:35000});
    // wait until the demo-overlays control is actually in the DOM
    await p.waitForSelector('text=Demo Overlays', { timeout: 15000 });
    await p.waitForTimeout(800);
    await p.getByText('Demo Overlays', {exact:false}).first().click({timeout:8000, force:true});
    await p.waitForTimeout(500);
    await p.getByText(label, {exact:true}).first().click({timeout:6000, force:true});
    await p.waitForTimeout(1000);
    await p.screenshot({ path: `${dir}/${name}.png` });
    console.log('ok',name);
  } catch(e){ console.log('FAIL',name,e.message.split('\n')[0]); }
}
await b.close(); console.log('OV_DONE');
