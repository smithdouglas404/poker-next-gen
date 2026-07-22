# HRC master screen map — all 54, individually classified

Built: 5 · Partial: 31 · Missing: 18


## MISSING (distinct screens/states we do not have)

- **detailed_private_table_setup_2** — Join Private Game (invitation-code modal)
    - shows: Centered gold-framed modal 'Join Private Game' over a blurred casino floor. Six individual gold character boxes for an 'Alphanumeric Invitation Code', a full-width 'Search Table' button, then a resolved table summary (Table Name: High Rollers Club Elite, Blind Levels: 100/200, Number of Players: 5/1
    - maps to: /lobby join-with-code flow (or /table join) — the private-table code redemption path

- **detailed_private_table_setup_3** — Sponsorship Payout Details
    - shows: Club Owner Tools nav (Member Analytics, Create New Public Game, Sponsorship Reports [active]). Two summary cards: Total Paid Out $1,250,000, Next Scheduled Payout October 15, 2024. Below, a payout ledger table: Transaction ID (TX-001234…), Recipient Wallet (0xAbC1…23eF truncated addresses), Amount (
    - maps to: /clubs owner → Sponsorship Reports / adjacent to /wallet — the club sponsorship payout accounting ledger

- **detailed_private_table_setup_6** — Club Member Invite Flow
    - shows: Club Owner Tools nav (Member Analytics, Create New Public Game, Member Invites [active]). 'Invite New Member' card: Member Email or Wallet Address field, 'Assign Initial Credit Limit' dropdown open showing $10,000 / $25,000 / $50,000, 'Send Invitation' button, and a 'High Rollers Welcome Card' previ
    - maps to: /clubs owner membership / /membership admin — outbound member invitation + credit provisioning

- **detailed_private_table_setup_10** — Revenue Reports (Total Revenue / Net Profit / Rake Collected / Tournament Fees)
    - shows: Club financial analytics dashboard: 4 KPI cards (Total Revenue $500k w/ 30-day trend sparkline, Net Profit $350k, Rake Collected $120k, Tournament Fees $30k), Daily Revenue Trends area chart, Revenue Sources donut (Cash Games 65% / Tournaments 35%), Detailed Transaction Log table (Date/Source/Amount
    - maps to: /clubs Revenue Reports + /admin analytics: club-owner financial reporting (rake/fees, revenue trends, transaction ledger)

- **detailed_private_table_setup_11** — Breaking News Modal (over live poker table)
    - shows: Live 9-max poker table (dark cyber servers backdrop, avatar seats w/ stacks: BlackJack $7,000, RoyalFlush, AceHigh, QueenBee, Sprintalto $7,000, Slotoou..., Riawsoot, AlasticFluck, Marninoon) with a centered gold 'Breaking News Modal' broadcast overlay: 'ATTENTION ALL PLAYERS: SPECIAL TOURNAMENT STA
    - maps to: /table 3D cinematic table + broadcast/announcement modal overlay (admin push to all seated players)

- **detailed_private_table_setup_12** — Club Member Invitation System
    - shows: Invite New Member form (Recipient Email/Wallet, Initial Game Credit $ field, Access Role dropdown Member/VIP, Send Invitation) beside a rendered gold-foil 'High Rollers Invitation' certificate preview. Below: Sent Invites table (Recipient / Role / Sent Date / Status badges Pending-gold, Accepted-gre
    - maps to: /membership + /clubs member management: invite flow with credit grant, role assignment, invite-status tracking

- **detailed_private_table_setup_22** — Avatar Marketplace and Tiers — Purchase Successful modal
    - shows: A PURCHASE SUCCESSFUL! celebration modal (gold confetti burst, hero avatar, VIEW IN WARDROBE + BACK TO MARKET links) overlaid on the marketplace. Right-side Purchase Summary cart lists Cyber-Knight items with Gold prices, Total Cost 170,000 Gold, Pay with Gold / Pay with ETH radio options, COMPLETE 
    - maps to: /marketplace checkout/confirmation state (cart + payment method + success) feeding into /studio wardrobe

- **detailed_private_table_setup_25** — Nano Banana Rendering Progress
    - shows: Full-screen avatar-generation progress view. Gold wireframe humanoid mid-render, a 'NANO BANANA ENGINE RENDERING... 72% COMPLETE' progress bar, and a RENDERING STATS panel breaking down Anatomy Synthesis 72%, Armor Forging 50%, Neural Lighting 70% with thumbnail previews and a live telemetry readout
    - maps to: /studio (avatar creator) — the GLB/Tripo render-in-progress state

- **detailed_private_table_setup_26** — 2FA Setup Authentication
    - shows: Modal over a dimmed 'Comprehensive Player Security Dashboard'. Two-step layout: Step 1 scan QR code (rendered QR), Step 2 enter a 6-digit verification code (boxed inputs), Backup Codes shown (A1B2-C3D4-E5F6 | G7H8-I9J0-K1L2), gold ACTIVATE 2FA button + Cancel. Background reveals Financials & Wallets
    - maps to: /profile security settings (2FA enrollment) or /wallet security overlay

- **detailed_private_table_setup_28** — Account Recovery Center
    - shows: Modal over the 'Comprehensive Player Security Dashboard'. Three recovery methods: Recover via Linked Crypto Wallet (MetaMask/Coinbase icons + VERIFY WALLET), Email Recovery (email input + SEND EMAIL LINK), Use Backup Codes (input + USE BACKUP CODE), and a full-width SEND RECOVERY LINK button. Same F
    - maps to: /profile security (account recovery) or /wallet recovery overlay

- **detailed_private_table_setup_30** — Avatar Dye Shop Customization
    - shows: Same wardrobe frame but Dye Shop tab active. Right panel 'Dye Customization' with Preview toggle, Primary/Secondary/Accent color swatch rows, and Dye Packs cards with rarity (Gold Leaf Legendary, Midnight Chrome Epic, Neon Pulse Rare, Carbon Fiber Common). APPLY DYE + NANO BANANA RENDER buttons. Ava
    - maps to: /studio (avatar color customization / dye) — cosmetic recolor flow

- **full_body_avatar_poker_table_1** — Final Hand History Log
    - shows: Large modal combining a left 'Financial Summary' panel (Total Chips in Play $5,000,000, Total Rake Collected $170,000, and a per-player Net Gains/Losses ledger with avatar rows showing negative amounts) and a scrollable right-hand 'Final Hand History Log' list — each row has Hand ID, Total Pot Size,
    - maps to: /table hand-history + financial-summary overlay (admin), overlapping /table waiting-list rail and /wallet rake/net-ledger reporting

- **full_body_avatar_poker_table_4** — Game Paused By Admin
    - shows: Full-screen 'GAME PAUSED BY ADMIN' interstitial with subtext 'Waiting for admin to resume...', gold RESUME GAME button and QUIT TABLE button, dimmed live table behind it. Admin Control menu open. A distinct game-state blocking overlay, not a settings form.
    - maps to: /table paused game-state overlay (admin pause broadcast to seated players)

- **full_body_avatar_poker_table_5** — Comprehensive Admin Table Settings
    - shows: Scrollable 'Comprehensive Admin Table Settings' modal with far more controls than screen 3: Wallet & Credit Limits (Universal Player Wallet Limit $5,000,000, Auto Buy-Back Public/Private toggle with credit-limit note), Game Rules & Timing (Auto start next hand Yes/No, Showdown Presentation Time Fast
    - maps to: /table admin advanced-settings overlay + /admin house rules; overlaps /clubs custom-rake/credit-limit and /lobby advanced table rules

- **full_body_avatar_poker_table_8** — Player Game Report (hand-history modal)
    - shows: Modal over the live table: 'Player Game Report' with 3 KPI tiles (Net Profit/Loss +$875,000 Session Total, Hands Won/Lost 24/18 with 24/18% win rate, Biggest Pot Won $1,250,000). Scrollable 'Personal Hand History' table with columns Hand # / Hole Cards / Board / Outcome, showing four-color card chip
    - maps to: /table hand-history/session-report overlay (ties to /wallet + /provably-fair for per-hand audit); player statistics modal

- **full_body_avatar_poker_table_9** — Game Paused by Admin (pause overlay)
    - shows: Large centered glass modal 'GAME PAUSED BY ADMIN' / 'Waiting for admin to resume...' with gold RESUME GAME button and outline QUIT TABLE button. Table + action bar dimmed behind. Admin Control menu and Waiting List rail still visible/active.
    - maps to: /table admin pause state (Admin Control > Pause Game result); table-lifecycle overlay

- **full_body_avatar_poker_table_10** — Player Kick/Ban Confirmation
    - shows: Modal 'Player Kick/Ban Confirmation' targeting Avatar 1 [User_A] with avatar thumbnail, a 'Reason for Action' dropdown (Inappropriate Conduct selected), red KICK FROM TABLE button, red BAN FROM CLUB button, plus a gold BAN FROM CLUB confirm and outline CANCEL. Admin Control + Waiting List behind.
    - maps to: /table Player Management > moderation flow (also relates to /admin and /membership ban enforcement); kick/ban confirmation dialog

- **hand_history_audit_detail** — Neon Vault - Hand Audit (Cryptographic Proof)
    - shows: Per-hand forensic detail: left column Audit Session #88219-X, VERIFIED PATH badge, Winning Hand 'Full House, Aces over 8s' total pot 1.245 ETH, and a Hand Chronology timeline (Pre-flop hole cards A-A, Flop 8-3-K, Turn 8, River A shown as 4-color cards). Right: Cryptographic Proof cards per card inde
    - maps to: /provably-fair hand-detail + /table hand-history modal


## PARTIAL (route exists, this state/feature not built)

- **detailed_private_table_setup_1** — High Rollers Club — Tournament Center
    - shows: Club-owner tournament management dashboard. Left nav (Club Overview, Live Tables, Tournament Center [active], Member Registry, Revenue Reports, Global Settings). Top KPI ribbon in gold panels: Active Tournaments 3, Total Prize Pools $150,000, Registered Players 26, Projected Revenue $125,000 / $450,
    - maps to: /tournaments (OwnerCenter) + /clubs owner dashboard — the club-scoped tournament ops view with alerts + live chat

- **detailed_private_table_setup_4** — Global Announcement Control Center
    - shows: Nav (Club Overview [active], Wardrobe, Inventory, Dye Shop). Left column: 'Announcement Message' rich-text editor (Bold/Italic/Underline/link/color toolbar + textarea 'Enter your club-wide announcement here…'), 'Target Audience' checkboxes (All Players [checked], Private Tables Only, Tournament Play
    - maps to: /admin Announcements section — club/global broadcast composer

- **detailed_private_table_setup_5** — High Rollers Club — Club Overview (dashboard)
    - shows: Same left nav as screen 1 with Club Overview [active]. Top KPI ribbon: Total Members 1,245, Active Tables 18, 24h Volume $15,450,000, Average Pot Size $12,500, Total Rake Collected $450,000 (with sparklines). Body tabs: Featured Tables / Upcoming Tournaments / Financial Analytics / Player High Score
    - maps to: /clubs owner Dashboard (StatCards + QuickStats + charts + activity)

- **detailed_private_table_setup_7** — Club Owner Public Table Browser
    - shows: Header 'Club Owner Public Table Browser' with filter tabs Stakes / Game Type / Available Seats over an ornate gold-framed casino layout. Sidebar Club Owner Tools (Create New Public Game [active], Member Analytics, Sponsorship Reports). Main area: 4-wide grid of photoreal 3D table cards, each 'High R
    - maps to: /lobby public table list (PublicLobbyList + LobbyTableCard), viewed as the owner's 'Create New Public Game' browse surface

- **detailed_private_table_setup_8** — Advanced Table Access Configuration
    - shows: Gold-bordered full form 'Advanced Table Access Configuration'. General Info: Table Name field, 'Game Sponsor: Club Owner'. Access Type segmented: Members Only / Invite Only - Code Required [selected] / Public (disabled, tooltip 'Only Club Owners can sponsor Public Games'). Table Join Code field + Au
    - maps to: /lobby PrivateTableSetup — the private/invite table creation & access-control form

- **detailed_private_table_setup_9** — Comprehensive Global Club Settings
    - shows: Club admin settings grid: Club Preferences (timezone, language dropdowns + Send Here), Financial Defaults (rake % slider, max buy-in caps + Send Save), Security (2FA Enabled/Disabled toggle, Admin Roles + Moderator role dropdowns + Send Role), Club Branding (upload logo, Classic/Cyber UI theme radio
    - maps to: /clubs club-admin settings + /admin: global club configuration (rake config, roles/permissions, branding, 2FA, API/wallet integrations)

- **detailed_private_table_setup_13** — Classic Public Game Browser
    - shows: Ornate classic gold-framed lobby: Stakes filter (Low/Medium/High toggle + dropdown), Game Type dropdown (ALL). Grid of 6 identical live table cards each with green-felt table thumbnail, LIVE dot, Table Name 'High Stakes Elite', Blind Levels 100/200, Players 7/10, gold JOIN TABLE button. Top nav: Das
    - maps to: /lobby game-mode browser: public cash-table listing/join (stakes + game-type filters, seat counts, join)

- **detailed_private_table_setup_14** — Avatar Marketplace and Tiers
    - shows: Avatar store: Premium Account Benefits banner (Ultra-Rare Drops, VIP Support, Priority Access), Premium/Basic Avatars tabs, 6 Cyber-Knight avatar cards (X1-X4, 50,000 Gold / 0.5 ETH each, Purchase buttons), right Purchase Summary cart (line items, Total 170,000 Gold, Pay with Gold / Pay with ETH rad
    - maps to: /marketplace avatar store + /studio: buy avatars w/ Gold or ETH, cart/checkout, premium tiers

- **detailed_private_table_setup_15** — Comprehensive Player Profile Dashboard (Player Account & Avatar Setup)
    - shows: Two-panel onboarding: left Player Account & Avatar Setup form (Full Name, Email Address, Password, Create Account); right Initial Avatar Selection with 4 large full-body avatar portraits (female cyber-knight, mech-suit, blue neon woman, hooded assassin) and a gold PROCEED TO CUSTOMIZATION button.
    - maps to: /profile + /studio + signup: account creation with initial free avatar pick, leading into avatar customization

- **detailed_private_table_setup_16** — Comprehensive Player Profile Dashboard
    - shows: Full member profile viewed by club staff: large character portrait, Personal Bio & Stats (member since, VIP tier Platinum), Performance Dashboard (hands played, win/loss %, biggest pot, tournament points), scrollable Recent Transactions ledger (buy-in/cash-out/credit-limit with dates), Social & Beha
    - maps to: /admin (member registry / player management detail) with overlap into /profile; the staff-facing credit-limit/bonus/flag controls map to /admin RPCs

- **detailed_private_table_setup_17** — Comprehensive Prize Pool & Tournament Analytics
    - shows: Club-owner tournament finance view: Financial Overview strip (Total Buy-ins 12M, Re-buys/Add-ons 1.5M, Club Rake 2M, Net Prize Pool 10M chips), a full Payout Table (place / percentage / chip value / paid checkmarks) with a highlighted 1st-place row, a donut Payout Distribution chart, Tournament Prog
    - maps to: /tournaments (payout/prize-pool analytics + finalize) crossed with /admin club-owner revenue reporting

- **detailed_private_table_setup_19** — Premium Avatar Marketplace View
    - shows: Premium Exclusive avatar storefront grid: cards for Mythic – Athena Prime (25,000 Gold / 2.5 ETH, 1/1), two 1/1 Exclusive Golden Spartan (30,000 Gold / 3 ETH) and more below, each with a 360° rotate control and dual-currency pricing (Gold + ETH). Club-owner left rail.
    - maps to: /marketplace (avatar/cosmetic storefront, dual-currency Gold+ETH, rarity tiers)

- **detailed_private_table_setup_20** — Public Lobby
    - shows: A different, lighter visual style (script wordmark, casino-floor background, top nav Dashboard/Tables/Members/Settings). A scrollable list of joinable tables (High Rollers Club Elite, Prestige Poker Room, Diamond Flush, Prestige Poker...) each row with table thumbnail, 100/200 capacity, a 5/10 stake
    - maps to: /lobby (public table browser / join-table list) — also overlaps /clubs table browse

- **detailed_private_table_setup_21** — Comprehensive Player Security Dashboard
    - shows: Self-service account settings, three columns: Profile & Edit (sub-tabs Profile/Security Settings/Preferences, circular avatar, Edit Avatar button); Security & Privacy (Password Reset, 2FA toggle ENABLED, Linked Social Accounts Google/Facebook, Preferences email-notifications & privacy-mode toggles);
    - maps to: /profile + /wallet + security settings (2FA, linked accounts, connected crypto wallets, chips balance)

- **detailed_private_table_setup_23** — Refined Nano Banana AI Customizer
    - shows: AI avatar creator: Avatar Customization Lab with a free-text 'Describe your style' prompt box, Prompt Assistant preset dropdown (Cyberpunk Enforcer / Tactical Stealth / Royal Assassin), a wireframe Live Logic Preview, Render with Nano Banana button with 'Ready for Rendering' status, and locked premi
    - maps to: /studio (AI avatar creator — text prompt, presets, render, save; Tripo/Nano-Banana pipeline)

- **detailed_private_table_setup_24** — Club Member Analytics Dashboard
    - shows: Club-owner analytics workspace with left nav (Member Analytics / Create New Public Game / Sponsorship Reports). Three chart cards: Active Members line chart (climbing to ~280), Total Table Volume monthly bar chart, New vs Returning Players donut (57% / 33%). Below, a Member Activity table listing pl
    - maps to: /admin (club-owner analytics) overlapping /clubs owner tools; charts + member activity table

- **detailed_private_table_setup_27** — Premium Wallet Connection Interface
    - shows: Wallet-connect chooser with left nav (My Wallets / Transactions / Settings / Help & Support). Four provider cards each with CONNECT button: MetaMask, Coinbase Wallet, WalletConnect, Phantom. Footer security note: 'only requests signature permissions... never access your private keys or seed phrases.
    - maps to: /wallet (connect external crypto wallet flow)

- **detailed_private_table_setup_29** — Comprehensive Avatar Wardrobe Hub
    - shows: Avatar wardrobe/inventory. Left nav (Wardrobe / Inventory / Dye Shop). Center 3D female avatar in gold cyber-suit with Quick Stats (Armor Rating 3500, Style Score 980). Right 'Owned' grid of gear items with rarity borders (Tactical Vest, Data Glove +2 Hacking, Teal Neon Duster, Golden Cyber Suit Leg
    - maps to: /studio wardrobe / equip, overlapping /marketplace (owned cosmetics) and /profile loadout

- **full_body_avatar_poker_table_2** — Approve New Player
    - shows: Centered 'APPROVE NEW PLAYER' confirmation modal over the live table: single applicant card with circular portrait, Username: ShadowRunner, Bankroll: $500,000, Rarity: Legendary, and gold 'APPROVE & SEAT' + 'DECLINE' buttons. Admin Control menu open (Pause Game / Manage Table / Approve New Players).
    - maps to: /table admin approve-player confirmation dialog (waiting-list APPROVE detail step) + /membership rarity gating

- **full_body_avatar_poker_table_3** — Table Settings
    - shows: 'Table Settings' modal (basic tier): Blinds Configuration (Small Blind $5,000 / Big Blind $10,000), Ante toggle ON + Amount $1,000, Turn Time Limit slider (15s–60s, set 30s), Buy-in Range Min $100,000 / Max $1,000,000, Table Privacy Public/Private toggle, SAVE & RESUME / CANCEL. Waiting-list rail (A
    - maps to: /table admin table-settings overlay; overlaps /lobby private-table setup (blinds/ante/buy-in/privacy config)

- **full_body_avatar_poker_table_6** — High Rollers Club (live table — full-body avatars, flop dealt)
    - shows: Base live 9-max cinematic table with NO modal open: full-body cyberpunk/robot avatars seated in chairs around a green felt, HIGH ROLLERS CLUB crest, community flop (A / K / K) + two undealt outlines, central chip pot, hero hole cards A-K, Current Bet $5,000 pill, seat name/stack pills (Vortek, Cyber
    - maps to: /table 3D cinematic live table (3D/full-body avatar render mode) with admin-control affordance

- **full_body_avatar_poker_table_7** — High Rollers Club — live table (Admin Control + Waiting List)
    - shows: Full 9-seat cinematic table mid-hand with full-body avatars in leather chairs, board A-K-10-5-2, Total Pot $3,500,000, hero hole cards A-4. Top-right Admin Control dropdown (Pause Game, Table Settings, Player Management with alert badge). Right rail WAITING LIST with 3 pending join requests (Avatar 
    - maps to: /table (3D cinematic) + admin/waiting-list overlay; base live-table state with the admin control panel and join-request approval rail

- **full_body_avatar_poker_table_11** — Global Dashboard (club home)
    - shows: Full club-operator dashboard (not a table). Left nav: Home / Tournaments / Member Management / Financial Reports. Three big KPI tiles: Total Members 2,500, Active Tables 15, Total Club Volume 5,000,000 Chips / 25 ETH. 'Ongoing Featured Games' row of 3 live mini-table previews (Table 1/2/3, 6/9, $50k
    - maps to: /dashboard (club operator home) + /clubs overview; combines dashboard KPIs, member mgmt nav, financial reports, and live-game spectate cards

- **full_body_avatar_poker_table_12** — Tournament Leaderboard
    - shows: Tournament standings screen. Header bar: Current Prize Pool ₮15,000,000, Remaining Players 56/500, Blinds Level 10K/20K (Ante 2K). Podium of top 3 (silver NeonRider #2, gold-crowned CyberKing #1, bronze DataPhantom #3) each with chips + hands played. Ranked table below (Rank / Avatar / Username / To
    - maps to: /tournaments leaderboard/standings view; MTT live ranking with prize pool + blind level header

- **comprehensive_tournament_setup** — Comprehensive Tournament Setup
    - shows: Gold-on-black HRC-branded 4-tab wizard (General / Structure / Financials / Rules) rendered as a single wide multi-column form. Unique controls: Tournament Name, Start Date & Time + Registration Close Time pickers, Buy-in Amount + Registration Fee, Late Registration toggle, Number of Levels dropdown,
    - maps to: /tournaments (host/create-tournament flow) + /lobby tournament-create; overlaps backend Tournaments task #41

- **club_owner_management_hub** — Member Management (Club Owner hub)
    - shows: Gold/graphite club-owner console with left rail (Dashboard / Tables / Tournaments / Members active / Financials), top bar showing Total Club Bankroll $2,540,000 and Online Members 128/500. Center: member roster table (Avatar, Member Name, Join Date, Total Contribution) with per-row Edit / Kick / Pro
    - maps to: /admin or /clubs/[id] owner management + /table host-control; membership contribution accounting

- **initial_club_setup_screen** — Initial Club Setup
    - shows: Gold glass modal-form on a warm vault backdrop, HRC crest. Four numbered sections: 1 Club Identity (Club Name, Club Tag 3-4 char), 2 Branding (Upload Club Logo circle + Color Picker swatches gold/teal/red), 3 Membership Settings (Club Type dropdown OPEN showing Private/Semi-Private/Public + 'Admin A
    - maps to: /clubs/new (create-club wizard)

- **tournament_lobby_1** — Tournaments - The Obsidian Invitational (lobby)
    - shows: Dark cyan tournament lobby with left app-nav. Featured MAJOR EVENT hero 'The Obsidian Invitational' (Prize Pool 500k CR, Buy-in 25k, Players 18/30, Level Elite, Register Now / Details, character art). Active Tournaments list (Neon Velocity Turbo, Emerald High Stakes, Quick Fire Sit & Go, High Noon S
    - maps to: /tournaments (player lobby / detail focus)

- **tournament_lobby_2** — Neon Vault Poker - Tournaments (Featured Events grid)
    - shows: Same tournaments domain but different composition: two side-by-side Featured Event cards (The Obsidian Invitational MAJOR SERIES w/ countdown 02:14:45; Neon Blitz Showdown TURBO 42/100), header stat tiles Active Tables 1,248 + Total Prize Pool 4.2M, then 'Ongoing & Upcoming' list with Filter/Sort an
    - maps to: /tournaments (alternate lobby layout: dual-featured + Watch/Register rows)

- **member_management** — High Rollers Club - Elite Membership Registry
    - shows: Cyan 'Neon Vault Poker / Admin Console' shell. Stat tiles: Total Stakes 2.4M (+12.5%), Active Now 842, Pending Requests 18 (urgent), VIP Status Elite (98th pct). Elite Membership Registry table with tabs All Members/Pending/Banned; rows show Member Identity (name+role+avatar), Current Status pill (P
    - maps to: /admin (member/KYC approval console) + /membership verification

- **seed_reveal_verification** — Neon Vault - Seed Reveal
    - shows: Single-session provably-fair verifier card: Secure Protocol v2.4, Game Session ID #NV-8829-QX-P0. Server Seed Hash (LOCKED) long hash block with lock icon + 'pre-committed during initial deal'. Player Seed Input field (NeonPhantom_99) + big 'REVEAL & VERIFY' button. Result state: VERIFICATION SUCCES
    - maps to: /provably-fair (verify a specific session / seed-reveal flow)


## BUILT

- **detailed_private_table_setup_18** — Premium Account Upgrade Experience
    - shows: Subscription upsell splash: full-height gold cybernetic hero figure, a Premium Perks panel (Access to Nano Banana Pro Rendering, Exclusive 1/1 Avatar Marketplace, Priority Seating at High-Stakes Tables, Private VIP Chat), a Monthly/Yearly billing toggle, and a large UPGRADE TO PREMIUM CTA. Club-owne
    - maps to: /membership (subscription tiers + Monthly/Yearly billing + upgrade checkout)

- **game_mode_selection_lobby** — High Rollers Club - Game Mode Selection
    - shows: Full-bleed server-room hero with 3 large gold-framed cards: PRIVATE TABLE (Create Private Table), PUBLIC GAME (locked, padlock overlay + 'Only Club Owners can sponsor Public Games' tooltip, disabled 'Create Public Game (Locked)'), and TOURNAMENT (Join Tournament). Back to Dashboard button; footer Ab
    - maps to: /lobby (game-mode selection landing) - the fork into private-table setup vs public vs tournament

- **dashboard** — High Rollers Club - Dashboard (Operative Profile)
    - shows: Cyan/graphite app shell, left nav (Dashboard/Live Tables/Tournaments/Vault/Settings) + VIP Operative footer + Deposit Credits. Main: Operative Profile hero 'ELITE PREDATOR' (Total Bankroll $4,289,500, Win Rate 68.4%), Global Standing rank card (Diamond III progress, next reward), Active High Stakes 
    - maps to: /dashboard

- **live_table_view** — Live Tables - live hand (YOUR TURN)
    - shows: Full 2D table view: oval felt, TOTAL POT 425,000 glowing, board A K Q + two undealt slots, seat pods (CIPHER_V 340,900; THINKING... 1,024,500; a FOLDED seat; an ALL-IN seat ~98k on right), hero NEONGHOST 85,200 with green 'YOUR TURN' ring + two ace hole cards. Bottom action bar: Raise Amount slider 
    - maps to: /table (live cinematic table + action bar + HUD). Our real table is 3D R3F; this is the flat reference for state+controls

- **fairness_audit_dashboard** — Neon Vault - Fairness Audit Dashboard
    - shows: Provably-fair overview: left nav (Overview/Fairness/Security/History/Settings) + REVEAL SEED button. Live Entropy Stream diagram (Chainlink VRF -> Master Seed MIXING_ACTIVE -> User Entropy mouse_clicks) with 128-bit pool density, 99.98% randomness score, ACTIVE hardware. System Health card (RNG node
    - maps to: /provably-fair (main fairness dashboard)
