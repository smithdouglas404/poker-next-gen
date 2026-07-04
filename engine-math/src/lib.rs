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
}
