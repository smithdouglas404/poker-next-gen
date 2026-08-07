// How long does a club chat message take to reach a screen that is already open?
//
// This measures the RECEIVE path only, which is the thing actually in question.
// Every message is sent OUT OF BAND (a direct RPC / a second socket client),
// never through the page under test — so what is timed is "does an open page
// learn about a message it did not send, and when", not "does my own send echo".
//
// Three surfaces, one question:
//   A  /clubs        Owner Hub rail          club_chat_list  (RPC)
//   B  /tournaments  Owner Center rail       club_chat_list  (RPC)
//   C  the table     ChatStatsPanel channel  OpChat          (match socket)
//
// A and B are measured in the DOM, because the claim is about what an operator
// sees. C is measured at the wire between two clients: getting a browser seated
// in a real match is a different harness, and a wire number that is already
// orders of magnitude under the DOM numbers settles the comparison without it.
// Where the measurement changes, the label says so — no mixing.
//
// Run against the local stack (postgres:5433, engine-math:8080, nakama:7350)
// with `npm run dev` warm on :3000.
//
//   node scripts/table-sim/chat-transport-measure.mjs
//   ONLY=tournaments SAMPLES=4 node scripts/table-sim/chat-transport-measure.mjs
//
// Two traps this script fell into, both of which produced a confident wrong
// answer before being caught. Keep the guards:
//
//   1. /tournaments opens on the LOBBY tab. Measuring it without clicking
//      "Tournament Center" measures an unmounted component and reports NEVER.
//   2. Nakama's access token expires (token_expiry_sec is unset in both
//      stack-up.mjs and .railway/railway.ts, so both take the short default) and
//      ensureSession() does NOT use the refresh token it persisted — it
//      authenticates a NEW anonymous device account. Every club RPC then 403s,
//      ChatPanel's `catch { /* transient */ }` swallows it, and the rail freezes
//      with stale messages and no error. Samples taken after that point say
//      NEVER for a reason that has nothing to do with chat transport, so every
//      sample records whether the page was still the club owner.

import { Client } from "@heroiclabs/nakama-js";
import { execSync } from "node:child_process";
const pw = (await import("/opt/node22/lib/node_modules/playwright/index.js")).default;

const client = new Client("defaultkey", "127.0.0.1", "7350", false);
const sql = (q) =>
  execSync(`psql -h 127.0.0.1 -p 5433 -U postgres -d nakama -tAc "${q.replace(/"/g, '\\"')}"`)
    .toString()
    .trim();
const rpc = async (s, n, p = {}) => {
  try {
    const r = await client.rpc(s, n, p);
    return typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload;
  } catch (e) {
    // nakama-js rejects with the raw Response; dumping it buries the message.
    const body = e && typeof e.json === "function" ? await e.json().catch(() => null) : null;
    throw new Error(`${n} -> ${e?.status ?? "?"} ${JSON.stringify(body) ?? e?.message ?? e}`);
  }
};
const CHANNEL_ROOM = 1;
// Club chat now rides a Nakama channel, so the out-of-band publisher has to be a
// channel write too. Sending via club_chat_send would write to poker_club_chat,
// which no live rail listens to any more — the page would show NEVER and the
// harness, not the product, would be what was broken.
let pubSocket = null;
let pubChannel = null;
async function publish(text) {
  if (!pubSocket) {
    pubSocket = client.createSocket(false, false);
    await pubSocket.connect(owner, true);
    pubChannel = await pubSocket.joinChat(clubId, CHANNEL_ROOM, true, false);
  }
  await pubSocket.writeChatMessage(pubChannel.id, { text });
}
const OP_CHAT_SEND = 5; // protocol/opcodes.go
const OP_CHAT = 111;
const SHOTS = "/tmp/claude-0/-home-user-poker-next-gen/392cc787-6489-50fa-8651-c53dd904e186/scratchpad";
const WATCH_MS = 30_000; // generous: 6x the 5s poll interval in OwnerCenter

