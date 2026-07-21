//! Mathematical engine for Poker Next-Gen.
//!
//! Thin, well-typed wrappers over the [`rs_poker`] core so the rest of the
//! network (Go backend via FFI, or a future WASM frontend module) can evaluate
//! and compare Texas Hold'em hands without re-implementing hand ranking.

use rs_poker::core::{Hand, Rank, Rankable};
use rs_poker::holdem::MonteCarloGame;
use rs_poker::omaha::OmahaHand;
use sha2::{Digest, Sha256};

#[cfg(test)]
use rs_poker::core::CoreRank;

/// Evaluate the best 5-card poker [`Rank`] from a string of cards.
///
/// Cards are two-character codes (value + suit), e.g. `"AsKsQsJsTs"`.
/// Accepts 5, 6, or 7 cards (hole + board) and returns the strongest rank.
///
/// # Errors
/// Returns `Err` if the card string cannot be parsed.
pub fn rank_hand(cards: &str) -> Result<Rank, String> {
    let hand = Hand::new_from_str(cards).map_err(|e| format!("invalid hand '{cards}': {e:?}"))?;
    if hand.count() < 5 {
        return Err(format!("need at least 5 cards, got {}", hand.count()));
    }
    Ok(hand.rank())
}

/// Compare two hands and report which is stronger.
///
/// Returns [`std::cmp::Ordering`] where `Greater` means `a` beats `b`.
///
/// # Errors
/// Returns `Err` if either hand fails to parse.
pub fn compare_hands(a: &str, b: &str) -> Result<std::cmp::Ordering, String> {
    Ok(rank_hand(a)?.cmp(&rank_hand(b)?))
}

const RANKS: [char; 13] = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const SUITS: [char; 4] = ['s', 'h', 'd', 'c'];

fn hand_from_hole_and_board(hole: &str, board: &str) -> Result<Hand, String> {
    Hand::new_from_str(&format!("{hole}{board}"))
        .map_err(|e| format!("invalid cards '{hole}'+'{board}': {e:?}"))
}

/// Monte Carlo equity for each player hole (board may be partial pre-river).
pub fn estimate_equity(holes: &[&str], board: &str, iterations: usize) -> Result<Vec<f32>, String> {
    if holes.len() < 2 {
        return Err("need at least two hands for equity".into());
    }
    let hands: Vec<Hand> = holes
        .iter()
        .map(|h| hand_from_hole_and_board(h, board))
        .collect::<Result<_, _>>()?;
    let mut game = MonteCarloGame::new(hands).map_err(|e| format!("monte carlo setup: {e:?}"))?;
    let iters = iterations.clamp(100, 50_000);
    Ok(game.estimate_equity(iters))
}

/// Showdown winner seat indices (0-based into `holes`); ties return multiple indices.
pub fn showdown_winners(holes: &[&str], board: &str) -> Result<Vec<usize>, String> {
    if holes.is_empty() {
        return Ok(vec![]);
    }
    let mut ranked: Vec<(usize, Rank)> = Vec::with_capacity(holes.len());
    for (i, hole) in holes.iter().enumerate() {
        let rank = rank_hand(&format!("{hole}{board}"))?;
        ranked.push((i, rank));
    }
    let best = ranked
        .iter()
        .map(|(_, r)| r)
        .max()
        .cloned()
        .unwrap_or(Rank::HIGH_CARD_MIN);
    Ok(ranked
        .into_iter()
        .filter(|(_, r)| *r == best)
        .map(|(i, _)| i)
        .collect())
}

/// Batch rank categories for multiple 7-card (or 5+) strings.
pub fn batch_rank(cards: &[&str]) -> Result<Vec<String>, String> {
    cards
        .iter()
        .map(|c| rank_hand(c).map(|r| format!("{:?}", r.category())))
        .collect()
}

/// Cryptographically secure 52-card deck as two-char codes (e.g. "As", "Td").
pub fn shuffle_deck() -> Vec<String> {
    use rand::seq::SliceRandom;
    let mut cards: Vec<String> = Vec::with_capacity(52);
    for &r in &RANKS {
        for &s in &SUITS {
            cards.push(format!("{r}{s}"));
        }
    }
    cards.shuffle(&mut rand::rngs::OsRng);
    cards
}

/// SHA-256 commitment over canonical deck order (concatenated card codes).
pub fn deck_commitment(cards: &[String]) -> String {
    let joined = cards.join("");
    let digest = Sha256::digest(joined.as_bytes());
    hex::encode(digest)
}

