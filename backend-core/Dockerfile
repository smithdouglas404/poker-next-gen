# syntax=docker/dockerfile:1

FROM heroiclabs/nakama-pluginbuilder:3.31.0 AS builder

ENV GO111MODULE=on
ENV CGO_ENABLED=1

WORKDIR /backend

COPY go.mod go.sum ./
RUN go mod download

# Copy the whole module. The previous hand-picked COPY list silently dropped
# packages (audit, antibot, coaching — and later bot, social) that main.go
# imports, breaking the plugin build on Railway. Copy everything so adding a
# package never breaks the image again.
COPY . ./
RUN go build --trimpath --buildmode=plugin -o ./backend-core.so

FROM heroiclabs/nakama:3.31.0

COPY --from=builder /backend/backend-core.so /nakama/data/modules/backend-core.so
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh && /nakama/nakama check --runtime.path /nakama/data/modules

EXPOSE 7349 7350 7351

ENTRYPOINT ["/docker-entrypoint.sh"]
