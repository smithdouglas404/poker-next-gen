// Minimal, self-contained achievement smoke test. club_create/table_create
// need a subscription tier (free accounts get 0 ClubCreateLimit) — reuse the
// SAME pre-provisioned "table-sim-host-fixed-0000001" account run.mjs relies
// on for that (its tier was granted out-of-band in an earlier session). That
// account's global wallet is drained from many past sim runs, so unlike
// run.mjs it never attempts to SIT — it only creates the club/table and fires
// hostAction. Three FRESH bots (guaranteed-funded $1,000 stipend) do the
// actual sitting/playing so seat 0 is never left in a half-initialized state.
import { Client } from "@heroiclabs/nakama-js";

const HOST = "127.0.0.1";
const PORT = "7350";
const SERVER_KEY = "defaultkey";
const OP = {
  SitDown: 1, StandUp: 2, Action: 3, StartHand: 4, ChatSend: 5, HostAction: 6,
  Snapshot: 100, ActionRequired: 105, Showdown: 106, Error: 108,
};
const STIPEND = 100_000;
const runId = "achv" + Math.floor(Math.random() * 1e9).toString(36);

function log(...a) { console.log(new Date().toISOString().slice(11, 19), ...a); }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

class Bot {
  constructor(name, email, password) {
    this.name = name;
    this.email = email || `${name}@${runId}.test`;
    this.password = password || "AchvTest!Pass123";
    this.client = new Client(SERVER_KEY, HOST, PORT, false);
    this.snapshot = null;
    this.actionRequired = null;
  }
  async auth() {
    this.session = await this.client.authenticateEmail(this.email, this.password, true, this.name);
  }
  get userId() { return this.session.user_id; }
  async rpc(id, payload) {
    try {
      const res = await this.client.rpc(this.session, id, payload || {});
      return res.payload || {};
    } catch (e) {
      if (e && typeof e.json === "function") {
        const body = await e.json().catch(() => null);
        throw new Error(`${id} -> HTTP ${e.status}: ${body ? JSON.stringify(body) : "(no body)"}`);
      }
      throw e;
    }
  }
  async connect(matchId) {
    this.socket = this.client.createSocket(false, false);
    this.socket.onmatchdata = (md) => this._onData(md);
    await this.socket.connect(this.session, true);
    await this.socket.joinMatch(matchId);
    this.matchId = matchId;
  }
  _onData(md) {
    let p; try { p = md.data ? JSON.parse(new TextDecoder().decode(md.data)) : null; } catch { return; }
    if (md.op_code === OP.Snapshot) this.snapshot = p;
    if (md.op_code === OP.ActionRequired) this.actionRequired = p;
    if (md.op_code === OP.Showdown) log(`  [showdown] pot=${p.pot} winners=${JSON.stringify(p.winners)}`);
    if (md.op_code === OP.Error) log(`  [error:${this.name}]`, p.code, p.message);
  }
  async send(op, data) {
    await this.socket.sendMatchState(this.matchId, op, JSON.stringify(data || {}));
  }
  sitDown(seat) { return this.send(OP.SitDown, { seat, buy_in: STIPEND, wallet: "global" }); }
  startHand() { return this.send(OP.StartHand, {}); }
  hostAction(payload) { return this.send(OP.HostAction, payload); }
  chat(t) { return this.send(OP.ChatSend, { text: t }); }
  async maybeAct() {
    const ar = this.actionRequired;
    if (!ar || ar.seat === undefined) return;
    const seat = this.snapshot?.seats?.find((s) => s.user_id === this.userId);
    if (!seat || ar.seat !== seat.index) return;
    this.actionRequired = null; // consume once
    const legal = ar.valid_actions || [];
    // Simple, legal, always-progresses-the-hand policy: check when free,
    // otherwise call — same real ::type/amount protocol run.mjs uses.
    if (legal.includes("check")) return this.send(OP.Action, { type: "check", amount: 0 });
    if (legal.includes("call")) return this.send(OP.Action, { type: "call", amount: 0 });
    if (legal.includes("raise") && ar.min_raise > 0) return this.send(OP.Action, { type: "raise", amount: ar.min_raise });
    return this.send(OP.Action, { type: legal[0] || "fold", amount: 0 });
  }
}

async function main() {
  // Pre-provisioned, club-create-capable account — never seated, so its
  // drained wallet is irrelevant here.
  const host = new Bot("SimBotHost", "table-sim-host-fixed-0000001@table-sim.test", "TableSim!Pass123");
  const players = [new Bot(`AchvA${runId}`), new Bot(`AchvB${runId}`), new Bot(`AchvC${runId}`)];
  await host.auth();
  for (const b of players) await b.auth();
  log("Host:", host.userId);
  log("3 fresh players:", players.map((b) => b.userId).join(", "));

  const club = await host.rpc("club_create", { name: `AchvClub-${runId}` });
  const clubId = club.id || club.club_id;
  log("club:", clubId);

  const table = await host.rpc("table_create", {
    club_id: clubId, name: `AchvTable-${runId}`,
    small_blind: 100, big_blind: 200, buy_in: STIPEND, max_seats: 6, num_bots: 0, variant: "holdem",
  });
  const matchId = table.match_id;
  log("table:", matchId);

  await host.connect(matchId);
  for (const b of players) await b.connect(matchId);
  await sleep(300);

  await host.hostAction({ action: "table_settings", decision_secs: 5, turn_time_secs: 5, time_bank_secs: 0 }).catch(() => {});

  for (let i = 0; i < players.length; i++) {
    await players[i].sitDown(i);
    await sleep(200);
  }
  log("All 3 fresh players seated (host stays a spectator — never sits).");
  await sleep(500);

  // Hands auto-start once >=2 are seated (autoStartHand in handler.go) — no
  // explicit StartHand needed. Just keep polling actions for a while.
  const RUN_MS = 60_000;
  const deadline = Date.now() + RUN_MS;
  while (Date.now() < deadline) {
    for (const b of players) await b.maybeAct();
    await sleep(200);
  }
  log(`Ran for ${RUN_MS / 1000}s.`);
  await sleep(1000);

  for (const b of players) {
    const loyalty = await b.rpc("loyalty_get", {});
    log(`--- ${b.name} (${b.userId}) ---`);
    log(`  hrp_total=${loyalty.hrp_total}`);
    const unlocked = (loyalty.achievements || []).filter((a) => a.unlocked);
    log(`  unlocked achievements: ${unlocked.map((a) => a.code).join(", ") || "(none)"}`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