// ── Seed-reproducible provably-fair shuffle ──────────────────────────────────
// A 32-byte seed drives a SHA-256 counter-mode CSPRNG through a Fisher-Yates
// shuffle. We commit to SHA-256(seed) BEFORE the deal and reveal the seed AFTER
// the hand, so any player can re-run the exact shuffle and confirm the deck was
// fixed at commit time. This is strictly stronger than committing to the final
// order: the shuffle becomes reproducible (in pure Python, hashlib only), not
// just tamper-evident.

/// Canonical unshuffled 52-card deck (two-char codes).
fn ordered_deck() -> Vec<String> {
    let mut cards: Vec<String> = Vec::with_capacity(52);
    for &r in &RANKS {
        for &s in &SUITS {
            cards.push(format!("{r}{s}"));
        }
    }
    cards
}

/// Deterministically shuffle the canonical deck with a 32-byte seed via a
/// SHA-256 counter-mode CSPRNG driving a Fisher-Yates shuffle. The algorithm is
/// intentionally primitive so ANY language (notably the downloadable pure-Python
/// verifier, hashlib only) reproduces it byte-for-byte:
///
///   block(c) = SHA-256(seed || c_as_le_u64); consume 4-byte little-endian words
///   for i in (n-1..=1): j = next_u32() % (i+1); swap(cards[i], cards[j])
pub fn shuffle_with_seed(seed: &[u8; 32]) -> Vec<String> {
    let mut cards = ordered_deck();
    let n = cards.len();
    let mut counter: u64 = 0;
    let mut block: [u8; 32] = {
        let mut h = Sha256::new();
        h.update(seed);
        h.update(counter.to_le_bytes());
        counter += 1;
        h.finalize().into()
    };
    let mut off = 0usize;
    for i in (1..n).rev() {
        if off + 4 > block.len() {
            let mut h = Sha256::new();
            h.update(seed);
            h.update(counter.to_le_bytes());
            counter += 1;
            block = h.finalize().into();
            off = 0;
        }
        let w = u32::from_le_bytes([block[off], block[off + 1], block[off + 2], block[off + 3]]);
        off += 4;
        let j = (w as usize) % (i + 1);
        cards.swap(i, j);
    }
    cards
}

/// SHA-256 commitment over the raw seed bytes (the pre-deal commit).
pub fn seed_commitment(seed: &[u8]) -> String {
    hex::encode(Sha256::digest(seed))
}

/// A shuffled deck plus the seed that produced it and its commitment.
pub struct SeededDeck {
    pub cards: Vec<String>,
    pub seed_hex: String,
    pub commitment: String,
}

/// Fresh 32-byte seed from the OS CSPRNG, shuffled via SHA-256 CTR → Fisher-Yates.
pub fn shuffle_deck_seeded() -> SeededDeck {
    use rand::RngCore;
    let mut seed = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut seed);
    let cards = shuffle_with_seed(&seed);
    SeededDeck {
        seed_hex: hex::encode(seed),
        commitment: seed_commitment(&seed),
        cards,
    }
}

/// Reproduce a shuffle from a hex-encoded 32-byte seed. Returns (cards,
/// commitment). Errors if the seed isn't 32 bytes of valid hex.
pub fn reproduce_from_seed(seed_hex: &str) -> Result<(Vec<String>, String), String> {
    let bytes = hex::decode(seed_hex.trim()).map_err(|e| format!("bad seed hex: {e}"))?;
    if bytes.len() != 32 {
        return Err(format!("seed must be 32 bytes, got {}", bytes.len()));
    }
    let mut seed = [0u8; 32];
    seed.copy_from_slice(&bytes);
    Ok((shuffle_with_seed(&seed), seed_commitment(&seed)))
}

/// Rank an Omaha hand (PLO4–PLO7): exactly two hole cards + three board cards.
pub fn rank_omaha(hole: &str, board: &str) -> Result<Rank, String> {
    let hand = OmahaHand::new_from_str(hole, board)
        .map_err(|e| format!("invalid omaha hand '{hole}'+'{board}': {e:?}"))?;
    Ok(hand.rank())
}

/// Omaha showdown winner indices (0-based into `holes`).
pub fn omaha_showdown_winners(holes: &[&str], board: &str) -> Result<Vec<usize>, String> {
    if holes.is_empty() {
        return Ok(vec![]);
    }
    let mut ranked: Vec<(usize, Rank)> = Vec::with_capacity(holes.len());
    for (i, hole) in holes.iter().enumerate() {
        let rank = rank_omaha(hole, board)?;
        ranked.push((i, rank));
    }
    let best = ranked
        .iter()
        .map(|(_, r)| r)
        .max()
        .cloned()
        .unwrap_or(Rank::HIGH_CARD_MIN);
    Ok(ranked
        .into_iter()
        .filter(|(_, r)| *r == best)
        .map(|(i, _)| i)
        .collect())
}

