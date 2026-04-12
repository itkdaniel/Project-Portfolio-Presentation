// Package ratelimit implements Redis-backed token bucket rate limiting.
// Uses a Lua script for atomic O(1) per-request bucket operations.
package ratelimit

import (
	"context"
	"fmt"
	"time"

	"github.com/go-redis/redis/v9"
)

// luaTokenBucket is an atomic Lua script for the token bucket algorithm.
// KEYS[1]  — bucket key
// ARGV[1]  — bucket capacity
// ARGV[2]  — refill rate (tokens per second)
// ARGV[3]  — current unix timestamp (seconds)
// ARGV[4]  — cost (tokens consumed per request, usually 1)
//
// Returns [remaining, reset_at_unix, allowed (1 or 0)]
const luaTokenBucket = `
local key       = KEYS[1]
local capacity  = tonumber(ARGV[1])
local rate      = tonumber(ARGV[2])
local now       = tonumber(ARGV[3])
local cost      = tonumber(ARGV[4])

local data = redis.call("HMGET", key, "tokens", "last_refill")
local tokens     = tonumber(data[1]) or capacity
local last_ts    = tonumber(data[2]) or now

-- Refill tokens based on elapsed time
local elapsed = math.max(0, now - last_ts)
tokens = math.min(capacity, tokens + elapsed * rate)

local allowed = 0
local remaining = tokens - cost
if remaining >= 0 then
    tokens = remaining
    allowed = 1
end

-- TTL = capacity / rate + 10s buffer
local ttl = math.ceil(capacity / rate) + 10

redis.call("HMSET", key, "tokens", tokens, "last_refill", now)
redis.call("EXPIRE", key, ttl)

local reset_at = now + math.ceil((capacity - tokens) / rate)
return {math.floor(tokens), reset_at, allowed}
`

// Config holds rate limiting configuration.
type Config struct {
	Enabled   bool   `yaml:"enabled"`
	DefaultRPM int   `yaml:"default_rpm"`
	Burst     int    `yaml:"burst"`
	KeyPrefix string `yaml:"key_prefix"`
}

// Result is the outcome of a rate limit check.
type Result struct {
	Allowed   bool
	Remaining int
	ResetAt   time.Time
	RetryAfter time.Duration
}

// TokenBucket implements a Redis-backed token bucket.
type TokenBucket struct {
	rdb    *redis.Client
	cfg    Config
	script *redis.Script
}

// NewTokenBucket creates a new Redis-backed token bucket rate limiter.
func NewTokenBucket(rdb *redis.Client, cfg Config) *TokenBucket {
	return &TokenBucket{
		rdb:    rdb,
		cfg:    cfg,
		script: redis.NewScript(luaTokenBucket),
	}
}

// Check checks whether the given key is allowed, consuming one token.
func (tb *TokenBucket) Check(ctx context.Context, key string, rpm int, burst int) Result {
	if !tb.cfg.Enabled {
		return Result{Allowed: true, Remaining: burst}
	}
	if rpm <= 0 {
		rpm = tb.cfg.DefaultRPM
	}
	if burst <= 0 {
		burst = tb.cfg.Burst
	}

	fullKey     := fmt.Sprintf("%s%s", tb.cfg.KeyPrefix, key)
	ratePerSec  := float64(rpm) / 60.0
	now         := time.Now().Unix()

	res, err := tb.script.Run(ctx, tb.rdb, []string{fullKey},
		burst, ratePerSec, now, 1,
	).Int64Slice()

	if err != nil || len(res) < 3 {
		// Fail open on Redis errors
		return Result{Allowed: true, Remaining: burst}
	}

	remaining := int(res[0])
	resetAt   := time.Unix(res[1], 0)
	allowed   := res[2] == 1

	retryAfter := time.Duration(0)
	if !allowed && resetAt.After(time.Now()) {
		retryAfter = time.Until(resetAt)
	}

	return Result{
		Allowed:    allowed,
		Remaining:  remaining,
		ResetAt:    resetAt,
		RetryAfter: retryAfter,
	}
}
