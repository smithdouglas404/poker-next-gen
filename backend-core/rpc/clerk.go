package rpc

import (
	"context"
	"crypto"
	"crypto/rsa"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"math/big"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/heroiclabs/nakama-common/api"
	"github.com/heroiclabs/nakama-common/runtime"
)

// Clerk (clerk.com) social/OAuth bridge. The frontend authenticates with Clerk
// (Google, etc.), obtains a short-lived Clerk session JWT, then calls Nakama's
// public authenticateCustom passing that JWT in vars["clerk_jwt"]. The
// before-hook below verifies the JWT's RS256 signature against Clerk's JWKS,
// checks issuer + expiry, and rewrites the account id to a stable "clerk:<sub>"
// so a real Nakama account is created/linked. Possession of a valid Clerk token
// is the only way to pass — a client can't forge the sub. Disabled (no-op) when
// CLERK_JWT_ISSUER is unset, so the app runs unchanged without Clerk configured.

// clerkIssuer returns the configured Clerk issuer (Frontend API origin), or "".
func clerkIssuer() string {
	return strings.TrimRight(strings.TrimSpace(os.Getenv("CLERK_JWT_ISSUER")), "/")
}

// ClerkEnabled reports whether the Clerk bridge is configured.
func ClerkEnabled() bool { return clerkIssuer() != "" }

type jwk struct {
	Kid string `json:"kid"`
	Kty string `json:"kty"`
	N   string `json:"n"`
	E   string `json:"e"`
	Alg string `json:"alg"`
	Use string `json:"use"`
}

type jwksDoc struct {
	Keys []jwk `json:"keys"`
}

var (
	jwksMu       sync.RWMutex
	jwksCache    map[string]*rsa.PublicKey
	jwksFetched  time.Time
	jwksClient   = &http.Client{Timeout: 8 * time.Second}
	errNoKey     = errors.New("no matching signing key")
)

// jwksURLFor derives the JWKS endpoint from an issuer origin.
func jwksURLFor(issuer string) string { return issuer + "/.well-known/jwks.json" }

// loadJWKS fetches and caches Clerk's signing keys (refreshed at most every 5
// min, or on demand when a kid is missing — key rotation).
func loadJWKS(force bool) (map[string]*rsa.PublicKey, error) {
	jwksMu.RLock()
	if !force && jwksCache != nil && time.Since(jwksFetched) < 5*time.Minute {
		c := jwksCache
		jwksMu.RUnlock()
		return c, nil
	}
	jwksMu.RUnlock()

	iss := clerkIssuer()
	if iss == "" {
		return nil, errors.New("clerk not configured")
	}
	resp, err := jwksClient.Get(jwksURLFor(iss))
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, errors.New("jwks fetch status " + resp.Status)
	}
	var doc jwksDoc
	if err := json.NewDecoder(resp.Body).Decode(&doc); err != nil {
		return nil, err
	}
	keys := map[string]*rsa.PublicKey{}
	for _, k := range doc.Keys {
		if k.Kty != "RSA" {
			continue
		}
		nb, err := base64.RawURLEncoding.DecodeString(k.N)
		if err != nil {
			continue
		}
		eb, err := base64.RawURLEncoding.DecodeString(k.E)
		if err != nil {
			continue
		}
		e := 0
		for _, b := range eb {
			e = e<<8 | int(b)
		}
		keys[k.Kid] = &rsa.PublicKey{N: new(big.Int).SetBytes(nb), E: e}
	}
	jwksMu.Lock()
	jwksCache = keys
	jwksFetched = time.Now()
	jwksMu.Unlock()
	return keys, nil
}

// verifyClerkToken verifies a Clerk RS256 JWT against the JWKS and issuer,
// returning the subject (Clerk user id) and email claim. It is exported-ish via
// the hook only; kept package-private otherwise.
func verifyClerkToken(rawToken string) (sub, email string, err error) {
	parts := strings.Split(strings.TrimSpace(rawToken), ".")
	if len(parts) != 3 {
		return "", "", errors.New("malformed token")
	}
	headerJSON, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return "", "", errors.New("bad header")
	}
	var header struct {
		Alg string `json:"alg"`
		Kid string `json:"kid"`
	}
	if err := json.Unmarshal(headerJSON, &header); err != nil {
		return "", "", errors.New("bad header json")
	}
	if header.Alg != "RS256" {
		return "", "", errors.New("unexpected alg")
	}
	sig, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		return "", "", errors.New("bad signature encoding")
	}

	verify := func(force bool) error {
		keys, kerr := loadJWKS(force)
		if kerr != nil {
			return kerr
		}
		pub, ok := keys[header.Kid]
		if !ok {
			return errNoKey
		}
		digest := sha256.Sum256([]byte(parts[0] + "." + parts[1]))
		return rsa.VerifyPKCS1v15(pub, crypto.SHA256, digest[:], sig)
	}
	if verr := verify(false); verr != nil {
		// Key may have rotated — retry once with a forced JWKS refresh.
		if verr == errNoKey {
			if verr = verify(true); verr != nil {
				return "", "", verr
			}
		} else {
			return "", "", verr
		}
	}

	// Signature valid — now validate claims.
	payloadJSON, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return "", "", errors.New("bad payload")
	}
	var claims struct {
		Iss   string `json:"iss"`
		Sub   string `json:"sub"`
		Exp   int64  `json:"exp"`
		Nbf   int64  `json:"nbf"`
		Email string `json:"email"`
	}
	if err := json.Unmarshal(payloadJSON, &claims); err != nil {
		return "", "", errors.New("bad payload json")
	}
	if claims.Iss != clerkIssuer() {
		return "", "", errors.New("issuer mismatch")
	}
	now := time.Now().Unix()
	if claims.Exp != 0 && now > claims.Exp {
		return "", "", errors.New("token expired")
	}
	if claims.Nbf != 0 && now+30 < claims.Nbf {
		return "", "", errors.New("token not yet valid")
	}
	if claims.Sub == "" {
		return "", "", errors.New("missing subject")
	}
	return claims.Sub, claims.Email, nil
}

// ClerkBeforeAuthCustom is the before-authenticate-custom hook. When the caller
// supplies vars["clerk_jwt"], it verifies the token and rewrites the account id
// to "clerk:<sub>" (a stable, unforgeable key). Requests without a clerk_jwt var
// pass through untouched so device/email/custom auth is unaffected.
func ClerkBeforeAuthCustom(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, in *api.AuthenticateCustomRequest) (*api.AuthenticateCustomRequest, error) {
	if in == nil || in.Account == nil || in.Account.Vars == nil {
		return in, nil
	}
	token := in.Account.Vars["clerk_jwt"]
	if token == "" {
		return in, nil // not a Clerk-bridged auth
	}
	if !ClerkEnabled() {
		return nil, runtime.NewError("clerk auth is not configured", 13)
	}
	sub, email, err := verifyClerkToken(token)
	if err != nil {
		logger.Warn("clerk token verification failed: %v", err)
		return nil, runtime.NewError("invalid clerk session", 16)
	}
	in.Account.Id = "clerk:" + sub
	// Carry the email through for downstream linking; drop the raw token.
	delete(in.Account.Vars, "clerk_jwt")
	if email != "" {
		in.Account.Vars["email"] = email
	}
	return in, nil
}