/// GTO-style action advice via Monte Carlo equity vs pot odds (CFR-lite approximation).
pub fn gto_advise(
    hero_hole: &str,
    villain_holes: &[&str],
    board: &str,
    pot: f64,
    to_call: f64,
    iterations: usize,
) -> Result<GtoAdvice, String> {
    if hero_hole.is_empty() {
        return Err("hero hole required".into());
    }
    let mut holes: Vec<&str> = vec![hero_hole];
    holes.extend(villain_holes.iter().copied());
    if holes.len() < 2 {
        return Err("need at least one villain for GTO advise".into());
    }
    let eq = estimate_equity(&holes, board, iterations)?;
    let hero_eq = eq[0] as f64;
    let pot_odds = if to_call > 0.0 {
        to_call / (pot + to_call)
    } else {
        0.0
    };
    let ev_call = hero_eq * (pot + to_call) - to_call;
    let mut suggested = "check".to_string();
    let mut rationale = format!(
        "hero equity {:.1}% vs pot odds {:.1}%",
        hero_eq * 100.0,
        pot_odds * 100.0
    );
    if to_call <= 0.0 {
        if hero_eq > 0.55 {
            suggested = "bet".to_string();
            rationale.push_str("; strong equity favors value bet");
        } else {
            suggested = "check".to_string();
            rationale.push_str("; marginal equity — pot control");
        }
    } else if hero_eq >= pot_odds + 0.05 {
        suggested = "call".to_string();
        rationale.push_str("; equity exceeds pot odds");
    } else if hero_eq < pot_odds - 0.05 {
        suggested = "fold".to_string();
        rationale.push_str("; equity below pot odds");
    } else {
        suggested = "call".to_string();
        rationale.push_str("; close spot — mixed strategy call");
    }
    Ok(GtoAdvice {
        suggested_action: suggested,
        hero_equity: hero_eq,
        pot_odds,
        ev_call,
        engine: "rs_poker_equity".to_string(),
        note: "CFR solver available in rs_poker arena; this endpoint uses equity approximation".to_string(),
        rationale,
    })
}

/// Action recommendation from equity vs pot odds.
#[derive(Debug, Clone, serde::Serialize)]
pub struct GtoAdvice {
    pub suggested_action: String,
    pub hero_equity: f64,
    pub pot_odds: f64,
    pub ev_call: f64,
    pub engine: String,
    pub note: String,
    pub rationale: String,
}

/// Genuine CFR (Counterfactual Regret Minimization) advice from rs_poker's
/// `arena::cfr` solver — the real thing, not the equity heuristic in
/// [`gto_advise`]. Fields report the regret-minimized decision plus solver
/// telemetry so callers can see the search actually ran.
#[derive(Debug, Clone, serde::Serialize)]
pub struct CfrAdvice {
    pub suggested_action: String,
    pub amount: f64,
    pub hero_equity: f64,
    pub nodes_explored: usize,
    pub iterations: u64,
    pub deadline_ms: u64,
    /// Whether the solve explored enough of the tree to trust the action. A
    /// deadline-truncated solve biases toward fold, so callers should treat a
    /// `false` here as "low confidence — raise deadline_ms / iterations".
    pub converged: bool,
    pub engine: String,
    pub solver: String,
    pub note: String,
}

/// Node count below which a solve is considered under-converged (and its action
/// untrustworthy — an early stop defaults toward fold).
const CONVERGENCE_MIN_NODES: usize = 20_000;

/// Solve a heads-up spot with rs_poker's arena CFR solver and return the
/// regret-minimized action.
///
/// This is the advanced capability rs_poker is chosen for: `arena::cfr::CFRAgent`
/// explores the game tree from the *exact* spot (known hole cards + board) and
/// picks an action by counterfactual regret minimization (PCFR+). The solve is
/// bounded by BOTH an iteration schedule and a wall-clock `deadline_ms`
/// (whichever fires first) so it is safe to serve behind an HTTP request.
///
/// `pot` is money already in the middle (assumed split evenly across prior
/// rounds); `to_call` is what hero faces this round. Hero is seat 0, to act.
///
/// # Errors
/// Returns `Err` on unparseable cards, a board that is not 0/3/4/5 cards, or a
/// game-state that fails to build.
/// Hard upper bound on CFR tree nodes per solve — guarantees termination and
/// bounds memory/latency regardless of the width/depth schedule.
const NODE_CAP: u64 = 40_000;

