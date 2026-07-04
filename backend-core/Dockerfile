# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Stage 1 — build the Nakama Go runtime plugin.
#
# The pluginbuilder image ships the exact Go toolchain + nakama-common headers
# that the matching Nakama server (see stage 2) was compiled against. The two
# tags MUST stay in lockstep, otherwise the shared object fails to load.
# ---------------------------------------------------------------------------
FROM heroiclabs/nakama-pluginbuilder:3.31.0 AS builder

ENV GO111MODULE=on
ENV CGO_ENABLED=1

WORKDIR /backend

# Cache module downloads first for faster incremental builds.
COPY go.mod go.sum ./
RUN go mod download

# Compile the plugin as a shared object.
COPY main.go ./
COPY models ./models
RUN go build --trimpath --buildmode=plugin -o ./backend-core.so

# ---------------------------------------------------------------------------
# Stage 2 — assemble the production Nakama server with our module baked in.
# ---------------------------------------------------------------------------
FROM heroiclabs/nakama:3.31.0

COPY --from=builder /backend/backend-core.so /nakama/data/modules/backend-core.so
COPY docker-entrypoint.sh /docker-entrypoint.sh

EXPOSE 7349 7350 7351

ENTRYPOINT ["/docker-entrypoint.sh"]
