package rpc

import (
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"strings"
	"testing"
	"time"
)

// signTestJWT builds and RS256-signs a JWT with the given claims.
func signTestJWT(t *testing.T, priv *rsa.PrivateKey, kid string, claims map[string]interface{}) string {
	t.Helper()
	b64 := func(v interface{}) string {
		b, _ := json.Marshal(v)
		return base64.RawURLEncoding.EncodeToString(b)
	}
	header := b64(map[string]string{"alg": "RS256", "kid": kid, "typ": "JWT"})
	payload := b64(claims)
	digest := sha256.Sum256([]byte(header + "." + payload))
	sig, err := rsa.SignPKCS1v15(rand.Reader, priv, crypto.SHA256, digest[:])
	if err != nil {
		t.Fatalf("sign: %v", err)
	}
	return header + "." + payload + "." + base64.RawURLEncoding.EncodeToString(sig)
}

// TestVerifyClerkToken exercises the RS256 verifier end-to-end with a locally
// generated key + injected JWKS (no network), covering the happy path plus the
// tamper / wrong-issuer / expired rejections the bridge relies on.
func TestVerifyClerkToken(t *testing.T) {
	priv, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("keygen: %v", err)
	}
	const kid = "testkid-1"
	const issuer = "https://excited-mullet-28.clerk.accounts.dev"
	t.Setenv("CLERK_JWT_ISSUER", issuer)

	// Inject the public key into the JWKS cache so loadJWKS skips the network.
	jwksMu.Lock()
	jwksCache = map[string]*rsa.PublicKey{kid: &priv.PublicKey}
	jwksFetched = time.Now()
	jwksMu.Unlock()

	base := map[string]interface{}{
		"iss":   issuer,
		"sub":   "user_2abcXYZ",
		"email": "player@example.com",
		"exp":   time.Now().Add(time.Hour).Unix(),
		"nbf":   time.Now().Add(-time.Minute).Unix(),
	}
	tok := signTestJWT(t, priv, kid, base)
	sub, email, err := verifyClerkToken(tok)
	if err != nil {
		t.Fatalf("verify happy path: %v", err)
	}
	if sub != "user_2abcXYZ" || email != "player@example.com" {
		t.Fatalf("claims: sub=%q email=%q", sub, email)
	}

	// Tampered signature must fail.
	bad := tok[:len(tok)-4] + "AAAA"
	if _, _, err := verifyClerkToken(bad); err == nil {
		t.Fatalf("tampered token verified")
	}

	// Wrong issuer must fail even with a valid signature.
	wrongIss := map[string]interface{}{}
	for k, v := range base {
		wrongIss[k] = v
	}
	wrongIss["iss"] = "https://evil.example.com"
	if _, _, err := verifyClerkToken(signTestJWT(t, priv, kid, wrongIss)); err == nil || !strings.Contains(err.Error(), "issuer") {
		t.Fatalf("wrong issuer accepted: %v", err)
	}

	// Expired token must fail.
	expired := map[string]interface{}{}
	for k, v := range base {
		expired[k] = v
	}
	expired["exp"] = time.Now().Add(-time.Hour).Unix()
	if _, _, err := verifyClerkToken(signTestJWT(t, priv, kid, expired)); err == nil || !strings.Contains(err.Error(), "expired") {
		t.Fatalf("expired token accepted: %v", err)
	}
}