pub async fn cfr_advise(
    hero_hole: &str,
    villain_hole: &str,
    board: &str,
    hero_stack: f32,
    villain_stack: f32,
    pot: f32,
    to_call: f32,
    deadline_ms: u64,
    iterations: u64,
) -> Result<CfrAdvice, String> {
    use rs_poker::arena::action::AgentAction;
    use rs_poker::arena::cfr::{
        BudgetConfig, BudgetItem, CFRAgentBuilder, CFRState, ConfigurableActionConfig,
        ConfigurableActionGenerator, TraversalSet,
    };
    use rs_poker::arena::game_state::{Round, RoundData};
    use rs_poker::arena::{Agent, GameStateBuilder};
    use rs_poker::core::{Card, Hand, PlayerBitSet};

    let parse = |s: &str| -> Result<Vec<Card>, String> {
        if s.trim().is_empty() {
            return Ok(vec![]);
        }
        Ok(Hand::new_from_str(s)
            .map_err(|e| format!("invalid cards '{s}': {e:?}"))?
            .iter()
            .collect())
    };

    let hero_cards = parse(hero_hole)?;
    let vill_cards = parse(villain_hole)?;
    if hero_cards.len() != 2 || vill_cards.len() != 2 {
        return Err("cfr_advise requires exactly 2 hole cards each for hero and villain".into());
    }
    let board_cards = parse(board)?;
    let round = match board_cards.len() {
        0 => Round::Preflop,
        3 => Round::Flop,
        4 => Round::Turn,
        5 => Round::River,
        n => return Err(format!("board must be 0, 3, 4, or 5 cards, got {n}")),
    };

    let mut hero_hand = Hand::new_with_cards(hero_cards.clone());
    hero_hand.extend(board_cards.iter().copied());
    let mut vill_hand = Hand::new_with_cards(vill_cards.clone());
    vill_hand.extend(board_cards.iter().copied());

    // Reconstruct a self-consistent 2-player state: hero (seat 0) is to act
    // facing `to_call`; `pot` is already committed (assumed split evenly across
    // prior rounds). Villain has bet `to_call` on the current round.
    let prior_each = (pot / 2.0).max(0.0);
    let stacks = vec![hero_stack, villain_stack];
    let starting_stacks = vec![
        hero_stack + prior_each,
        villain_stack + prior_each + to_call,
    ];
    let player_bet = vec![prior_each, prior_each + to_call];
    let round_player_bet = vec![0.0, to_call];
    let min_raise = to_call.max(1.0);

    let active = PlayerBitSet::new(2);
    let round_data = RoundData::new_with_bets(min_raise, active, 0, round_player_bet);

    let mut game_state = GameStateBuilder::new()
        .round(round)
        .round_data(round_data)
        .stacks(stacks)
        .player_bet(player_bet)
        .big_blind(min_raise)
        .small_blind((min_raise / 2.0).max(1.0))
        .hands(vec![hero_hand, vill_hand])
        .board(board_cards.clone())
        .build()
        .map_err(|e| format!("game state build: {e:?}"))?;
    game_state.starting_stacks = starting_stacks.into();

    let cfr_state = CFRState::new(game_state.clone());
    let traversal_set = TraversalSet::new(game_state.num_players);
    // The default budget does "no recursion past depth 0", which never rolls the
    // hand out to showdown — so the solver can't see the value of calling and
    // collapses to fold. `MaxWidth` with per-depth widths makes it recurse a few
    // levels; `PerDepthIterations` sets wave counts; `NodeCount` is a HARD global
    // cap so the solve always terminates (deadlines only fire between root
    // waves, so deep/wide recursion needs an absolute node bound); `Deadline` is
    // the wall-clock safety cap. All compose under MostRestrictive (tightest
    // wins).
    let budget = BudgetConfig(vec![
        BudgetItem::Deadline {
            millis: deadline_ms.max(50),
        },
        BudgetItem::NodeCount { max: NODE_CAP },
        BudgetItem::PerDepthIterations {
            counts: vec![iterations.max(1), 4, 1],
            fallback: 1,
        },
        BudgetItem::MaxWidth {
            recursive_widths: vec![3, 2, 1],
        },
    ])
    .build();

    let mut agent = CFRAgentBuilder::<ConfigurableActionGenerator>::new()
        .name("gto-cfr")
        .player_idx(0)
        .cfr_state(cfr_state.clone())
        .traversal_set(traversal_set.clone())
        .budget(budget)
        .action_gen_config(ConfigurableActionConfig::default())
        .build();

    let action = agent.act(0, &game_state).await;
    let current_bet = game_state.current_round_bet();
    let (suggested, amount) = match action {
        AgentAction::Fold => ("fold".to_string(), 0.0),
        AgentAction::Call => ("call".to_string(), f64::from(to_call)),
        AgentAction::Bet(x) if x > current_bet => ("raise".to_string(), f64::from(x)),
        AgentAction::Bet(x) => ("call".to_string(), f64::from(x)),
        AgentAction::AllIn => ("all_in".to_string(), f64::from(hero_stack)),
    };

    let hero_equity = estimate_equity(&[hero_hole, villain_hole], board, 2000)
        .ok()
        .and_then(|e| e.first().copied())
        .map(f64::from)
        .unwrap_or(0.0);

    let nodes_explored = cfr_state.node_count();
    let converged = nodes_explored >= CONVERGENCE_MIN_NODES;
    let note = if converged {
        "solve converged".to_string()
    } else {
        format!(
            "under-converged ({nodes_explored} nodes < {CONVERGENCE_MIN_NODES}); \
             raise deadline_ms/iterations for a trustworthy action"
        )
    };

    Ok(CfrAdvice {
        suggested_action: suggested,
        amount,
        hero_equity,
        nodes_explored,
        iterations,
        deadline_ms,
        converged,
        engine: "rs_poker_cfr".to_string(),
        solver: "arena::cfr CFRAgent (PCFR+ counterfactual regret minimization)".to_string(),
        note,
    })
}