// ---------------------------------------------------------------- server state
const owner = await client.authenticateEmail(`chatm_${Date.now()}@t.local`, "Passw0rd!123", true);
sql(
  `INSERT INTO poker_subscription (user_id,tier,status) VALUES ('${owner.user_id}','platinum','active') ON CONFLICT (user_id) DO UPDATE SET tier='platinum', status='active'`,
);
sql(
  `INSERT INTO poker_global_wallet (user_id,balance) VALUES ('${owner.user_id}',5000000) ON CONFLICT (user_id) DO UPDATE SET balance=5000000`,
);
const club = await rpc(owner, "club_create", {
  name: `ChatMeasure ${Date.now()}`,
  slug: `cm${Date.now()}`,
});
const clubId = club?.club?.id ?? club?.id;
console.log(`club ${clubId}`);

// ------------------------------------------------------------------- rendering
const b = await pw.chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  headless: true,
  args: [
    "--enable-unsafe-swiftshader",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--no-proxy-server",
  ],
});
const ctx = await b.newContext({ viewport: { width: 1500, height: 1100 }, deviceScaleFactor: 1 });
await ctx.addInitScript(
  ({ token, refresh, uid, uname }) => {
    try {
      localStorage.setItem("hrc.age.ok", "1");
      localStorage.setItem(
        "png-nakama-session",
        JSON.stringify({ token, refresh_token: refresh, user_id: uid, username: uname }),
      );
      localStorage.setItem("png-auth-method", "email");
    } catch {
      /* ignore */
    }
  },
  { token: owner.token, refresh: owner.refresh_token, uid: owner.user_id, uname: owner.username },
);

// Count every club_chat_list the page issues, so the request volume is measured
// rather than inferred from reading setInterval.
let listCalls = 0;
// Direct evidence that the renewal path RAN. "identity unchanged" alone could
// just mean the token never expired during the window.
let refreshCalls = 0;
let refreshFailures = 0;
const refreshAt = [];
ctx.on("response", (r) => {
  if (!r.url().includes("/session/refresh")) return;
  refreshCalls += 1;
  refreshAt.push(Date.now());
  if (r.status() >= 400) refreshFailures += 1;
});
const listPayloads = new Set();
ctx.on("request", (r) => {
  if (!r.url().includes("club_chat_list")) return;
  listCalls += 1;
  // Record WHICH club the page polls. A page that polls a different club than
  // the message was posted to looks identical to a page that never polls.
  try {
    const u = new URL(r.url());
    listPayloads.add(u.searchParams.get("payload") ?? r.postData() ?? u.search);
  } catch {
    /* ignore */
  }
});

/**
 * Open `path`, let it settle, then publish a message the page did NOT send and
 * watch the DOM for it. Returns ms-to-appear, or null if it never arrived.
 */
