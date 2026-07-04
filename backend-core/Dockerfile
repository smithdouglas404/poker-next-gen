# syntax=docker/dockerfile:1

FROM heroiclabs/nakama-pluginbuilder:3.31.0 AS builder

ENV GO111MODULE=on
ENV CGO_ENABLED=1

WORKDIR /backend

COPY go.mod go.sum ./
RUN go mod download

COPY main.go ./
COPY models ./models
COPY protocol ./protocol
COPY poker ./poker
COPY match ./match
COPY rpc ./rpc
COPY store ./store
COPY migrations ./migrations
RUN go build --trimpath --buildmode=plugin -o ./backend-core.so

FROM heroiclabs/nakama:3.31.0

COPY --from=builder /backend/backend-core.so /nakama/data/modules/backend-core.so
COPY docker-entrypoint.sh /docker-entrypoint.sh

EXPOSE 7349 7350 7351

ENTRYPOINT ["/docker-entrypoint.sh"]
