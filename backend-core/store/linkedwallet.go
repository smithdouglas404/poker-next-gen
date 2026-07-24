package store

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"time"
)

// LinkedWallet is a self-custody external wallet bound to an account after a
// signature challenge proved the caller controls its private key (#91).
type LinkedWallet struct {
	ID        string    `json:"id"`
	Provider  string    `json:"provider"`
	Chain     string    `json:"chain"`
	Address   string    `json:"address"`
	Verified  bool      `json:"verified"`
	CreatedAt time.Time `json:"created_at"`
}

// LinkedWalletStore persists linked wallets and the short-lived nonces used to
// challenge wallet-ownership.
type LinkedWalletStore struct{ db *sql.DB }

func NewLinkedWalletStore(db *sql.DB) *LinkedWalletStore { return &LinkedWalletStore{db: db} }

// IssueNonce mints a random nonce for a user's pending link challenge and stores
// it, returning the nonce the client must include in the signed message.
func (s *LinkedWalletStore) IssueNonce(ctx context.Context, userID string) (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	nonce := hex.EncodeToString(b)
	if _, err := s.db.ExecContext(ctx,
		`INSERT INTO poker_wallet_link_nonce (user_id, nonce) VALUES ($1, $2)`,
		userID, nonce); err != nil {
		return "", err
	}
	return nonce, nil
}

// ConsumeNonce verifies a nonce is present and unexpired for the user, deleting
// it (single-use). ttl bounds how old the challenge may be.
func (s *LinkedWalletStore) ConsumeNonce(ctx context.Context, userID, nonce string, ttl time.Duration) (bool, error) {
	var created time.Time
	err := s.db.QueryRowContext(ctx,
		`SELECT created_at FROM poker_wallet_link_nonce WHERE user_id=$1 AND nonce=$2`,
		userID, nonce).Scan(&created)
	if err == sql.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	_, _ = s.db.ExecContext(ctx, `DELETE FROM poker_wallet_link_nonce WHERE user_id=$1 AND nonce=$2`, userID, nonce)
	if time.Since(created) > ttl {
		return false, nil
	}
	return true, nil
}

// Link upserts a verified wallet for the user (idempotent on user+address).
func (s *LinkedWalletStore) Link(ctx context.Context, userID, provider, chain, address string) (*LinkedWallet, error) {
	id := NewID("lw")
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_linked_wallet (id, user_id, provider, chain, address, verified)
		VALUES ($1, $2, $3, $4, $5, TRUE)
		ON CONFLICT (user_id, address)
		DO UPDATE SET provider = EXCLUDED.provider, chain = EXCLUDED.chain, verified = TRUE`,
		id, userID, provider, chain, address)
	if err != nil {
		return nil, err
	}
	return &LinkedWallet{ID: id, Provider: provider, Chain: chain, Address: address, Verified: true}, nil
}

// List returns the user's linked wallets, newest first.
func (s *LinkedWalletStore) List(ctx context.Context, userID string) ([]LinkedWallet, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, provider, chain, address, verified, created_at
		FROM poker_linked_wallet WHERE user_id=$1 ORDER BY created_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []LinkedWallet{}
	for rows.Next() {
		var w LinkedWallet
		if err := rows.Scan(&w.ID, &w.Provider, &w.Chain, &w.Address, &w.Verified, &w.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, w)
	}
	return out, rows.Err()
}

// Unlink removes a linked wallet the user owns.
func (s *LinkedWalletStore) Unlink(ctx context.Context, userID, address string) error {
	_, err := s.db.ExecContext(ctx,
		`DELETE FROM poker_linked_wallet WHERE user_id=$1 AND address=$2`, userID, address)
	return err
}
