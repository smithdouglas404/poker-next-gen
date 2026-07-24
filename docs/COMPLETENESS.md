# HRC Completeness Ledger

**Purpose:** an honest, machine-verifiable inventory of every rich screen and its
interactive controls — each marked `WIRED` (to a real registered RPC), `DEMO/HARDCODED`
(renders but uses static/local data), `DEAD` (no handler), or `FIXED` (wired this pass).
No prose spin — spot-check any row against the cited file.

Two automated gates back this ledger (run them yourself):

| Gate | Command | Result |
|---|---|---|
| **RPC coverage** — every registered RPC is reachable | `node backend-core/scripts/rpc_coverage.mjs` | **226 registered · 0 MISSING · 0 ERROR** (82 return data, 123 validate input, 21 destructive-skipped). Exits non-zero if any endpoint is dead. |
| **Theme lint** — no off-brand "Neon Vault" cyan palette in screens | `node frontend-table/scripts/theme_lint.mjs` | **0 forbidden-palette hits.** All screens are on the GGPoker token theme. (230 advisory off-token hexes = mostly shades/tints + dye swatches + wallet brand icons.) |

**What this proves:** the backend is real — 226 endpoints, none phantom. The screens
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
| Member Management | Quick Stats (Most Active Table / Top Tournament) | **DEMO** | hardcoded `QuickStats.tsx:14-17` |
| Invite Flow | Send / Resend / Revoke | **WIRED** | `club_invite`, `club_invite_revoke` (ClubInvitations.tsx) |
| Invite Flow | Welcome-card "unique code" | **DEMO** | client hash `inviteCode()`; expiry client-computed |
| Revenue Reports | rake series / ledger / house balance | **WIRED** | `club_rake_report`, `rake_ledger_get`, `admin_financials` |
| Revenue Reports | Net Profit / Tournament Fees / Sources donut | **DEMO** | client-modeled (RevenueReports.tsx:203-209); no tournament-fee RPC |
| Member Analytics | Member Activity table | **WIRED** | `club_member_stats` |
| Member Analytics | 3 charts (Active / Volume / New-vs-Returning) | **DEMO** | always `DEMO_ANALYTICS` (OwnerHub.tsx:558); no time-series RPC |
| Global Settings | Rake %, cap, min-pot, no-flop, public | **WIRED** | `rake_config_set` |
| Global Settings | Timezone/Language/theme/2FA-flag/roles/KYC/geo | **WIRED** | `club_update` settings_json |
| Global Settings | **Upload Logo** | **FIXED** | real file picker → `club_update` (7c3ed4e) |
| Global Settings | **Connect External Wallets** | **FIXED** | links to /wallet; real `wallet_link` backend now exists (d157383); FE wiring pending |
| Global Settings | Admin/Mod role selects, 2FA toggle | **DEMO** | stored as strings/flags in settings_json; grant no real role |
| Announcements | Broadcast Now (post + list) | **WIRED** | `club_announcement_create/list`, `announcement_create/list` |
| Announcements | Target Audience / Delivery Style | **DEMO** | only appends text tag / severity; no real channel param |
| Announcements | Rich-text toolbar (B/I/U/link/color) | **DEAD** | decorative spans (Announcements.tsx:88-95) |
| Sponsorship Payouts | List / Record | **WIRED** | `sponsorship_payout_list/create` |
| Public Table Browser (Classic) | grid / Join | **WIRED** | `table_list` → `joinRoom` |
| Public Table Browser (Classic) | **Seats filter** | **FIXED** | "Open Seats" toggle added (6c23b5d) |
| Owner-hub Featured Tables/Series | list | **FIXED** | `table_list` / `tournament_list` (e55aa9d) |
| Initial Club Setup | Create Club (+logo, color, type, credit) | **WIRED** | `club_create` + `club_update` |
| Club Overview | KPI cards / Activity / Global Club Chat | **WIRED** | `club_quick_stats`, `club_chat_send/list` |
| Club Overview | Upcoming Tournaments | **FIXED** | `tournament_list` (7c3ed4e) |
| Club Overview | Sparklines | **DEMO** | always `DEMO_OVERVIEW_SPARKS`; no series RPC |

## B. Player / account screens

