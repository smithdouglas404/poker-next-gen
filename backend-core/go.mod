module github.com/smithdouglas404/poker-next-gen/backend-core

go 1.25.0

require (
	github.com/decred/dcrd/dcrec/secp256k1/v4 v4.4.1
	github.com/heroiclabs/nakama-common v1.41.0
	golang.org/x/crypto v0.54.0
)

require golang.org/x/sys v0.47.0 // indirect

// Must match Nakama 3.31.0 (heroiclabs/nakama v3.31.0 go.mod) or plugin load fails at runtime.
require google.golang.org/protobuf v1.36.8 // indirect
