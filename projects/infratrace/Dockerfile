FROM golang:1.22-alpine AS builder
WORKDIR /app

RUN apk add --no-cache git ca-certificates

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -ldflags="-w -s" -o infratrace-collector ./cmd/collector

FROM scratch
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=builder /app/infratrace-collector /infratrace-collector

EXPOSE 4317 4318 8080 9411
ENTRYPOINT ["/infratrace-collector"]
