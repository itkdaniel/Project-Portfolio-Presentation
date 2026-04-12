// Package circuit implements the circuit breaker pattern.
// States: Closed → Open → Half-Open → Closed
package circuit

import (
	"sync"
	"sync/atomic"
	"time"
)

type State int32

const (
	StateClosed   State = iota // Normal operation
	StateOpen                  // Failing fast
	StateHalfOpen              // Probing upstream
)

func (s State) String() string {
	switch s {
	case StateClosed:   return "closed"
	case StateOpen:     return "open"
	case StateHalfOpen: return "half-open"
	default:            return "unknown"
	}
}

// Config holds circuit breaker configuration.
type Config struct {
	FailureThreshold int           `yaml:"failure_threshold"`
	SuccessThreshold int           `yaml:"success_threshold"`
	Timeout          time.Duration `yaml:"timeout"`
}

// Breaker is a thread-safe circuit breaker.
type Breaker struct {
	name    string
	cfg     Config
	state   atomic.Int32
	mu      sync.Mutex

	failures int
	successes int
	openedAt time.Time
}

// New creates a new circuit breaker.
func New(name string, cfg Config) *Breaker {
	b := &Breaker{name: name, cfg: cfg}
	b.state.Store(int32(StateClosed))
	return b
}

// Allow returns true if the request should be forwarded to upstream.
func (b *Breaker) Allow() bool {
	switch State(b.state.Load()) {
	case StateClosed:
		return true
	case StateOpen:
		b.mu.Lock()
		defer b.mu.Unlock()
		if time.Since(b.openedAt) >= b.cfg.Timeout {
			// Transition to half-open — probe one request
			b.state.Store(int32(StateHalfOpen))
			b.successes = 0
			return true
		}
		return false
	case StateHalfOpen:
		// Allow only one probe at a time
		return b.state.CompareAndSwap(int32(StateHalfOpen), int32(StateHalfOpen))
	}
	return false
}

// RecordSuccess records a successful upstream response.
func (b *Breaker) RecordSuccess() {
	b.mu.Lock()
	defer b.mu.Unlock()
	switch State(b.state.Load()) {
	case StateClosed:
		b.failures = 0
	case StateHalfOpen:
		b.successes++
		if b.successes >= b.cfg.SuccessThreshold {
			b.state.Store(int32(StateClosed))
			b.failures = 0
		}
	}
}

// RecordFailure records a failed upstream response.
func (b *Breaker) RecordFailure() {
	b.mu.Lock()
	defer b.mu.Unlock()
	switch State(b.state.Load()) {
	case StateClosed:
		b.failures++
		if b.failures >= b.cfg.FailureThreshold {
			b.state.Store(int32(StateOpen))
			b.openedAt = time.Now()
		}
	case StateHalfOpen:
		// Probe failed — back to open
		b.state.Store(int32(StateOpen))
		b.openedAt = time.Now()
		b.successes = 0
	}
}

// Reset forces the breaker to the closed state (admin use).
func (b *Breaker) Reset() {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.state.Store(int32(StateClosed))
	b.failures  = 0
	b.successes = 0
}

// State returns the current circuit state.
func (b *Breaker) CurrentState() State {
	return State(b.state.Load())
}
