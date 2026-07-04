-- Poker Next-Gen custom schema (prefix poker_ to avoid Nakama system tables)

CREATE TABLE IF NOT EXISTS poker_club (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    currency TEXT NOT NULL DEFAULT 'USD',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS poker_owner (
    id TEXT PRIMARY KEY,
    club_id TEXT NOT NULL REFERENCES poker_club(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'owner',
    equity_bps INT NOT NULL DEFAULT 0,
    can_configure BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(club_id, user_id)
);

CREATE TABLE IF NOT EXISTS poker_player_balance (
    id TEXT PRIMARY KEY,
    club_id TEXT NOT NULL REFERENCES poker_club(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    balance BIGINT NOT NULL DEFAULT 0,
    locked_amount BIGINT NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'USD',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(club_id, user_id)
);

CREATE TABLE IF NOT EXISTS poker_rake_config (
    id TEXT PRIMARY KEY,
    club_id TEXT NOT NULL REFERENCES poker_club(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    percent_bps INT NOT NULL DEFAULT 500,
    cap_minor BIGINT NOT NULL DEFAULT 500,
    no_flop_no_drop BOOLEAN NOT NULL DEFAULT TRUE,
    min_pot_minor BIGINT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS poker_tournament (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    variant TEXT NOT NULL DEFAULT 'texas-holdem',
    buy_in_minor BIGINT NOT NULL DEFAULT 0,
    fee_minor BIGINT NOT NULL DEFAULT 0,
    starting_stack BIGINT NOT NULL DEFAULT 10000,
    max_players INT NOT NULL DEFAULT 180,
    max_seats_per_table INT NOT NULL DEFAULT 6,
    status TEXT NOT NULL DEFAULT 'registering',
    scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS poker_tournament_registration (
    id TEXT PRIMARY KEY,
    tournament_id TEXT NOT NULL REFERENCES poker_tournament(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    username TEXT NOT NULL DEFAULT '',
    stack BIGINT NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'registered',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tournament_id, user_id)
);

CREATE TABLE IF NOT EXISTS poker_blind_level (
    id TEXT PRIMARY KEY,
    tournament_id TEXT NOT NULL REFERENCES poker_tournament(id) ON DELETE CASCADE,
    level INT NOT NULL,
    small_blind BIGINT NOT NULL,
    big_blind BIGINT NOT NULL,
    ante BIGINT NOT NULL DEFAULT 0,
    duration_secs INT NOT NULL DEFAULT 600,
    is_break BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS poker_prize_pool (
    id TEXT PRIMARY KEY,
    tournament_id TEXT NOT NULL REFERENCES poker_tournament(id) ON DELETE CASCADE,
    rank_from INT NOT NULL,
    rank_to INT NOT NULL,
    payout_bps INT NOT NULL,
    guaranteed_minor BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS poker_balance_rule (
    id TEXT PRIMARY KEY,
    tournament_id TEXT NOT NULL REFERENCES poker_tournament(id) ON DELETE CASCADE,
    max_seat_difference INT NOT NULL DEFAULT 1,
    break_table_at_or_below INT NOT NULL DEFAULT 2,
    strategy TEXT NOT NULL DEFAULT 'balanced',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS poker_global_wallet (
    user_id TEXT PRIMARY KEY,
    balance BIGINT NOT NULL DEFAULT 100000,
    currency TEXT NOT NULL DEFAULT 'USD',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_poker_owner_club ON poker_owner(club_id);
CREATE INDEX IF NOT EXISTS idx_poker_balance_club_user ON poker_player_balance(club_id, user_id);
CREATE INDEX IF NOT EXISTS idx_poker_tournament_status ON poker_tournament(status);

CREATE TABLE IF NOT EXISTS poker_club_house_balance (
    club_id TEXT PRIMARY KEY REFERENCES poker_club(id) ON DELETE CASCADE,
    balance BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS poker_rake_ledger (
    id TEXT PRIMARY KEY,
    club_id TEXT NOT NULL REFERENCES poker_club(id) ON DELETE CASCADE,
    amount BIGINT NOT NULL,
    match_id TEXT NOT NULL DEFAULT '',
    hand_no INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS poker_tournament_table (
    id TEXT PRIMARY KEY,
    tournament_id TEXT NOT NULL REFERENCES poker_tournament(id) ON DELETE CASCADE,
    match_id TEXT NOT NULL,
    seated_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE poker_tournament ADD COLUMN IF NOT EXISTS director_match_id TEXT NOT NULL DEFAULT '';
ALTER TABLE poker_tournament ADD COLUMN IF NOT EXISTS current_level INT NOT NULL DEFAULT 0;
ALTER TABLE poker_tournament ADD COLUMN IF NOT EXISTS level_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE poker_tournament_registration ADD COLUMN IF NOT EXISTS match_id TEXT NOT NULL DEFAULT '';
ALTER TABLE poker_tournament_registration ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS poker_audit_event (
    id TEXT PRIMARY KEY,
    match_id TEXT NOT NULL DEFAULT '',
    room_id TEXT NOT NULL DEFAULT '',
    club_id TEXT NOT NULL DEFAULT '',
    hand_no INT NOT NULL DEFAULT 0,
    event_type TEXT NOT NULL,
    payload_hash TEXT NOT NULL,
    payload_json JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS poker_audit_event_match_hand_idx ON poker_audit_event (match_id, hand_no);
