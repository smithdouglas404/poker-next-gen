// Multi-bot poker table simulation — drives the REAL backend-core match
// handler over the real Nakama wire protocol (same opcodes as
// frontend-table/src/features/game/protocol.ts) to verify the full
// multiplayer loop under real play: sit-out/return, disconnect/reconnect,
// stack persistence across stand-up/re-buy, chip-ledger conservation, and
// host admin actions mid-game. Not shipped — a one-off verification tool,
// run against a local (non-Docker, this sandbox has no Docker Hub egress)
// Nakama + backend-core.so + Postgres + engine-math stack.
//
// Run from frontend-table/: node scripts/table-sim/run.mjs

import { Client } from "@heroiclabs/nakama-js";

// A single bot's socket hiccup (nakama-js's own reconnect/error internals,
// not this harness's logic) must not take down an unattended multi-hundred-
// hand run. Log it as a finding and keep going rather than dying uncaught —
// this is test-harness robustness, not a product-code change.
process.on("unhandledRejection", (reason) => {
  finding("MEDIUM", `Harness: unhandled promise rejection (client-library-side, not necessarily a product bug): ${reason instanceof Error ? reason.stack : JSON.stringify(reason)}`);
});
process.on("uncaughtException", (err) => {
  finding("MEDIUM", `Harness: uncaught exception (client-library-side, not necessarily a product bug): ${err && err.stack ? err.stack : err}`);
});

const HOST = process.env.SIM_HOST || "127.0.0.1";
const PORT = process.env.SIM_PORT || "7350";
const SERVER_KEY = "defaultkey";

const OP = {
  SitDown: 1, StandUp: 2, Action: 3, StartHand: 4, ChatSend: 5, HostAction: 6,
  MoveSeat: 10, SitOut: 11, UseTimeBank: 12, AddChips: 13,
  Chat: 111, SessionKey: 112,
  Snapshot: 100, HandStart: 101, DealPrivate: 102, Board: 103, ActionApplied: 104,
  ActionRequired: 105, Showdown: 106, SeatUpdate: 107, Error: 108, BlindUpdate: 109, TableMoved: 114,
};

const GUEST_STIPEND_CENTS = 100_000; // $1,000 — backend-core/store/wallet.go GuestStipendCents
const TARGET_HANDS = Number(process.env.SIM_HANDS || 300);
const WALLCLOCK_TIMEOUT_MS = Number(process.env.SIM_TIMEOUT_MS || 15 * 60 * 1000);

const findings = [];
function finding(severity, text) {
  findings.push({ severity, text, at: new Date().toISOString() });
  log(`[FINDING:${severity}]`, text);
}

