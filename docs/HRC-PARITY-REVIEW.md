<!--
  Generated from a full read of the three design archives on `main`
  (Archive.zip / Archive 2.zip / Archive 3.zip) — 41 mockup screens, each opened
  at full size, plus a source read of HighRollersClub itself.
  Regenerate by re-reading the sources, not by editing summaries.
-->

# HRC Design-Archive Parity Review — where they are deeper, and where we are

## Context

You gave me three archives on `main` (`Archive.zip`, `Archive 2.zip`, `Archive 3.zip`) and told me
to look at every screen. I had been sampling — running their app, making contact sheets, judging
from 320px thumbnails — which is enough to see layout but not what a screen *does*. This is the
result of opening all **41 mockups** at full size.

These are **design mockups, not code.** They are the source designs behind the HRC build. That
matters: several are things HRC never shipped, so comparing "us vs their running app" was measuring
the wrong thing.

**Correction to my earlier reporting:** I previously said their live-table admin was a gap for us.
It is not — `features/table3d/TableAdminOverlay.tsx` and `features/table3d/overlays/` already
implement most of the 12 live-table mockups. The real gaps are narrower and listed below.

**Product rule that governs all of this** (from you, this session): every table is sponsored by a
club; only a paying member with sponsor capability can create one; non-members can join and play on
a fixed 1000 wallet. Mockup `detailed_private_table_setup_8` confirms it in the design itself —
the header reads **"Game Sponsor: Club Owner"** and the *Public* access type is disabled with the
tooltip **"Only Club Owners can sponsor Public Games."**

---

## The 41 screens, by area

**Folder names are misleading — classify by content, not by name.** 26 folders are called
`detailed_private_table_setup_N`, but only **one** of them (`_8`) is actually table setup. The rest
are tournaments, owner console, avatar economy and account screens. Reading the names instead of the
screens is how I under-counted tournaments on the first pass.

| Area | Count | Screens |
|---|---|---|
| Live table (in-game) | 11 | `full_body_avatar_poker_table_1…11` |
| Club-owner console | 7 | `club_owner_management_hub`, `dpts_4/5/6/7/9/24` |
| Avatar economy | 7 | `dpts_18/19/22/23/25/29/30` |
| **Tournaments** | **5** | `comprehensive_tournament_setup`, `dpts_1`, `dpts_17`, `dpts_10`, `fbapt_12` |
| Player account | 5 | `dpts_16/21/26/27/28` |
| Lobby & join | 3 | `dpts_2`, `dpts_20`, `game_mode_selection_lobby` |
| Table setup | 1 | `dpts_8` |
| Club setup | 1 | `initial_club_setup_screen` |
| Sponsorship | 1 | `dpts_3` |

---

## Screen-by-screen

Legend: **✅ built** · **◐ built but shallower** · **✗ missing**

### Live table — 12 mockups · mostly ✅

| Mockup | What it shows | Us |
|---|---|---|
| `_2` Approve new player | Username, bankroll, rarity, Approve & Seat / Decline | ✅ `ApproveNewPlayerModal` |
| `_3` Table Settings | Blinds, ante toggle+amount, turn-time slider 15–60s, buy-in range, privacy | ✅ `TableAdminOverlay` |
| `_4`,`_9` Game paused | "GAME PAUSED BY ADMIN", Resume / Quit | ✅ `GamePausedOverlay` |
| `_5` Comprehensive admin settings | Wallet & credit limits, auto-start, showdown presentation FAST/NORMAL/SLOW, deal-to-away, decision + time-bank + hands-to-fill, reveal-all, spectator | ✅ `TableAdminOverlay` |
| `_1` Final hand history log | Per-hand rows with winning hand + REPLAY per row | ✅ `ReplayScrubber` + `/hands` |
| `_8` Player game report | Net P/L, hands won/lost, biggest pot, per-hand history | ✅ `PlayerGameReportModal` |
| `_10` Kick/ban | Reason dropdown, Kick from table / Ban from club | ✅ `PlayerKickBanModal` |
| `_11` Global dashboard | Total members, active tables, volume, club activity feed | ✅ `GlobalDashboardOverlay` |
| `_12` Tournament leaderboard | Podium top-3 + ranked table, prize pool, blind level | ◐ have leaderboard, no podium |
| `_6`,`_7` Table + street scrubber | PRE-FLOP/FLOP/TURN/RIVER scrubber under the felt | ◐ replay exists, not on the live felt |