/// Per-player result from [`outs`]: exact enumeration of every remaining board
/// completion (not Monte Carlo) via rs_poker's `holdem::OutsCalculator`.
#[derive(Debug, Clone, serde::Serialize)]
pub struct PlayerOutsReport {
    /// Fraction of enumerated boards this player wins outright, as a percentage.
    pub win_percentage: f32,
    /// Fraction of enumerated boards this player ties, as a percentage.
    pub tie_percentage: f32,
    pub wins: usize,
    pub ties: usize,
    pub total_combinations: usize,
    /// Number of cards that are *exclusive* outs for this player (cards that only
    /// ever appear in this player's winning completions).
    pub outs_count: usize,
    /// The exclusive out cards as two-char codes (e.g. `"Ah"`, `"Td"`).
    pub exclusive_outs: Vec<String>,
}

/// Result of [`outs`]: seat 0 is hero, following seats are villains in order.
#[derive(Debug, Clone, serde::Serialize)]
pub struct OutsReport {
    pub players: Vec<PlayerOutsReport>,
    pub engine: String,
}

/// EXACT outs + equity by full board enumeration (no sampling).
///
/// Uses rs_poker's `holdem::OutsCalculator`, which enumerates *every* remaining
/// board completion and reports each player's win/tie counts plus their
/// exclusive outs. Because it enumerates rather than samples, the percentages
/// are exact for the given board. Hero is seat 0.
///
/// # Errors
/// Returns `Err` on unparseable holes/board, fewer than two players, or a board
/// with more than 5 cards.
pub fn outs(
    hero_hole: &str,
    villain_holes: &[&str],
    board: &str,
) -> Result<OutsReport, String> {
    use rs_poker::core::CardBitSet;
    use rs_poker::holdem::OutsCalculator;

    let mut hands: Vec<Hand> = Vec::with_capacity(1 + villain_holes.len());
    hands.push(
        Hand::new_from_str(hero_hole)
            .map_err(|e| format!("invalid hero hole '{hero_hole}': {e:?}"))?,
    );
    for v in villain_holes {
        hands.push(
            Hand::new_from_str(v).map_err(|e| format!("invalid villain hole '{v}': {e:?}"))?,
        );
    }
    if hands.len() < 2 {
        return Err("outs needs a hero and at least one villain".into());
    }

    let mut board_set = CardBitSet::new();
    if !board.trim().is_empty() {
        let board_hand =
            Hand::new_from_str(board).map_err(|e| format!("invalid board '{board}': {e:?}"))?;
        for c in board_hand.iter() {
            board_set.insert(c);
        }
    }

    let calc = OutsCalculator::try_new(board_set, hands)
        .map_err(|e| format!("outs calculator: {e:?}"))?;
    let player_outs = calc.calculate_outs();
    let outcomes = player_outs.outcomes();
    let exclusive = player_outs.get_outs();

    let players = outcomes
        .iter()
        .enumerate()
        .map(|(i, o)| {
            let exclusive_outs: Vec<String> =
                exclusive[i].into_iter().map(|c| c.to_string()).collect();
            PlayerOutsReport {
                win_percentage: o.win_percentage(),
                tie_percentage: o.tie_percentage(),
                wins: o.wins,
                ties: o.ties,
                total_combinations: o.total_combinations,
                outs_count: exclusive[i].count(),
                exclusive_outs,
            }
        })
        .collect();

    Ok(OutsReport {
        players,
        engine: "rs_poker_outs_calculator".to_string(),
    })
}