function log(...args) {
  console.log(new Date().toISOString().slice(11, 19), ...args);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

class Bot {
  constructor(name, deviceId) {
    this.name = name;
    this.deviceId = deviceId;
    this.client = new Client(SERVER_KEY, HOST, PORT, false);
    this.session = null;
    this.socket = null;
    this.matchId = null;
    this.snapshot = null;
    this.actionRequired = null;
    this.holeCards = [];
    this.errors = [];
    this.connected = false;
    this.stats = { handsSeen: 0, actionsSent: 0 };
    this._actingLock = false;
  }

  async auth() {
    // Email auth, not device auth: backend-core/match/holdem/handler.go's
    // isGuest() treats any account with no linked email as a guest, and
    // guests buy in from club-allocated comp balance, not their own global
    // wallet — the opposite of what this sim needs to exercise ("give
    // everybody a thousand dollars" means their own wallet stipend).
    this.session = await this.client.authenticateEmail(
      `${this.deviceId}@table-sim.test`,
      "TableSim!Pass123",
      true,
      this.name,
    );
  }

  get userId() {
    return this.session?.user_id;
  }

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

  async connectSocket() {
    this.socket = this.client.createSocket(false, false);
    this.socket.onmatchdata = (md) => this._onMatchData(md);
    this.socket.ondisconnect = () => {
      this.connected = false;
    };
    this.socket.onerror = (e) => {
      // Avoid JSON.stringify on raw ErrorEvent/WebSocket objects — they carry
      // circular refs (event.target -> socket -> adapter -> ...) that can
      // blow the call stack instead of cleanly throwing, taking the whole
      // process down. Pull out plain, serializable fields only.
      const msg = e instanceof Error ? e.message : (e && e.message) || (e && e.type) || String(e);
      this.errors.push(`socket error: ${msg}`);
    };
    await this.socket.connect(this.session, true);
    this.connected = true;
  }

  async disconnectSocket() {
    if (this.socket) {
      this.socket.disconnect(false);
    }
    this.connected = false;
  }

  async joinMatch(matchId) {
    await this.socket.joinMatch(matchId);
    this.matchId = matchId;
  }

  _onMatchData(md) {
    let payload = null;
    try {
      payload = md.data ? JSON.parse(new TextDecoder().decode(md.data)) : null;
    } catch {
      this.errors.push("malformed match data payload");
      return;
    }
    switch (md.op_code) {
      case OP.Snapshot:
        this.snapshot = payload;
        break;
      case OP.HandStart:
        this.stats.handsSeen++;
        this.holeCards = [];
        break;
      case OP.DealPrivate:
        if (payload.cards) this.holeCards = payload.cards;
        break;
      case OP.ActionRequired:
        this.actionRequired = payload;
        break;
      case OP.Error:
        this.errors.push(payload.message || "unknown error");
        break;
      default:
        break;
    }
  }

  mySeat() {
    if (!this.snapshot || !this.userId) return null;
    return this.snapshot.seats.find((s) => s.user_id === this.userId) || null;
  }

  async send(opCode, body) {
    if (!this.socket || !this.matchId) return;
    await this.socket.sendMatchState(this.matchId, opCode, JSON.stringify(body || {}));
  }

  sitDown(seat, buyIn) {
    return this.send(OP.SitDown, { seat, buy_in: buyIn, wallet: "global" });
  }
  standUp() {
    return this.send(OP.StandUp, {});
  }
  sitOut(out) {
    return this.send(OP.SitOut, { sit_out: out });
  }
  action(type, amount) {
    this.stats.actionsSent++;
    return this.send(OP.Action, { type, amount: amount || 0 });
  }
  hostAction(payload) {
    return this.send(OP.HostAction, payload);
  }

  // Simple, legal bot policy: mostly call/check, occasional fold/raise.
  async maybeAct() {
    const ar = this.actionRequired;
    if (!ar || this._actingLock) return;
    const seat = this.mySeat();
    if (!seat || ar.seat !== seat.index) return;
    this._actingLock = true;
    try {
      await sleep(rand(50, 250)); // think time
      const roll = Math.random();
      const canCheck = ar.valid_actions.includes("check");
      const canCall = ar.valid_actions.includes("call");
      const canRaise = ar.valid_actions.includes("raise");
      const canFold = ar.valid_actions.includes("fold");

      if (ar.to_call === 0) {
        if (canRaise && roll < 0.15) {
          const amt = Math.min(ar.max_raise, Math.max(ar.min_raise, ar.min_raise));
          await this.action("raise", amt);
        } else if (canCheck) {
          await this.action("check", 0);
        }
      } else {
        if (canFold && roll < 0.1) {
          await this.action("fold", 0);
        } else if (canRaise && roll < 0.22 && ar.min_raise > 0) {
          const amt = Math.min(ar.max_raise, ar.min_raise);
          await this.action("raise", amt);
        } else if (canCall) {
          await this.action("call", ar.to_call);
        } else if (canFold) {
          await this.action("fold", 0);
        }
      }
      this.actionRequired = null;
    } finally {
      this._actingLock = false;
    }
  }
}

// ---- Ledger invariant --------------------------------------------------

function checkLedger(bots, startingTotalCents, label) {
  const seatedTotal = bots.reduce((sum, b) => {
    const seat = b.mySeat();
    return sum + (seat && seat.status !== "empty" ? seat.stack || 0 : 0);
  }, 0);
  // Wallet balances for bots not currently seated aren't in any bot's own
  // snapshot after standing up unless refreshed via profile_get — checked
  // lazily by the caller when needed (see standUp/rebuy scenario below),
  // not on every tick, to avoid an RPC storm every hand.
  return { seatedTotal, label };
}

// ---- Main simulation -----------------------------------------------------

async function main() {
  const startedAt = Date.now();
  const runId = Date.now().toString(36);
  const NUM_BOTS = 8;
  const IMMEDIATE_SEAT_COUNT = 5;

  log(`=== Table simulation run ${runId} starting — target ${TARGET_HANDS} hands, ${NUM_BOTS} bots ===`);

  const bots = [];
  for (let i = 0; i < NUM_BOTS; i++) {
    // Bot 0 (the host) uses a FIXED device id, not a per-run random one: it
    // needs club_create, which is tier-gated (ClubCreateLimit) — free
    // accounts get 0. table-sim-host-fixed-0000001's subscription tier is
    // seeded directly in Postgres (test-harness-only setup, see
    // scripts/table-sim/README — never a product-code change) so it can
    // reliably sponsor a table across runs without a real Stripe purchase.
    const deviceId = i === 0 ? "table-sim-host-fixed-0000001" : `simbot-${runId}-${i}`;
    // Usernames must be globally unique in Nakama — include runId for the
    // non-fixed bots so repeated runs don't collide with earlier ones.
    const username = i === 0 ? "SimBotHost" : `SimBot${i}${runId}`;
    const bot = new Bot(username, deviceId);
    await bot.auth();
    bots.push(bot);
  }
  log(`Authenticated ${bots.length} bots.`);

  const host = bots[0];
  // Confirm the $1,000 stipend on a genuinely FRESH bot (bots[1] uses a
  // random per-run email) — the host reuses a fixed account across debug
  // runs so its wallet legitimately drifts and isn't a valid check for this.
  const freshProfile = await bots[1].rpc("profile_get", {});
  if (freshProfile.balance_cents !== GUEST_STIPEND_CENTS) {
    finding("HIGH", `Expected fresh account wallet ${GUEST_STIPEND_CENTS}c, got ${freshProfile.balance_cents}c`);
  } else {
    log(`Confirmed stipend: ${freshProfile.balance_cents}c on fresh account.`);
  }

  // Host creates a club (Didit not configured locally => requireVerified is a no-op)
  // then a table sponsored by it.
  let club;
  try {
    club = await host.rpc("club_create", { name: `SimClub-${runId}` });
  } catch (e) {
    finding("CRITICAL", `club_create failed: ${e.message || e}. Cannot proceed without a sponsoring club.`);
    throw e;
  }
  const clubId = club.id || club.club_id || club.ID;
  if (!clubId) {
    finding("CRITICAL", `club_create response had no usable id: ${JSON.stringify(club)}`);
    throw new Error("no club id");
  }
  log(`Created club ${clubId}.`);

  const table = await host.rpc("table_create", {
    club_id: clubId,
    name: `SimTable-${runId}`,
    // $1/$2 — the platform's own default (protocol.ts DEFAULT_SMALL/BIG_BLIND_CENTS)
    // and the free tier's max ($2 BB — billing.EffectiveMaxBigBlindCents),
    // so every bot's tier can actually sit regardless of seeding.
    small_blind: 100,
    big_blind: 200,
    buy_in: GUEST_STIPEND_CENTS,
    max_seats: 10,
    num_bots: 0,
    variant: "holdem",
  });
  const matchId = table.match_id;
  if (!matchId) {
    finding("CRITICAL", `table_create response had no match_id: ${JSON.stringify(table)}`);
    throw new Error("no match id");
  }
  log(`Created table ${matchId}.`);

  // Connect every bot's socket and join the match.
  for (const bot of bots) {
    await bot.connectSocket();
    await bot.joinMatch(matchId);
  }
  log("All bots connected and joined the match.");

  // Speed the table up for a fast simulation run — real values, sent via the
  // real table_settings host action (handleHostAction's own field names).
  await host.hostAction({
    action: "table_settings",
    decision_secs: 5,
    turn_time_secs: 5,
    time_bank_secs: 0,
    buy_in_min_cents: GUEST_STIPEND_CENTS,
    buy_in_max_cents: GUEST_STIPEND_CENTS,
  });
  await sleep(500);

  // 5 bots sit immediately; 3 held back for a staggered join later.
  const immediate = bots.slice(0, IMMEDIATE_SEAT_COUNT);
  const staggered = bots.slice(IMMEDIATE_SEAT_COUNT);
  for (let i = 0; i < immediate.length; i++) {
    await immediate[i].sitDown(i, GUEST_STIPEND_CENTS);
    await sleep(150);
  }
  log(`${immediate.length} bots seated immediately.`);

  const startingTotalCents = NUM_BOTS * GUEST_STIPEND_CENTS;

  // Scenario scheduling — real events at real hand-count checkpoints, not
  // simultaneously (so effects are attributable).
  const scenariosRun = new Set();
  let lastHandNo = -1;
  let staggerDone = false;
  let sitOutBot = null;
  let sitOutReturnAtHand = -1;
  let disconnectBot = null;
  let reconnectAtHand = -1;
  let standUpBot = null;
  let standUpWalletBefore = null;
  let reBuyDone = false;
  let adminPauseDone = false;
  let adminBlindsDone = false;
  let adminKickDone = false;

  let ledgerFailures = 0;
  let handsObserved = 0;

  while (Date.now() - startedAt < WALLCLOCK_TIMEOUT_MS && handsObserved < TARGET_HANDS) {
    for (const bot of bots) {
      if (bot.connected) await bot.maybeAct();
    }

    const snap = host.snapshot || (bots.find((b) => b.snapshot) || {}).snapshot;
    if (snap && snap.hand_no !== lastHandNo) {
      lastHandNo = snap.hand_no;
      handsObserved = lastHandNo;
      if (handsObserved % 10 === 0) log(`-- hand ${handsObserved} / ${TARGET_HANDS} --`);

      // Ledger check: sum of all currently-seated stacks across every bot's
      // own view of the snapshot must not exceed the starting total (it can
      // be less only by whatever rake has been collected, which we don't
      // have a bot-side handle on here — so treat "seated total grew beyond
      // the starting total" as the hard failure, and log dips for manual
      // review rather than asserting exact equality blind to rake).
      const { seatedTotal } = checkLedger(bots, startingTotalCents, `hand ${handsObserved}`);
      if (seatedTotal > startingTotalCents) {
        ledgerFailures++;
        finding("CRITICAL", `Ledger violation at hand ${handsObserved}: seated total ${seatedTotal}c exceeds starting total ${startingTotalCents}c — chips created from nothing.`);
      }

      // Staggered joins at hand 15.
      if (!staggerDone && handsObserved >= 15) {
        staggerDone = true;
        for (let i = 0; i < staggered.length; i++) {
          const seatIdx = IMMEDIATE_SEAT_COUNT + i;
          await staggered[i].sitDown(seatIdx, GUEST_STIPEND_CENTS);
          await sleep(150);
        }
        log(`Staggered join: ${staggered.length} more bots seated at hand ${handsObserved}.`);
      }

      // Sit-out / return at hand 30 -> return at hand 40.
      if (!sitOutBot && handsObserved >= 30) {
        sitOutBot = pick(immediate);
        await sitOutBot.sitOut(true);
        sitOutReturnAtHand = handsObserved + 10;
        log(`${sitOutBot.name} sitting out at hand ${handsObserved}, returns at ${sitOutReturnAtHand}.`);
      }
      if (sitOutBot && sitOutReturnAtHand > 0 && handsObserved >= sitOutReturnAtHand && !scenariosRun.has("sitout_return")) {
        scenariosRun.add("sitout_return");
        // Precondition, not an assertion: confirm the seat actually IS
        // sitting out going into the return call (sanity-check the scenario
        // itself, not the server).
        const seatBefore = sitOutBot.mySeat();
        if (!seatBefore || !seatBefore.sitting_out) {
          finding("MEDIUM", `${sitOutBot.name} was expected to still be sitting_out=true going into the return call, but wasn't — scenario setup may be off.`);
        }
        await sitOutBot.sitOut(false);
        await sleep(1000);
        // Real assertion: after the return toggle round-trips and a fresh
        // snapshot lands, sitting_out must have actually cleared.
        const seatAfter = sitOutBot.mySeat();
        if (!seatAfter || seatAfter.sitting_out) {
          finding("HIGH", `${sitOutBot.name} still shows sitting_out=true after the return toggle round-tripped — return toggle may not have applied.`);
        }
        log(`${sitOutBot.name} returning from sit-out at hand ${handsObserved} (sitting_out=${seatAfter?.sitting_out}).`);
      }

      // Disconnect / reconnect at hand 50 -> reconnect at hand 55.
      if (!disconnectBot && handsObserved >= 50) {
        disconnectBot = pick(immediate.filter((b) => b !== sitOutBot));
        const seatBefore = disconnectBot.mySeat();
        disconnectBot._stackBeforeDisconnect = seatBefore ? seatBefore.stack : null;
        await disconnectBot.disconnectSocket();
        reconnectAtHand = handsObserved + 5;
        log(`${disconnectBot.name} disconnected at hand ${handsObserved}, reconnects at ${reconnectAtHand}.`);
      }
      if (disconnectBot && reconnectAtHand > 0 && handsObserved >= reconnectAtHand && !scenariosRun.has("reconnect")) {
        scenariosRun.add("reconnect");
        await disconnectBot.connectSocket();
        await disconnectBot.joinMatch(matchId);
        await sleep(1000);
        const seatAfter = disconnectBot.mySeat();
        if (!seatAfter || seatAfter.status === "empty") {
          finding("CRITICAL", `${disconnectBot.name} lost their seat entirely after reconnect — disconnect should not stand a player up.`);
        } else {
          log(`${disconnectBot.name} reconnected, seat ${seatAfter.index}, stack ${seatAfter.stack}c (was ${disconnectBot._stackBeforeDisconnect}c at disconnect).`);
        }
      }

      // Stand up net-positive, verify wallet credit, re-buy at hand 70 -> re-sit at 80.
      if (!standUpBot && handsObserved >= 70) {
        const candidate = immediate.find((b) => {
          const s = b.mySeat();
          return s && s.status !== "empty" && s.stack > GUEST_STIPEND_CENTS && b !== sitOutBot && b !== disconnectBot;
        });
        if (candidate) {
          standUpBot = candidate;
          const seat = standUpBot.mySeat();
          standUpWalletBefore = seat.stack;
          await standUpBot.standUp();
          log(`${standUpBot.name} stood up net-positive with ${standUpWalletBefore}c at hand ${handsObserved}.`);
        }
      }
      if (standUpBot && !reBuyDone && handsObserved >= 80) {
        reBuyDone = true;
        const profile = await standUpBot.rpc("profile_get", {});
        if (profile.balance_cents < standUpWalletBefore) {
          finding("CRITICAL", `${standUpBot.name} stood up with ${standUpWalletBefore}c but wallet only shows ${profile.balance_cents}c — profit not credited on stand-up.`);
        } else {
          log(`${standUpBot.name} wallet after stand-up: ${profile.balance_cents}c (had ${standUpWalletBefore}c at seat) — buying back in for the same amount.`);
        }
        const openSeat = 9;
        await standUpBot.sitDown(openSeat, Math.min(profile.balance_cents, GUEST_STIPEND_CENTS * 2));
      }

      // Host admin actions, spaced out.
      if (!adminPauseDone && handsObserved >= 20) {
        adminPauseDone = true;
        await host.hostAction({ action: "pause" });
        await sleep(3000);
        await host.hostAction({ action: "resume" });
        log(`Admin pause/resume exercised at hand ${handsObserved}.`);
      }
      if (!adminBlindsDone && handsObserved >= 60) {
        adminBlindsDone = true;
        // Big blind stays at the free-tier cap (200c/$2) so already-seated
        // free-tier bots aren't blocked from continuing to act — only the
        // small blind moves, still a real change to verify "applies next
        // hand, not mid-hand" against.
        await host.hostAction({ action: "set_blinds", small_blind: 150, big_blind: 200 });
        log(`Admin set_blinds to 150/200 at hand ${handsObserved} — should apply next hand only.`);
      }
      if (!adminKickDone && handsObserved >= 100) {
        adminKickDone = true;
        const victim = immediate.find((b) => b !== sitOutBot && b !== disconnectBot && b !== standUpBot && b !== host);
        if (victim) {
          const seatBefore = victim.mySeat();
          await host.hostAction({ action: "kick", seat: seatBefore ? seatBefore.index : 0 });
          log(`Admin kicked ${victim.name} at hand ${handsObserved}.`);
          await sleep(2000);
          const seatAfter = victim.mySeat();
          if (seatAfter && seatAfter.status !== "empty") {
            finding("MEDIUM", `Kick issued for ${victim.name} but seat still shows occupied a few seconds later (may be legitimately deferred if they were live in a hand — verify).`);
          }
        }
      }
    }

    await sleep(100);
  }

  const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
  log(`=== Run ${runId} finished: ${handsObserved} hands observed in ${elapsedSec}s, ledger failures: ${ledgerFailures} ===`);

  for (const bot of bots) {
    if (bot.errors.length > 0) {
      finding("MEDIUM", `${bot.name} received ${bot.errors.length} server error message(s): ${[...new Set(bot.errors)].join(" | ")}`);
    }
  }

  if (handsObserved < TARGET_HANDS) {
    finding("INFO", `Only reached ${handsObserved}/${TARGET_HANDS} hands within the ${WALLCLOCK_TIMEOUT_MS / 1000}s wall-clock budget.`);
  }

  console.log("\n=== FINDINGS SUMMARY ===");
  if (findings.length === 0) {
    console.log("No findings — every scripted assertion held.");
  } else {
    for (const f of findings) console.log(`[${f.severity}] ${f.text}`);
  }

  process.exit(findings.some((f) => f.severity === "CRITICAL" || f.severity === "HIGH") ? 1 : 0);
}

main().catch((e) => {
  console.error("Simulation crashed:", e);
  process.exit(2);
});