**Verdict:** this area is close to done. Two small gaps.

### Club-owner console — 10 mockups · ◐ across the board

Every mockup pairs a **left section rail + 5 KPI cards with sparklines + a tabbed centre + a right
rail (alerts / activity / chat)**. Our 9 Owner-Hub sections have the rail and the KPIs but not the
tabbed centre or the right rail.

| Mockup | Their depth | Us |
|---|---|---|
| `club_owner_management_hub` | Member table with Avatar / Name / Join Date / **Total Contribution** / Edit·Kick·Promote, paginated; header shows Total Club Bankroll + Online 128/500; Quick Stats names most-active table and top tournament | ◐ `MemberManagement` has roster + actions; no contribution column, no pagination, Quick Stats hardcoded |
| `dpts_1` Tournament Center | 5 KPIs; Live/Upcoming/Completed/**Drafts** tabs; grid of **rendered table thumbnails** with prize pool, 42/100 fill, blinds; right rail Tournament Alerts + Global Club Chat | ◐ 3 stat cards + text list. No thumbnails, no Drafts, no alerts rail |
| `dpts_5` Club Overview | 5 KPIs; Featured Tables / Upcoming Tournaments / Financial Analytics / **Player High Scores** tabs; table thumbnails; Club Activity & Chat rail | ◐ overview exists, no thumbnail grid, no chat rail |
| `dpts_10` Revenue Reports | Revenue/Profit/Rake/Fees KPIs + 30-day trend, revenue-sources donut, **detailed transaction log** with status | ✅ close — we have all of this |
| `dpts_17` Prize Pool & Tournament Analytics | Payout table (rank / % / chip value / paid ✓), payout donut, tournament progress (players remaining 94/512), Export Report + **Finalize Tournament** | ✗ **missing entirely** |
| `dpts_24` Member Analytics | Active members line, table volume bars, new-vs-returning donut, member activity table | ✅ built |
| `dpts_4` Announcement Control | Rich-text body, **live preview of the in-table modal**, target audience (All / Private tables / Tournament players), delivery style (Sleek overlay / Breaking news / Table chat blast), Broadcast Now | ◐ have composer + audience; **no live preview**, no delivery style |
| `dpts_6` Member Invite Flow | Email-or-wallet, **assign initial credit limit**, welcome-card preview, pending invitations with Status / Sent / Expiration | ◐ have invites; no credit limit on invite, no welcome-card preview, no expiry column |
| `dpts_7` Public Table Browser | Owner-side browser: stakes / game type / available seats filters, LIVE badges, 6/10 fill | ◐ player-side browser exists; no owner-side view |
| `dpts_9` Global Club Settings | Club prefs (timezone, language), financial defaults (rake %, max buy-in caps), **security (2FA required, admin roles: Super Admin / Moderator)**, branding upload, **Integration & API — connect external wallets & data services** | ◐ have rake config + branding; **no timezone/language, no admin-role matrix, no API integration** |

### Tournaments — **5 mockups**, and this is the deepest area in the whole archive

I under-counted this badly on the first pass: I reported one tournament screen. There are **five**,
and together they describe a full tournament lifecycle — build → run → monitor → settle. The folder
names hide it: three of the five are called `detailed_private_table_setup_*` but are not table setup
at all.

**1. `comprehensive_tournament_setup` — the builder**

Four tabs (General / Structure / Financials / Rules) plus a persistent **Tournament Summary** rail
that recomputes as you type, and a `Draft 🔒` status pill. Fields we do **not** have:

- **Break Schedule** (`+ Add Break`) — scheduled breaks between levels
- **Admin Fee %** — the club's cut, distinct from the registration fee
- **Guaranteed Prize** — an overlay guarantee
- **Registration Close Time** + **Late Registration** toggle
- **Auto-Away on 2× Timeout** (tournament-scoped)
- **Time Bank** as a composite ("60s total, 5s per hand")
- **Operating Hours** window (18:00–04:00 UTC)
- **Live summary rail**: Est. Prize Pool, Total Buy-in, Starting Chips, Blind Levels, Status

**2. `dpts_1` — Tournament Center** (the operator's running view)

5 KPIs with sparklines (Active Tournaments / Total Prize Pools / Registered Players / Projected
Revenue ×2); **Live Events / Upcoming / Completed / Drafts** tabs; a grid of **rendered table
thumbnails** each showing name, prize pool, `42/100` fill and blinds; right rail with **Tournament
Alerts** ("Final Table Reached", "Tournament Chat") over **Global Club Chat**.
Ours: 3 stat cards and a text list. No Drafts state, no thumbnails, no alerts.

**3. `dpts_17` — Comprehensive Prize Pool & Tournament Analytics** ✗ **missing entirely**

The settlement screen. Financial Overview strip (Total Buy-ins / Re-buys+Add-ons / Club Rake / Net
Prize Pool). **Payout Table** with rank · percentage · chip value · **Paid ✓ per place**. Payout
distribution donut. **Tournament Progress** — "Players Remaining: 64 / Initial Entries: 512" with a
bar. Tournament Summary — start date, total hands played, average stack size. Then
**Export Report** and **Finalize Tournament**.

This is the biggest single missing screen in the archive. Note it implies **re-buys and add-ons**
as a first-class money concept, which our tournament model does not have.

**4. `fbapt_12` — in-tournament Leaderboard** (player-facing, from the table)

Header strip: Current Prize Pool / Remaining Players `56 / 500` / **Blinds Level `10K/20K (Ante 2K)`**.
**Podium** for top 3 (rank medallion, chips, hands played) then a ranked table (Rank / Avatar /
Username / Total Tournament Chips / Hands Played). "Back to Game" + **"Tournament Info"**.
Ours has a leaderboard but no podium, no blind-level readout, and no route back to the game.

**5. `dpts_10` — Revenue Reports**, tournament-relevant because **Tournament Fees is a first-class
KPI** beside Rake Collected, revenue sources split "Cash Games 65% / Tournaments 35%", the
transaction log distinguishes `Tournament Fees` rows from `Cash Game Rake`, and the right rail is
again **Tournament Alerts**. We have this screen and it is close to parity — but our Tournament Fees
number was, until this session, a *modelled* 25%-of-rake estimate rather than real entries × fee.

**Tournament touchpoints elsewhere:** `dpts_5` has an "Upcoming Tournaments" tab; `dpts_4` can target
an announcement at **Tournament Players Only**; `club_owner_management_hub` Quick Stats names the
**Top Performing Tournament**.

**Net:** tournaments are not "one form we should improve." They are a four-screen lifecycle
(build → monitor → play → settle) of which we have a partial builder, a thin monitor, a
podium-less leaderboard, and **no settlement screen at all**.

### Table setup — 1 mockup · **data model already at parity, presentation is the gap**

`dpts_8` "Advanced Table Access Configuration". Checked field-by-field against
`features/lobby/PrivateTableSetup.tsx` — we already send `access_type`, `join_code`,
`wallet_limit_cents`, `auto_buy_back_cents`, `operating_hours`, `action_secs`,
`auto_away_on_timeout`, `auto_away_below`, `min_players`.

Genuinely missing:

- **Start Time / End Time** — a scheduled window for the table (we have duration only)
- **"Game Sponsor: Club Owner"** shown in the header
- **Public access type disabled with the tooltip** explaining only club owners may sponsor public
  games — the design states our product rule; our UI doesn't

### Avatar economy — 7 mockups · ◐ one real gap

| Mockup | Us |
|---|---|
| `_29` Wardrobe Hub — equipped figure, **4 equipment slots**, owned grid by rarity, Save Preset / Nano Banana Render | ◐ studio exists; no slot model |
| `_30` Dye Shop — primary/secondary/accent swatches with hex, named dye packs, live preview | ◐ `studio/dyeData.ts` exists; no live preview |
| `_23` AI Customizer — prompt + **prompt-assistance chips**, premium-locked toggles with padlock, render preview | ◐ studio has prompt; no preset chips, no locked-toggle treatment |
| `_25` **Render progress** — per-stage bars (Anatomy 72% / Armor 50% / Lighting 70%) each with a thumbnail, overall 72% | ✗ **missing** — jobs exist, no progress UI |
| `_19` Premium Exclusive — Mythic / 1-of-1 cards with **360° badge**, gold/ETH pricing | ◐ `PremiumMarket` exists; 360° badge is decorative |
| `_22` Purchase Successful — celebration, View in Wardrobe / Back to Market | ✗ missing |
| `_18` Premium Upgrade — perk list, monthly/yearly, Upgrade to Premium | ✅ membership covers it |

### Player account — 5 mockups · ✅ mostly

`_16` profile dashboard ✅ (ours is richer), `_21` security dashboard ✅, `_26` 2FA with QR + backup
codes ✅ `TwoFactorSetup`, `_27` wallet connect ✅ `WalletConnect`, `_28` account recovery ✅
`AccountRecoveryCenter`.

### Lobby & join — 4 mockups · ✅

`game_mode_selection_lobby` ✅ (ours adds Play Money + matchmaker + join-by-code), `dpts_2` join by
code ✅, `dpts_20` public lobby ◐ (ours lacks the **seat-fill progress bar** and owner avatar per
row), `dpts_7` owner-side browser ✗.

### Club setup — 1 mockup · ✅

`initial_club_setup_screen` ✅ — ours matches, including the numbered sections and colour picker.
Their version has a **Club Type dropdown with Private / Semi-Private / Public**; ours has fewer.

---

## Verdict — the four real gaps

Ranked by distance from the design, not by effort:

1. **Tournaments — the whole lifecycle, not one form.** Builder missing 8 fields + the live summary
   rail; Tournament Center missing Drafts, thumbnails and the alerts rail; the **settlement screen
   (`dpts_17`) does not exist at all**, and with it the re-buy / add-on money concept; the
   leaderboard has no podium or blind-level readout. This is the largest area in the archive and
   the one I mis-sized.
2. **Club-owner console depth** — the tabbed centre + right rail (alerts/chat) + rendered table
   thumbnails pattern, repeated across 7 mockups. Plus `dpts_9` Global Settings missing
   timezone/language/admin-roles/API.
3. **Table setup presentation** — the fields exist; the screen doesn't say who sponsors it or why
   Public is locked. Add the scheduling window.
4. **Avatar render progress** — jobs run with no progress UI.
5. **No canvas-free table renderer.** HRC's `ImageTable` (pre-rendered plate + %-coordinate DOM
   overlay + CSS `rotateX` chips, zero WebGL) is what lets their Tournament Center and Public Table
   Browser show a dozen tables at once. Our only table renderer is an R3F canvas, which cannot be
   gridded. This blocks several of the gaps above rather than being cosmetic. See Deliverable 6.

Everything else is at or above the design.

---

---

## Finding: how HRC gets a "3D" look without WebGL

> ### 🚫 OUR LIVE TABLE IS NOT CHANGING
>
> `features/table3d/CinematicScene.tsx` and `LiveCinematicTable.tsx` are **out of scope for this
> deliverable and every deliverable in this plan.** The R3F cinematic table, its camera, felt,
> lighting, bloom, seat ring, card and chip geometry are finished and correct. Nothing below
> touches them.
>
> This matters because the finding immediately below is easy to misread as "HRC ships DOM, so we
> should too." That is **not** the conclusion. The conclusion is that a thumbnail grid needs a
> renderer that is not a canvas, and we do not have one.

You said HRC used different tech for the screens that look 3D. Verified in their source — they did,
and it is not WebGL.

**What they actually do** (`client/src/components/poker/ImageTable.tsx`, `lib/table-constants.ts`):

1. **A pre-rendered image IS the table.** `ImageTable.tsx:164` renders
   `<img src="/images/poker-table-felt.webp">`. The perspective, felt, rail and lighting are baked
   into the artwork — nothing is computed at runtime.
2. **Percentage-coordinate overlays with a hand-tuned scale ramp.** `TABLE_SEATS` is ten
   `{x, y, scale}` entries in % of the image box, `scale` falling from `1.0` at the hero seat to
   `0.83` at 12 o'clock. That single number is the entire foreshortening effect — far seats are
   drawn smaller. `DEALER_POSITIONS` is a second such table.
3. **CSS `rotateX` on flat SVG for the chips.** Each chip is an `<svg>` circle with
   `transform: rotateX(55deg)` and `marginBottom: -29` so they overlap into a stack. Flat vector art
   tilted by CSS reads as a 3D chip stack.
4. **framer-motion** for the movement on top.

**Zero WebGL outside the live table** — confirmed: no `three` / `@react-three` import anywhere in
their `pages/` or `components/`, except the table's own `scene/` and two overlay files.

**And they went further than I first thought.** `pages/Game.tsx:1278-1292` is a three-way branch for
the *actual playing surface*: a Flutter iframe, `PokerSceneCanvas` (R3F), or `ImageTable`. The
default is `ImageTable` — `getTableRenderer()` at `Game.tsx:14-19` returns `"2d"` unless localStorage
says otherwise, and R3F sits behind a 2D/3D toggle at `Game.tsx:1062`. So HRC's shipped default
table is DOM + CSS 3D, with WebGL as opt-in.

**We are not copying that.** Our R3F table is better and it is done — see the box above. The useful
part of this finding is narrower: HRC needed a non-canvas renderer, built one, and that is what makes
their multi-table screens possible. We need the same component for the same reason, and for nothing
else.

**Why this matters, and it is not a style preference.** The mockups that need it are the ones showing
*many tables at once* — Tournament Center (`dpts_1`, ~12 thumbnails), Club Overview (`dpts_5`),
Public Table Browser (`dpts_7`, ~12), Public Lobby (`dpts_20`). You cannot put twelve live WebGL
canvases in a grid. Our cinematic R3F table is the right tool for the **one** live table and the
wrong tool for a thumbnail grid. That is the actual reason HRC built `ImageTable` alongside their
`scene/`.

**This does not violate CLAUDE.md non-negotiable #1.** That rule forbids "gradient divs or
box-shadows pretending to be a 3D table" *for the live table*, and it already sanctions the baked
plate as "an explicit opt-in PHOTOREAL render… not a gradient-div faking the 3D felt". A
pre-rendered plate is real 3D art. The live cinematic table stays R3F — this is strictly for
thumbnails and multi-table views.

**What we already have:** `features/table/bakedTable.ts` (plate config with camera + seat ellipse)
and the plate art in `public/table/`, including HRC's own `public/images/poker-table-felt.webp`,
already vendored. What is missing is the canvas-free renderer — ours composites an R3F `<Canvas>`
over the plate, which is exactly what a grid cannot afford.

---

## How this was produced

1. `git show origin/main:"Archive.zip"` (and 2/3) into a scratch dir, unzipped, `__MACOSX` stripped.
2. All 41 `*/screen.png` opened individually at full resolution.
3. Each classified by **content**, not by folder name — see the note above about
   `detailed_private_table_setup_*`.
4. Each compared against the actual implementation by reading the corresponding source file, not by
   recollection. Where this document says "we already send X", it was checked in the payload.
5. The rendering finding was taken from HighRollersClub's own source (`components/poker/ImageTable.tsx`,
   `lib/table-constants.ts`, `pages/Game.tsx`), not from the mockups.

## Known limits of this review

- The mockups are **designs**, not HRC's shipped code. Some were never built by HRC either.
- Verification of our side was done by reading source. Screens that need a live Nakama backend to
  populate were not exercised end-to-end here.