/// Aggregate range-vs-range equity produced by [`range_equity`].
#[derive(Debug, Clone, serde::Serialize)]
pub struct RangeEquity {
    /// Mean hero equity (0.0–1.0) across sampled concrete matchups.
    pub hero_equity: f64,
    /// Mean villain equity (0.0–1.0) across sampled concrete matchups.
    pub villain_equity: f64,
    /// Number of concrete hands the hero range expanded to.
    pub hero_range_size: usize,
    /// Number of concrete hands the villain range expanded to.
    pub villain_range_size: usize,
    /// How many non-colliding matchups were actually evaluated.
    pub matchups_sampled: usize,
    pub engine: String,
}

/// Number of Monte Carlo rollouts run per sampled concrete matchup inside
/// [`range_equity`] (kept small because many matchups are averaged).
const RANGE_EQUITY_INNER_ITERS: usize = 100;

/// RANGE vs RANGE equity by Monte Carlo over sampled concrete matchups.
///
/// Parses poker range strings (e.g. `"99+"`, `"AKs"`, `"KQo+"`) with rs_poker's
/// `holdem::RangeParser::parse_many`, expanding each side to concrete two-card
/// hands. It then samples `matchups` random hero-vs-villain pairings (skipping
/// any pairing whose hole cards collide with each other or the board) and
/// averages the per-matchup equity from [`estimate_equity`].
///
/// # Errors
/// Returns `Err` on unparseable ranges, empty expansions, or if every sampled
/// matchup collided (no valid pairing to evaluate).
pub fn range_equity(
    hero_range: &str,
    villain_range: &str,
    board: &str,
    matchups: usize,
) -> Result<RangeEquity, String> {
    use rand::seq::SliceRandom;
    use rs_poker::core::CardBitSet;
    use rs_poker::holdem::RangeParser;

    let hero_hands = RangeParser::parse_many(hero_range)
        .map_err(|e| format!("invalid hero range '{hero_range}': {e:?}"))?;
    let villain_hands = RangeParser::parse_many(villain_range)
        .map_err(|e| format!("invalid villain range '{villain_range}': {e:?}"))?;
    if hero_hands.is_empty() || villain_hands.is_empty() {
        return Err("both ranges must expand to at least one concrete hand".into());
    }

    let mut board_set = CardBitSet::new();
    if !board.trim().is_empty() {
        let board_hand =
            Hand::new_from_str(board).map_err(|e| format!("invalid board '{board}': {e:?}"))?;
        for c in board_hand.iter() {
            board_set.insert(c);
        }
    }

    let samples = matchups.clamp(50, 5_000);
    let mut rng = rand::rngs::OsRng;
    let mut hero_sum = 0.0f64;
    let mut villain_sum = 0.0f64;
    let mut counted = 0usize;

    for _ in 0..samples {
        let h = hero_hands.choose(&mut rng).expect("hero range non-empty");
        let v = villain_hands.choose(&mut rng).expect("villain range non-empty");

        // Reject any pairing whose four hole cards collide with the board or one
        // another — MonteCarloGame would otherwise fail to build.
        let mut used = board_set;
        let cards = [h[0], h[1], v[0], v[1]];
        let mut collided = false;
        for c in cards {
            if used.contains(c) {
                collided = true;
                break;
            }
            used.insert(c);
        }
        if collided {
            continue;
        }

        let hero_str = format!("{}{}", h[0], h[1]);
        let vill_str = format!("{}{}", v[0], v[1]);
        let eq = estimate_equity(&[&hero_str, &vill_str], board, RANGE_EQUITY_INNER_ITERS)?;
        hero_sum += f64::from(eq[0]);
        villain_sum += f64::from(eq[1]);
        counted += 1;
    }

    if counted == 0 {
        return Err("no valid (non-colliding) matchups sampled between the ranges".into());
    }

    Ok(RangeEquity {
        hero_equity: hero_sum / counted as f64,
        villain_equity: villain_sum / counted as f64,
        hero_range_size: hero_hands.len(),
        villain_range_size: villain_hands.len(),
        matchups_sampled: counted,
        engine: "rs_poker_range_parser+monte_carlo".to_string(),
    })
}