async function measure(path, label, settleMs, tab) {
  const p = await ctx.newPage();
  const open = async () => {
    await p.goto(`http://localhost:3000${path}`, { waitUntil: "domcontentloaded", timeout: 180000 });
    await p.waitForTimeout(settleMs);
    // /tournaments opens on the LOBBY tab; the Owner Center chat rail is behind
    // "Tournament Center". The first run of this script measured the unmounted
    // component and reported "NEVER" — a result about nothing.
    if (tab) {
      const clicked = await p.evaluate((t) => {
        const el = [...document.querySelectorAll("button,a,[role=tab]")].find((e) =>
          new RegExp(t, "i").test(e.textContent || ""),
        );
        if (!el) return false;
        el.click();
        return true;
      }, tab);
      if (!clicked) throw new Error(`${label}: tab "${tab}" not found — cannot measure it`);
      await p.waitForTimeout(settleMs);
    }
  };
  await open();

  const marker = `PROBE-${Date.now()}`;
  listCalls = 0;
  const windowStart = Date.now();
  await publish(marker);
  const sentAt = Date.now();

  const watch = async (m, from) => {
    while (Date.now() - from < WATCH_MS) {
      if (await p.evaluate((x) => document.body.innerText.includes(x), m)) return Date.now() - from;
      await p.waitForTimeout(50); // fine-grained: 250ms buckets hid the distribution
    }
    return null;
  };
  const sawMs = await watch(marker, sentAt);
  const sawAt = sawMs === null ? null : sentAt + sawMs;

  // One sample cannot tell a fast poll from a lucky one. Take more, spaced wider
  // than the interval so they are independent.
  // Identity has to be read alongside every sample. ensureSession() does not use
  // the refresh token — on expiry it authenticates a NEW anonymous device account
  // — so a page silently stops being the club owner and every club RPC 403s.
  // Without this, those 403s read as "the transport lost the message".
  const who = () =>
    p.evaluate(() => {
      try {
        const v = JSON.parse(localStorage.getItem("png-nakama-session") || "{}");
        return v.user_id ?? null;
      } catch {
        return null;
      }
    });
  const extra = [];
  for (let i = 0; i < (Number(process.env.SAMPLES) || 0); i += 1) {
    await p.waitForTimeout(7000);
    const m2 = `SAMPLE-${i}-${Date.now()}`;
    const at = Date.now();
    await publish(m2);
    const got = await watch(m2, at);
    const stillOwner = (await who()) === owner.user_id;
    extra.push({ ms: got, stillOwner });
    console.log(
      `      sample ${i}: ${got === null ? "NEVER" : got + " ms"} · identity ${stillOwner ? "still the owner" : "*** SWAPPED to a fresh anonymous device account ***"}`,
    );
  }
  const watched = Date.now() - windowStart;
  const calls = listCalls;
  const polled = [...listPayloads];
  listPayloads.clear();

  // Prove the message really is on the server, so "never appeared" can only mean
  // the page never asked — not that the send failed.
  const hist = await client.listChannelMessages(owner, pubChannel.id, 20, false);
  const onServer = (hist.messages ?? []).some((m) => {
    try {
      const c = typeof m.content === "string" ? JSON.parse(m.content) : m.content ?? {};
      return c.text === marker;
    } catch {
      return false;
    }
  });

  // And prove a reload picks it up, which distinguishes "stale until reload"
  // from "broken".
  // On a miss, dump what the chat panel actually held. "NEVER" with no evidence
  // of what was on screen is how a harness bug gets reported as a product bug.
  const panelText = await p.evaluate(() => {
    const head = [...document.querySelectorAll("p,h2,h3")].find((e) =>
      /Club Chat|Club Activity/i.test(e.textContent || ""),
    );
    return (head?.parentElement?.innerText || "NO PANEL FOUND").replace(/\s+/g, " ").slice(0, 300);
  });

  await open();
  const afterReload = await p.evaluate((m) => document.body.innerText.includes(m), marker);
  await p.screenshot({ path: `${SHOTS}/chat-${label}.png` });
  await p.close();

  return {
    label,
    path,
    ms: sawAt ? sawAt - sentAt : null,
    onServer,
    afterReload,
    listCalls: calls,
    watchedMs: watched,
    polled,
    panelText,
    extra,
  };
}

const results = [];
for (const [path, label, tab] of [
  ["/clubs", "ownerhub", null],
  ["/tournaments", "ownercenter", "Tournament Center"],
].filter(([, label]) => !process.env.ONLY || process.env.ONLY === label)) {
  const r = await measure(path, label, 20000, tab);
  console.log(
    `  measured ${path}: ${r.ms === null ? "NEVER" : `${r.ms} ms`} (on server ${r.onServer}, after reload ${r.afterReload}, ${r.listCalls} list calls)`,
  );
  if (r.polled.length) console.log(`    polled: ${r.polled.join(" | ").slice(0, 200)}`);
  console.log(`    panel held: ${r.panelText}`);
  console.log(
    `    session refreshes during run: ${refreshCalls} (${refreshFailures} failed) — 0 would mean the token never expired, so identity stability proves nothing`,
  );
  if (refreshAt.length > 1) {
    const gaps = refreshAt.slice(1).map((t, i) => Math.round((t - refreshAt[i]) / 100) / 10);
    console.log(`    refresh gaps (s): ${gaps.slice(0, 24).join(", ")}`);
  }
  refreshCalls = 0;
  refreshFailures = 0;
  refreshAt.length = 0;
  results.push(r);
}
await b.close();

