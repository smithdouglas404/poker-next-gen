package rpc

import (
	"encoding/hex"
	"fmt"
	"strings"
	"testing"

	secp "github.com/decred/dcrd/dcrec/secp256k1/v4"
	"github.com/decred/dcrd/dcrec/secp256k1/v4/ecdsa"
)

// TestRecoverEVMRoundTrip signs an EIP-191 personal_sign digest with a known
// secp256k1 key, formats the signature the way MetaMask does (R||S||V), and
// confirms recoverEVM recovers the matching Ethereum address.
func TestRecoverEVMRoundTrip(t *testing.T) {
	priv, err := secp.GeneratePrivateKey()
	if err != nil {
		t.Fatalf("keygen: %v", err)
	}
	// Expected address = last 20 bytes of keccak256(uncompressed pubkey[1:]).
	uncompressed := priv.PubKey().SerializeUncompressed()
	want := "0x" + hex.EncodeToString(keccak256(uncompressed[1:])[12:])

	msg := linkMessage("deadbeefdeadbeef")
	prefixed := fmt.Sprintf("\x19Ethereum Signed Message:\n%d%s", len(msg), msg)
	digest := keccak256([]byte(prefixed))

	// decred SignCompact -> [recid+27(+4 if compressed)] || R || S. We used an
	// uncompressed key, so no +4. MetaMask wants R || S || V (V = recid+27).
	compact := ecdsa.SignCompact(priv, digest, false)
	mm := make([]byte, 65)
	copy(mm[0:64], compact[1:65])
	mm[64] = compact[0] // already recid+27

	got, err := recoverEVM(msg, "0x"+hex.EncodeToString(mm))
	if err != nil {
		t.Fatalf("recoverEVM: %v", err)
	}
	if !strings.EqualFold(got, want) {
		t.Fatalf("recovered %s, want %s", got, want)
	}

	// A tampered signature must NOT recover the same address.
	mm[10] ^= 0xff
	if bad, err := recoverEVM(msg, "0x"+hex.EncodeToString(mm)); err == nil && strings.EqualFold(bad, want) {
		t.Fatalf("tampered signature still recovered the correct address")
	}
}

// TestBase58Decode sanity-checks the Solana address decoder length + leading zeros.
func TestBase58Decode(t *testing.T) {
	// "1" (a single leading zero byte) decodes to one 0x00 byte.
	b, err := base58Decode("1")
	if err != nil || len(b) != 1 || b[0] != 0 {
		t.Fatalf("base58 '1' => %v (err %v)", b, err)
	}
	if _, err := base58Decode("0OIl"); err == nil {
		t.Fatalf("expected error on non-base58 chars")
	}
}
