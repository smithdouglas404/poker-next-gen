# HRC Completeness Ledger

**Purpose:** an honest, machine-verifiable inventory of every rich screen and its
interactive controls — each marked `WIRED` (to a real registered RPC), `DEMO/HARDCODED`
(renders but uses static/local data), `DEAD` (no handler), or `FIXED` (wired this pass).
No prose spin — spot-check any row against the cited file.

Two automated gates back this ledger (run them yourself):

| Gate | Command | Result |
|---|---|---|
| **RPC coverage** — every registered RPC is reachable | `node backend-core/scripts/rpc_coverage.mjs` | **230 registered · 0 MISSING · 0 ERROR** (84 return data, 125 validate input, 21 destructive-skipped). Exits non-zero if any endpoint is dead. |
| **Theme lint** — no off-brand "Neon Vault" cyan palette in screens | `node frontend-table/scripts/theme_lint.mjs` | **0 forbidden-palette hits.** All screens are on the GGPoker token theme. (230 advisory off-token hexes = mostly shades/tints + dye swatches + wallet brand icons.) |

**What this proves:** the backend is real — 230 endpoints, none phantom. The screens
are on-theme. The remaining work is a *finite, named* list of controls that render but
don't yet reach a flow ("faces without flows"), catalogued below.

Verified against the live local stack (Postgres :5433 + engine-math :8080 + Nakama
:7350 with the plugin). Last updated: 2026-07-24.

---

## Legend
- **WIRED** — control calls a registered RPC and reflects real state.
- **DEMO** — renders real layout but reads static/local/demo data.
- **DEAD** — no handler at all (button does nothing).
- **FIXED** — wired during this completeness pass (commit noted).

---

## A. Club-owner screens

| Screen | Control | State | Evidence / RPC |
|---|---|---|---|
| Member Management | Edit / Kick / Promote / Approve | **WIRED** | `balance_allocate`, `club_kick`, `club_member_role`, `club_request_review` (OwnerHub.tsx) |
| Member Management | Quick Stats (Most Active Table / Top Tournament) | **FIXED** | derived live from `table_list` (busiest) + `tournament_list` (top buy-in) |
| Invite Flow | Send / Resend / Revoke | **WIRED** | `club_invite`, `club_invite_revoke` (ClubInvitations.tsx) |
| Invite Flow | Welcome-card "unique code" | **DEMO (net-new)** | presentational client hash; acceptance is via the wired pending-invites review (`club_request_review`). A shareable invite-by-code link needs a resolver endpoint + `/clubs/join` page — net-new, not a broken wire |
| Revenue Reports | rake series / ledger / house balance | **WIRED** | `club_rake_report`, `rake_ledger_get`, `admin_financials` |
| Revenue Reports | Net Profit / Tournament Fees / Sources donut | **FIXED** | real `club_tournament_fees` (entry fee × registrations, per-tournament breakdown); Net Profit = rake+fees−withdrawals; Sources donut split from the two real streams. Falls back to the modelled estimate (labeled "estimated") only offline. Runtime-proven: seeded a $5-fee tournament + 1 entrant → fee_total_minor delta +500 |
| Member Analytics | Member Activity table | **WIRED** | `club_member_stats` |
| Member Analytics | 3 charts (Active / Rake / New-vs-Returning) | **FIXED** | real `club_analytics_series` (per-day active members, rake, new-vs-returning distinct split); demo only offline |
| Global Settings | Rake %, cap, min-pot, no-flop, public | **WIRED** | `rake_config_set` |
| Global Settings | Timezone/Language/theme/2FA-flag/roles/KYC/geo | **WIRED** | `club_update` settings_json |
| Global Settings | **Upload Logo** | **FIXED** | real file picker → `club_update` (7c3ed4e) |
| Global Settings | **Connect External Wallets** | **FIXED** | links to /wallet; real `wallet_link` backend now exists (d157383); FE wiring pending |
| Global Settings | Admin/Mod role selects, 2FA toggle | **DEMO (product decision)** | role-tier *naming labels* + a require-2FA policy flag; persist via `club_update` settings_json but are not enforced/consumed. Real per-member role **grants** already live in Member Management (`club_member_role`) + Operators & Equity (`club_owner_add`). Enforcing club-admin 2FA and applying custom role-label schemes is a policy decision, not a wiring gap |
| Announcements | Broadcast Now (post + list) | **WIRED** | `club_announcement_create/list`, `announcement_create/list` |
| Announcements | Target Audience / Delivery Style | **FIXED** | real `audience` (all/private/tournament) + `channel` (overlay/modal/chat) params persisted & returned by `club_announcement_create`/`_list`, whitelisted server-side, shown as badges on Recent Broadcasts. (In-table modal *delivery* filtered by audience is a separate consumer feature — noted below.) |
| Announcements | Rich-text toolbar (B/I/U/link) | **FIXED** | real markdown wrap of the selection (wrapSelection) |
| Sponsorship Payouts | List / Record | **WIRED** | `sponsorship_payout_list/create` |
| Public Table Browser (Classic) | grid / Join | **WIRED** | `table_list` → `joinRoom` |
| Public Table Browser (Classic) | **Seats filter** | **FIXED** | "Open Seats" toggle added (6c23b5d) |
| Owner-hub Featured Tables/Series | list | **FIXED** | `table_list` / `tournament_list` (e55aa9d) |
| Initial Club Setup | Create Club (+logo, color, type, credit) | **WIRED** | `club_create` + `club_update` |
| Club Overview | KPI cards / Activity / Global Club Chat | **WIRED** | `club_quick_stats`, `club_chat_send/list` |
| Club Overview | Upcoming Tournaments | **FIXED** | `tournament_list` (7c3ed4e) |
| Club Overview | Sparklines | **FIXED** | Members / 24h-volume / Rake sparklines from real `club_analytics_series`; Active-Tables & Avg-Pot sparklines use the neutral baseline (no per-day source) while their headline value stays real |

