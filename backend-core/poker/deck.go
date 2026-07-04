package poker

import (
	"crypto/rand"
	"math/big"
)

// NewSecureDeck returns a shuffled 52-card deck.
// Prefers engine-math (CSPRNG sidecar); falls back to crypto/rand in Go.
func NewSecureDeck() []Card {
	if codes, ok := shuffleFromEngine(); ok {
		return codesToDeck(codes)
	}
	return shuffleCryptoFallback()
}

func shuffleCryptoFallback() []Card {
	deck := make([]Card, 0, 52)
	for suit := 0; suit < 4; suit++ {
		for rank := 2; rank <= 14; rank++ {
			deck = append(deck, Card{Rank: rank, Suit: suit})
		}
	}
	for i := len(deck) - 1; i > 0; i-- {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(i+1)))
		if err != nil {
			continue
		}
		j := int(n.Int64())
		deck[i], deck[j] = deck[j], deck[i]
	}
	return deck
}

func codesToDeck(codes []string) []Card {
	deck := make([]Card, 0, len(codes))
	for _, code := range codes {
		if len(code) < 2 {
			continue
		}
		rankChar := string(code[0])
		suitChar := string(code[len(code)-1])
		rank := 0
		switch rankChar {
		case "A":
			rank = 14
		case "K":
			rank = 13
		case "Q":
			rank = 12
		case "J":
			rank = 11
		case "T":
			rank = 10
		default:
			if rankChar >= "2" && rankChar <= "9" {
				rank = int(rankChar[0] - '0')
			}
		}
		suit := 0
		switch suitChar {
		case "s":
			suit = 0
		case "h":
			suit = 1
		case "d":
			suit = 2
		case "c":
			suit = 3
		}
		if rank > 0 {
			deck = append(deck, Card{Rank: rank, Suit: suit})
		}
	}
	if len(deck) != 52 {
		return shuffleCryptoFallback()
	}
	return deck
}