| Screen | Control | State | Evidence / RPC |
|---|---|---|---|
| Signup | Create Account | **WIRED** | Nakama `authenticate()` (login/page.tsx) |
| Signup | Google OAuth | **DEAD** | sets an error string (login/page.tsx:55) — needs real OAuth |
| Signup / Profile | Initial Avatar selection | **DEMO** | localStorage only; no `avatar_set` RPC |
| Player Profile Dashboard | stats (hands / WL / VIP) | **WIRED** | `player_stats`, `me_verification` |
| Player Profile Dashboard | Recent Transactions | **FIXED** | `wallet_ledger` (7c3ed4e) |
| Player Profile Dashboard | Biggest Pot / Tournament Points / Member Since | **DEMO** | static (not fed by player_stats) |
| Player Profile Dashboard (admin) | Edit Limit / Grant Bonus / Flag for Review | **DEAD** | do not exist (only Ban / adjust-wallet do) |
| Security Dashboard | Password / 2FA / API keys / Chips | **WIRED** | `auth_change_password`, `auth_2fa_*`, `api_key_*`, `wallet_get` |
| Security Dashboard | Linked Social (Google/FB) | **DEAD** | static badges |
| Security Dashboard | Email Notifications / Privacy Mode | **DEMO** | localStorage only; no prefs RPC |
| Security Dashboard | Active Sessions Revoke | **DEAD** | `<Link>`, no revoke RPC |
| 2FA Setup modal | QR / code / backup / Activate | **WIRED** | `auth_2fa_setup/verify` |
| Account Recovery | email / backup-code recovery | **WIRED** | `account_recovery_*` |
| Account Recovery | Recover via linked crypto wallet | **DEMO** | demo wallet list; no ownership check |
| Wallet Connection (Premium) | Connect MetaMask/Coinbase/WalletConnect/Phantom | **WIRED** | connect → `wallet_link_challenge` → sign (personal_sign / Phantom signMessage) → `wallet_link` (secp256k1 ecrecover / ed25519 verify). Runtime-proven: challenge issues nonce, bad sig 403-rejected, Go round-trip test passes (#91) |
| Premium Upgrade | Upgrade / Monthly-Yearly / Cancel | **WIRED** | `subscription_checkout/cancel/tiers/status` |

## C. Avatar-economy & game-flow screens

| Screen | Control | State | Evidence / RPC |
|---|---|---|---|
| Avatar Marketplace | Purchase / Complete Purchase | **WIRED** | cart → `cosmetic_buy` |
| Avatar Marketplace | Pay with Gold / Pay with ETH | **DEMO** | USD settle only; Gold/ETH display-only |
| Premium Market | Acquire / Wishlist | **WIRED** | `cosmetic_buy`, `cosmetic_wishlist_add` |
| Premium Market | 360° rotate badge | **DEAD** | decorative span (PremiumMarket.tsx:67) |
| Purchase Success modal | View Wardrobe / Back | **WIRED** | nav (by design) |
| Wardrobe Hub | Equip / Dismantle(list) / Save Preset | **WIRED** | `cosmetic_equip`, `marketplace_list`, `loadout_save/equip`, `inventory_list` |
| Dye Shop | Apply Dye | **WIRED** | `cosmetic_dye_set` |
| Dye Shop | Dye Packs (buy/unlock) | **DEMO** | only loads local colors; no purchase RPC |
| Nano Banana Customizer | Render / Apply & Save | **WIRED** | `character_generate`, `character_generation_status`, `cosmetic_equip` |
| Nano Banana Customizer | Premium Animated Effects / Custom Gear | **DEAD** | upsell gate → /membership (intentional) |
| Rendering Progress | progress % | **WIRED** | polls `character_generation_status` |
| Game Mode Selection | Private / Public(locked) / Tournament | **WIRED** | `table_create`, `me_roles` |
| Join Private Game | Search / Join | **WIRED** | `room_resolve`, `table_list` |
| Public Lobby | list / Join | **WIRED** | `table_list` |
| Tournament Center | stat cards / Start / Finalize | **WIRED** | `tournament_list/analytics/start/finalize` |
| Tournament Center | **Global Club Chat** | **FIXED** | `club_chat_send/list` (7c3ed4e) |
| Tournament Center | Alerts feed | **DEMO** | client-derived (`buildAlerts`); no feed RPC |
| Tournament Setup | Publish (create + blinds + prizes) | **WIRED** | `tournament_create`, `blind_level_add`, `prize_pool_add` (+ #82 editors) |
| Prize/Analytics | overview / payout / Finalize | **WIRED** | `tournament_analytics`, `tournament_finalize` |
| Prize/Analytics | Export Report | **DEMO** | client-side JSON download; no server artifact |
| Advanced Table Access | access/join-code/wallet-limit/auto-buyback/kyc/geo/spectator | **WIRED** | `table_create` (#83 fields enforced) |
| Advanced Table Access | auto-away / operating-hours | **DEMO** | forward-compat (no backend home yet) |
| Advanced Table Access | auto-play / A/V | **MISSING** | not present in the component |

---

## Remaining "faces without flows" (the finite fix list)

**Frontend-only (small):**
- Announcements rich-text toolbar (dead) — make markdown-functional or remove.
- PremiumMarket 360° badge (dead) — make it spin or remove.
- Wallet Connection frontend wiring → the new `wallet_link` challenge/sign/link flow.

**Small backend + wire:**
- `avatar_set` RPC (persist avatar selection).
- `prefs_get/set` RPC (email notifications / privacy).
- Admin member actions: Edit Limit / Grant Bonus (reuse wallet-adjust) / Flag (new store).
- QuickStats real Most-Active-Table / Top-Tournament from `table_list`/`tournament_list`.
- Session-revoke RPC (Nakama session mgmt).

**Medium backend:**
- Analytics time-series RPC → MemberAnalytics + Overview sparklines (stop `DEMO_ANALYTICS`).
- Announcement audience + delivery channel params + in-table Breaking-News modal by audience.
- Revenue real tournament-fee source (stop client-modeling Net Profit/Fees/donut).

**Needs a product decision (flagged, not faked):**
- Google/Facebook OAuth (real identity provider).
- Pay-with-Gold/ETH cosmetics rail + dye-pack purchase economy.
- Recover-via-wallet ownership check (now feasible on the `wallet_link` verifier).

**Net-new (sanctioned one-phase body — pending):**
- #84 Bounty/knockout tournaments · #85 Sidebets · #88 double-entry ledger (roadmap-large).

---

## Definition of "done" (how to hold me to it)
The system is "done" when this ledger has **zero `DEMO`/`DEAD` rows without a
product-decision note**, `rpc_coverage.mjs` is green, and `theme_lint.mjs` gate is
green. Every fix lands with a commit hash + a runtime proof or passing test.