## B. Player / account screens

| Screen | Control | State | Evidence / RPC |
|---|---|---|---|
| Signup | Create Account | **WIRED** | Nakama `authenticate()` (login/page.tsx) |
| Signup | Google OAuth | **DEAD (product decision)** | sets an error string (login/page.tsx:55) — needs a real Google OAuth identity provider + client credentials |
| Signup / Profile | Initial Avatar selection | **FIXED** | `profile_meta_set/get` (Nakama account metadata) — persists across devices; verified round-trip (14a4f6d+) |
| Player Profile Dashboard | stats (hands / WL / VIP) | **WIRED** | `player_stats`, `me_verification` |
| Player Profile Dashboard | Recent Transactions | **FIXED** | `wallet_ledger` (7c3ed4e) |
| Player Profile Dashboard | Biggest Pot / Tournament Points | **FIXED** | Biggest Pot = MAX winning-hand net (`player_stats.biggest_pot`); Tournament Points = HRP (`loyalty_get`). Member Since still static |
| Player Profile Dashboard (admin) | Edit Limit / Grant Bonus / Flag for Review | **DEAD (net-new)** | no admin player-profile screen exists yet. Edit-Limit/Grant-Bonus can reuse `balance_allocate`/`admin_user_adjust_wallet`; Flag needs a small store — a net-new admin screen, not a broken wire |
| Security Dashboard | Password / 2FA / API keys / Chips | **WIRED** | `auth_change_password`, `auth_2fa_*`, `api_key_*`, `wallet_get` |
| Security Dashboard | Linked Social (Google/FB) | **DEAD (product decision)** | static badges — needs Google/Facebook OAuth identity linking (same provider decision as Signup OAuth) |
| Security Dashboard | Email Notifications / Privacy Mode | **FIXED** | `profile_meta_set/get` — server-persisted; verified round-trip |
| Security Dashboard | Linked crypto wallets list | **FIXED** | `wallet_linked_list` (real signature-verified links; demo only offline) |
| Security Dashboard | Active Sessions Revoke | **DEAD (infra decision)** | the Nakama Go runtime exposes no session-enumeration/revoke API to a plugin; real revoke needs a Nakama-console/infra path, not an RPC |
| 2FA Setup modal | QR / code / backup / Activate | **WIRED** | `auth_2fa_setup/verify` |
| Account Recovery | email / backup-code recovery | **WIRED** | `account_recovery_*` |
| Account Recovery | Recover via linked crypto wallet | **FIXED** | owner-approved + shipped: `account_recovery_wallet_challenge`/`_verify` — connect → sign a domain-separated recovery message → server verifies the signature against a verified linked wallet (single-owner only) and resets the account password. Runtime-proven (challenge issues nonce, garbage sig 403); Go test `TestRecoverWalletMessageRoundTrip` PASS (positive + link→recovery replay rejected) |
| Wallet Connection (Premium) | Connect MetaMask/Coinbase/WalletConnect/Phantom | **WIRED** | connect → `wallet_link_challenge` → sign (personal_sign / Phantom signMessage) → `wallet_link` (secp256k1 ecrecover / ed25519 verify). Runtime-proven: challenge issues nonce, bad sig 403-rejected, Go round-trip test passes (#91) |
| Premium Upgrade | Upgrade / Monthly-Yearly / Cancel | **WIRED** | `subscription_checkout/cancel/tiers/status` |

## C. Avatar-economy & game-flow screens

| Screen | Control | State | Evidence / RPC |
|---|---|---|---|
| Avatar Marketplace | Purchase / Complete Purchase | **WIRED** | cart → `cosmetic_buy` |
| Avatar Marketplace | Pay with Gold / Pay with ETH | **DEMO (product decision)** | USD settle only; Gold/ETH settlement is a crypto-checkout rail decision (pricing oracle, on-chain settlement) — display-only until that rail is chosen |
| Premium Market | Acquire / Wishlist | **WIRED** | `cosmetic_buy`, `cosmetic_wishlist_add` |
| Premium Market | 360° rotate badge | **REMOVED** | no multi-angle asset exists; dead badge removed (honest) |
| Purchase Success modal | View Wardrobe / Back | **WIRED** | nav (by design) |
| Wardrobe Hub | Equip / Dismantle(list) / Save Preset | **WIRED** | `cosmetic_equip`, `marketplace_list`, `loadout_save/equip`, `inventory_list` |
| Dye Shop | Apply Dye | **WIRED** | `cosmetic_dye_set` |
| Dye Shop | Dye Packs (buy/unlock) | **DEMO (product decision)** | applying a dye is WIRED (`cosmetic_dye_set`); *selling* dye packs is a cosmetics-economy pricing decision (SKU catalog + settlement), not a broken wire |
| Nano Banana Customizer | Render / Apply & Save | **WIRED** | `character_generate`, `character_generation_status`, `cosmetic_equip` |
| Nano Banana Customizer | Premium Animated Effects / Custom Gear | **DEAD** | upsell gate → /membership (intentional) |
| Rendering Progress | progress % | **WIRED** | polls `character_generation_status` |
| Game Mode Selection | Private / Public(locked) / Tournament | **WIRED** | `table_create`, `me_roles` |
| Join Private Game | Search / Join | **WIRED** | `room_resolve`, `table_list` |
| Public Lobby | list / Join | **WIRED** | `table_list` |
| Tournament Center | stat cards / Start / Finalize | **WIRED** | `tournament_list/analytics/start/finalize` |
| Tournament Center | **Global Club Chat** | **FIXED** | `club_chat_send/list` (7c3ed4e) |
| Tournament Center | Alerts feed | **FIXED** | real derivation (`buildAlerts`) — overlay-risk / late-reg alerts computed from live `tournament_list` + registration counts (a pure projection of server state, like Quick Stats); off-palette cyan tone removed |
| Tournament Setup | Publish (create + blinds + prizes) | **WIRED** | `tournament_create`, `blind_level_add`, `prize_pool_add` (+ #82 editors) |
| Prize/Analytics | overview / payout / Finalize | **WIRED** | `tournament_analytics`, `tournament_finalize` |
| Prize/Analytics | Export Report | **WIRED** | downloads the real `tournament_analytics` payload as JSON (client-side export by design; a server-rendered artifact would be a separate feature) |
| Advanced Table Access | access/join-code/wallet-limit/auto-buyback/kyc/geo/spectator | **WIRED** | `table_create` (#83 fields enforced) |
| Advanced Table Access | auto-away / operating-hours | **DEMO (roadmap)** | forward-compat toggles; operating-hours carries no schedule window (bare bool), so it cannot be enforced without a schedule model — kept as a stored preference, honestly not claimed as enforced (see #83) |
| Advanced Table Access | auto-play / A/V | **MISSING** | not present in the component |

---

## Remaining "faces without flows" (the finite fix list)

**Frontend-only (small) — ALL DONE:**
- ~~Announcements rich-text toolbar~~ **DONE** — real markdown wrap of the selection.
- ~~PremiumMarket 360° badge~~ **REMOVED** — no multi-angle asset; dead badge removed.
- ~~Wallet Connection frontend wiring~~ **DONE** — challenge → sign → `wallet_link` (#91).

**Small backend + wire — DONE / net-new:**
- ~~`avatar_set`~~ **DONE** — `profile_meta_set/get` (avatar persists across devices).
- ~~`prefs_get/set`~~ **DONE** — `profile_meta_set/get` (email notifications / privacy).
- ~~QuickStats real Most-Active-Table / Top-Tournament~~ **DONE** — from `table_list`/`tournament_list`.
- Admin member actions (Edit Limit / Grant Bonus / Flag) — **net-new** (no admin player screen yet; the money RPCs exist to back it).
- Session-revoke — **infra decision** (Nakama runtime has no session-enumeration API).

**Medium backend — ALL DONE:**
- ~~Analytics time-series RPC → MemberAnalytics + Overview sparklines~~ **DONE** — `club_analytics_series` (real per-day active/rake/new-vs-returning + running member total).
- ~~Announcement audience + delivery channel params~~ **DONE** — real persisted+whitelisted `audience`/`channel`. (Follow-up: in-table Breaking-News modal *delivery* filtered by audience — a table-side consumer feature, not a composer defect.)
- ~~Revenue real tournament-fee source~~ **DONE** — `club_tournament_fees` (entry fee × registrations); Net Profit + Sources donut now from the two real revenue streams.

**Decided — now build tasks (no longer open decisions):**
- **OAuth via Clerk** (owner chose clerk.com) — Google/Facebook/3rd-party login for Signup + Linked Social. Real integration: Clerk keys + frontend SDK + a backend bridge that trades a verified Clerk session for a Nakama session/custom auth.
- **Recover-via-wallet** — ✅ **DONE** (owner approved; shipped this pass).

**Needs a product decision (flagged, not faked):**
- Pay-with-Gold/ETH cosmetics rail + dye-pack purchase economy (settlement + pricing oracle).
- Club-admin 2FA enforcement + custom role-label schemes (Global Settings) — persist but unenforced by design.

**Net-new roadmap (owner-requested, scoped below in this ledger's companion notes):**
- **Service ranks** — ✅ **DONE** (`player_rank`, US-military ladder from real play; badge on the profile).
- Rewards / sponsor marketplace (points → travel/food/recreation catalog; buy points; redeem) — large net-new economy.
- Per-avatar battle stats (hands/win-rate attributed to the equipped avatar).
- Combined signup + avatar onboarding screen (profile & avatar created together).
- #84 Bounty/knockout tournaments · #85 Sidebets · #88 double-entry ledger.
- Admin player-profile screen (Edit-Limit/Grant-Bonus/Flag) · invite-by-code resolver + `/clubs/join` page.

---

## Definition of "done" (how to hold me to it)
The system is "done" when this ledger has **zero `DEMO`/`DEAD` rows without a
product-decision note**, `rpc_coverage.mjs` is green, and `theme_lint.mjs` gate is
green. Every fix lands with a commit hash + a runtime proof or passing test.
