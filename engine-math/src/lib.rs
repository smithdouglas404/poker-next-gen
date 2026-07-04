//! Mathematical engine for Poker Next-Gen.
//!
//! Thin, well-typed wrappers over the [`rs_poker`] core so the rest of the
//! network (Go backend via FFI, or a future WASM frontend module) can evaluate
//! and compare Texas Hold'em hands without re-implementing hand ranking.

use rs_poker::core::{Hand, Rank, Rankable};
use rs_poker::holdem::MonteCarloGame;

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
    fn evaluates_seven_cards() {
        // Two hole cards + five community cards.
        let rank = rank_hand("AsKs" /* hole */).is_err();
        assert!(rank, "fewer than five cards should error");
        let full = rank_hand("AsKsQsJsTs2h3d").expect("seven cards valid");
        assert_eq!(full.category(), CoreRank::StraightFlush);
    }
}