// ----------------------------------------------- C: the match socket, at the wire
const pA = await client.authenticateEmail(`ca_${Date.now()}@t.local`, "Passw0rd!123", true);
const pB = await client.authenticateEmail(`cb_${Date.now()}@t.local`, "Passw0rd!123", true);
for (const u of [pA, pB]) {
  sql(
    `INSERT INTO poker_subscription (user_id,tier,status) VALUES ('${u.user_id}','platinum','active') ON CONFLICT (user_id) DO UPDATE SET tier='platinum', status='active'`,
  );
  sql(
    `INSERT INTO poker_global_wallet (user_id,balance) VALUES ('${u.user_id}',5000000) ON CONFLICT (user_id) DO UPDATE SET balance=5000000`,
  );
}
// Every table must be club-hosted, so player A brings their own club.
const clubA = await rpc(pA, "club_create", { name: `WireA ${Date.now()}`, slug: `wa${Date.now()}` });
const t = await rpc(pA, "table_create", {
  club_id: clubA?.club?.id ?? clubA?.id,
  small_blind: 100,
  big_blind: 200,
  max_seats: 6,
  access_type: "public",
  allow_spectators: true,
  stake_mode: "play",
});
const matchId = t?.match_id ?? t?.table?.match_id;

const sockA = client.createSocket(false, false);
const sockB = client.createSocket(false, false);
await sockA.connect(pA, true);
await sockB.connect(pB, true);
await sockA.joinMatch(matchId);
await sockB.joinMatch(matchId);
await new Promise((r) => setTimeout(r, 1500));

const samples = [];
let pending = null;
sockB.onmatchdata = (md) => {
  if (md.op_code !== OP_CHAT || !pending) return;
  let body = {};
  try {
    body = JSON.parse(new TextDecoder().decode(md.data));
  } catch {
    return;
  }
  if (body.text === pending.marker) {
    samples.push(Date.now() - pending.at);
    pending = null;
  }
};
for (let i = 0; i < 10; i += 1) {
  const marker = `WIRE-${i}-${Date.now()}`;
  pending = { marker, at: Date.now() };
  await sockA.sendMatchState(matchId, OP_CHAT_SEND, JSON.stringify({ text: marker }));
  const deadline = Date.now() + 5000;
  while (pending && Date.now() < deadline) await new Promise((r) => setTimeout(r, 10));
}
await sockA.disconnect(false);
await sockB.disconnect(false);

// ------------------------------------------------------------------- report
console.log("\n═══ RECEIVE LATENCY — message published out of band ═══\n");
for (const r of results) {
  const shown = r.ms === null ? `NEVER (watched ${Math.round(r.watchedMs / 1000)}s)` : `${r.ms} ms`;
  console.log(`  ${r.path.padEnd(14)} ${r.label.padEnd(12)} ${shown}`);
  console.log(
    `  ${"".padEnd(14)} ${"".padEnd(12)} on server: ${r.onServer} · visible after reload: ${r.afterReload} · club_chat_list calls while watching: ${r.listCalls}`,
  );
}
const avg = samples.length ? Math.round(samples.reduce((a, c) => a + c, 0) / samples.length) : null;
console.log(
  `\n  match socket   OpChat       ${avg === null ? "no samples" : `${avg} ms avg over ${samples.length} (min ${Math.min(...samples)}, max ${Math.max(...samples)})`}`,
);
console.log("  (wire A→B, not DOM — see header)");

console.log("\n═══ POLL COST AT SCALE — from the measured call rate ═══\n");
for (const r of results) {
  const perMin = r.watchedMs > 0 ? (r.listCalls / (r.watchedMs / 60000)) : 0;
  console.log(`  ${r.path.padEnd(14)} ${perMin.toFixed(1)} club_chat_list/min per open page`);
  for (const n of [50, 500]) {
    console.log(
      `  ${"".padEnd(14)}   ${n} operators online -> ${Math.round(perMin * n).toLocaleString()} queries/min`,
    );
  }
}
console.log("");