/// Per-stack ICM dollar equity produced by [`icm`].
#[derive(Debug, Clone, serde::Serialize)]
pub struct IcmResult {
    /// Expected prize value ($) of each chip stack, index-aligned with the input.
    pub equities: Vec<f64>,
    /// Sum of the payout schedule (the prize pool).
    pub total_payout: f64,
    /// Number of tournament simulations averaged.
    pub trials: usize,
    pub engine: String,
}

/// ICM (Independent Chip Model) dollar equity of each chip stack.
///
/// Wraps rs_poker's `simulated_icm::simulate_icm_tournament`, which runs a
/// tournament to completion via random all-in showdowns and returns one
/// realized payout per stack. A single run is just one random finish, so this
/// averages `trials` runs to estimate each stack's expected prize value.
///
/// The underlying simulator works in integer chips/payouts, so fractional
/// inputs are rounded to the nearest whole unit.
///
/// # Errors
/// Returns `Err` on empty stacks or payouts.
pub fn icm(chips: Vec<f64>, payouts: Vec<f64>, trials: usize) -> Result<IcmResult, String> {
    use rs_poker::simulated_icm::simulate_icm_tournament;

    if chips.is_empty() {
        return Err("need at least one chip stack".into());
    }
    if payouts.is_empty() {
        return Err("need at least one payout".into());
    }

    let chip_stacks: Vec<i32> = chips.iter().map(|c| c.round().max(0.0) as i32).collect();
    let payments: Vec<i32> = payouts.iter().map(|p| p.round().max(0.0) as i32).collect();

    let runs = trials.clamp(100, 100_000);
    let n = chip_stacks.len();
    let mut totals = vec![0i64; n];
    for _ in 0..runs {
        let winnings = simulate_icm_tournament(&chip_stacks, &payments);
        for (i, w) in winnings.iter().enumerate() {
            totals[i] += i64::from(*w);
        }
    }

    let equities: Vec<f64> = totals.iter().map(|t| *t as f64 / runs as f64).collect();
    let total_payout = payments.iter().map(|p| f64::from(*p)).sum();

    Ok(IcmResult {
        equities,
        total_payout,
        trials: runs,
        engine: "rs_poker_simulated_icm".to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cmp::Ordering;

    #[test]
    fn royal_flush_ranks() {
        let rank = rank_hand("AsKsQsJsTs").expect("valid hand");
        // A royal/straight flush is the strongest category rs_poker knows.
        assert_eq!(rank.category(), CoreRank::StraightFlush);
    }

    #[test]
    fn straight_flush_beats_full_house() {
        let ord = compare_hands("AsKsQsJsTs", "AhAdAcKhKd").expect("valid hands");
        assert_eq!(ord, Ordering::Greater);
    }

    #[test]
    fn equity_favors_pair_over_high_card() {
        let eq = estimate_equity(&["AsAh", "7c2d"], "", 500).expect("equity");
        assert!(eq[0] > eq[1]);
    }

    #[test]
    fn showdown_picks_winner() {
        let winners = showdown_winners(&["AsAh", "7c2d"], "AdKhQhJs2c").expect("showdown");
        assert_eq!(winners, vec![0]);
    }

    #[test]
    fn shuffle_commitment_is_stable() {
        let cards: Vec<String> = (0..52).map(|i| format!("{i:02}")).collect();
        let h1 = deck_commitment(&cards);
        let h2 = deck_commitment(&cards);
        assert_eq!(h1, h2);
        assert_eq!(h1.len(), 64);
    }

    #[test]
    fn seeded_shuffle_is_reproducible_and_committed() {
        let seed = [7u8; 32];
        // Same seed → identical deck, every time.
        let a = shuffle_with_seed(&seed);
        let b = shuffle_with_seed(&seed);
        assert_eq!(a, b);
        assert_eq!(a.len(), 52);
        // All 52 distinct cards survive the shuffle.
        let mut sorted = a.clone();
        sorted.sort();
        sorted.dedup();
        assert_eq!(sorted.len(), 52);
        // Reproducing from the hex seed matches and the commitment checks out.
        let seed_hex = hex::encode(seed);
        let (cards, commitment) = reproduce_from_seed(&seed_hex).expect("reproduce");
        assert_eq!(cards, a);
        assert_eq!(commitment, seed_commitment(&seed));
        assert_eq!(commitment.len(), 64);
    }

    #[test]
    fn seed_reproduces_known_reference() {
        // Locked reference vector cross-checked against the pure-Python verifier
        // (hashlib only) — if this ever changes, the downloadable verifier breaks.
        let cards = shuffle_with_seed(&[7u8; 32]);
        assert_eq!(cards[0], "6d");
        assert_eq!(cards[1], "2d");
        assert_eq!(cards[51], "9s");
    }

    #[test]
    fn fresh_seeds_differ() {
        let a = shuffle_deck_seeded();
        let b = shuffle_deck_seeded();
        assert_ne!(a.seed_hex, b.seed_hex, "two fresh seeds must differ");
        assert_eq!(a.commitment, seed_commitment(&hex::decode(a.seed_hex).unwrap()));
    }

    #[tokio::test]
    async fn cfr_solver_runs_bounded_and_decides() {
        // Top set of kings facing a tiny bet — a converged solve must never
        // fold the near-nuts (it value-bets/raises or at worst calls).
        let strong = cfr_advise("KsKd", "QhJc", "Kh7d2c", 300.0, 300.0, 100.0, 40.0, 8000, 1500)
            .await
            .expect("cfr solve (strong)");
        assert!(strong.converged, "strong solve under-converged: {}", strong.note);
        assert!(strong.hero_equity > 0.80, "equity wrong: {}", strong.hero_equity);
        assert_eq!(strong.engine, "rs_poker_cfr");
        assert_ne!(
            strong.suggested_action, "fold",
            "converged solver folded top set: {strong:?}"
        );

        // Trash vs aces on a big board facing an all-in — must fold.
        let weak = cfr_advise("3c2d", "AsAh", "AdKsQh", 400.0, 400.0, 200.0, 400.0, 8000, 1500)
            .await
            .expect("cfr solve (weak)");
        assert!(weak.hero_equity < 0.20, "equity wrong: {}", weak.hero_equity);
        assert_eq!(weak.suggested_action, "fold", "should fold trash vs AA: {weak:?}");

        println!(
            "CFR: top-set -> {} (amount {}, {} nodes, converged={}); trash -> {}",
            strong.suggested_action,
            strong.amount,
            strong.nodes_explored,
            strong.converged,
            weak.suggested_action,
        );
    }

    #[test]
    fn omaha_ranks_hand() {
        let rank = rank_omaha("AhAsKhKs", "QhJhTh").expect("omaha rank");
        assert!(format!("{:?}", rank.category()).contains("Flush") || format!("{:?}", rank.category()).contains("Straight"));
    }

    #[test]
    fn outs_flush_draw_vs_set() {
        // Turn Kh7h2d3s (only the river to come): Ah9h (flush draw, behind) vs
        // KsKc (set, ahead). The set is the clear favorite; with one card left
        // the flush draw's hearts are genuine exclusive outs.
        let report = outs("Ah9h", &["KsKc"], "Kh7h2d3s").expect("outs");
        assert_eq!(report.players.len(), 2);
        let hero = &report.players[0];
        let villain = &report.players[1];
        assert!(
            villain.win_percentage > hero.win_percentage,
            "set should beat flush draw: hero {} villain {}",
            hero.win_percentage,
            villain.win_percentage
        );
        // With one card to come the flush draw has live exclusive (heart) outs.
        assert!(hero.outs_count > 0, "flush draw should have exclusive outs");
        assert!(hero.wins > 0, "flush draw should win some completions");
    }

    #[test]
    fn range_equity_favors_dominating_range() {
        // Premium pairs vs a trashy offsuit range preflop — hero should dominate.
        let re = range_equity("QQ+", "72o", "", 300).expect("range equity");
        assert!(re.hero_range_size >= 3, "QQ+ expands to several combos");
        assert!(re.matchups_sampled > 0, "should sample some matchups");
        assert!(
            re.hero_equity > re.villain_equity,
            "QQ+ should crush 72o: hero {} villain {}",
            re.hero_equity,
            re.villain_equity
        );
        assert!(re.hero_equity > 0.75, "hero equity too low: {}", re.hero_equity);
    }

    #[test]
    fn icm_equity_sums_to_prize_pool() {
        // Equal stacks, three paid places: each trial distributes the whole pool,
        // so averaged equities must sum to the total payout exactly.
        let payouts = vec![100.0, 60.0, 40.0];
        let res = icm(vec![1000.0, 1000.0, 1000.0], payouts.clone(), 2000).expect("icm");
        let sum: f64 = res.equities.iter().sum();
        assert_eq!(res.equities.len(), 3);
        assert!(
            (sum - res.total_payout).abs() < 1e-6,
            "icm equity sum {sum} should equal pool {}",
            res.total_payout
        );
        // A dominant chip leader must have the highest $ equity.
        let big = icm(vec![10_000.0, 100.0, 100.0], payouts, 3000).expect("icm big");
        assert!(
            big.equities[0] > big.equities[1] && big.equities[0] > big.equities[2],
            "chip leader should have highest equity: {:?}",
            big.equities
        );
    }
}
