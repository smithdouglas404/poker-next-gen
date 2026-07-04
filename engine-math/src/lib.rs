//! Mathematical engine for Poker Next-Gen.
//!
//! Thin, well-typed wrappers over the [`rs_poker`] core so the rest of the
//! network (Go backend via FFI, or a future WASM frontend module) can evaluate
//! and compare Texas Hold'em hands without re-implementing hand ranking.

use rs_poker::core::{Hand, Rank, Rankable};

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
    fn evaluates_seven_cards() {
        // Two hole cards + five community cards.
        let rank = rank_hand("AsKs" /* hole */).is_err();
        assert!(rank, "fewer than five cards should error");
        let full = rank_hand("AsKsQsJsTs2h3d").expect("seven cards valid");
        assert_eq!(full.category(), CoreRank::StraightFlush);
    }
}
