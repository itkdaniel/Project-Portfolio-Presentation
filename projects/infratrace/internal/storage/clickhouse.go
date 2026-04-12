// Package storage implements ClickHouse-backed span storage for InfraTrace.
package storage

import (
	"context"
	"fmt"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
)

// Config holds ClickHouse connection settings.
type Config struct {
	Addr     string `yaml:"addr"`
	Database string `yaml:"database"`
	Username string `yaml:"username"`
	Password string `yaml:"password"`
	Debug    bool   `yaml:"debug"`
	BatchSize    int           `yaml:"batch_size"`
	FlushInterval time.Duration `yaml:"flush_interval"`
}

// Span represents a single OpenTelemetry span stored in ClickHouse.
type Span struct {
	TraceID       string
	SpanID        string
	ParentSpanID  string
	ServiceName   string
	OperationName string
	SpanKind      string
	StartTime     time.Time
	EndTime       time.Time
	DurationNs    uint64
	StatusCode    uint8
	StatusMessage string
	Attributes    map[string]string
	Resource      map[string]string
}

// SearchParams holds query parameters for trace search.
type SearchParams struct {
	Service      string
	Operation    string
	MinDurationMs int
	MaxDurationMs int
	HasError     bool
	Limit        int
	Offset       int
	StartTime    time.Time
	EndTime      time.Time
}

// ClickHouseStore stores and queries spans using ClickHouse.
type ClickHouseStore struct {
	conn   driver.Conn
	cfg    Config
	batch  []Span
	batchCh chan Span
}

// NewClickHouseStore creates a new ClickHouseStore.
func NewClickHouseStore(cfg Config) (*ClickHouseStore, error) {
	conn, err := clickhouse.Open(&clickhouse.Options{
		Addr: []string{cfg.Addr},
		Auth: clickhouse.Auth{
			Database: cfg.Database,
			Username: cfg.Username,
			Password: cfg.Password,
		},
		Debug:           cfg.Debug,
		MaxOpenConns:    10,
		MaxIdleConns:    5,
		ConnMaxLifetime: time.Hour,
	})
	if err != nil {
		return nil, fmt.Errorf("clickhouse.Open: %w", err)
	}
	if err := conn.Ping(context.Background()); err != nil {
		return nil, fmt.Errorf("clickhouse ping: %w", err)
	}

	s := &ClickHouseStore{
		conn:    conn,
		cfg:     cfg,
		batchCh: make(chan Span, cfg.BatchSize*2),
	}
	go s.batchWriter()
	return s, nil
}

// Migrate creates the spans table and indexes if they don't exist.
func (s *ClickHouseStore) Migrate(ctx context.Context) error {
	ddl := `
CREATE DATABASE IF NOT EXISTS infratrace;

CREATE TABLE IF NOT EXISTS infratrace.spans (
    trace_id        String,
    span_id         String,
    parent_span_id  Nullable(String),
    service_name    LowCardinality(String),
    operation_name  LowCardinality(String),
    span_kind       LowCardinality(String),
    start_time      DateTime64(9, 'UTC'),
    end_time        DateTime64(9, 'UTC'),
    duration_ns     UInt64,
    status_code     UInt8,
    status_message  Nullable(String),
    attributes      Map(String, String),
    resource        Map(String, String)
)
ENGINE = MergeTree()
PARTITION BY toYYYYMMDD(start_time)
ORDER BY (service_name, operation_name, start_time, trace_id)
TTL start_time + INTERVAL 30 DAY
SETTINGS index_granularity = 8192;`

	return s.conn.Exec(ctx, ddl)
}

// Write adds a span to the async batch.
func (s *ClickHouseStore) Write(span Span) {
	s.batchCh <- span
}

// batchWriter drains the channel and flushes to ClickHouse in batches.
func (s *ClickHouseStore) batchWriter() {
	ticker  := time.NewTicker(s.cfg.FlushInterval)
	pending := make([]Span, 0, s.cfg.BatchSize)

	flush := func() {
		if len(pending) == 0 {
			return
		}
		ctx := context.Background()
		batch, _ := s.conn.PrepareBatch(ctx, "INSERT INTO infratrace.spans")
		for _, sp := range pending {
			_ = batch.Append(
				sp.TraceID, sp.SpanID, sp.ParentSpanID,
				sp.ServiceName, sp.OperationName, sp.SpanKind,
				sp.StartTime, sp.EndTime, sp.DurationNs,
				sp.StatusCode, sp.StatusMessage,
				sp.Attributes, sp.Resource,
			)
		}
		_ = batch.Send()
		pending = pending[:0]
	}

	for {
		select {
		case sp := <-s.batchCh:
			pending = append(pending, sp)
			if len(pending) >= s.cfg.BatchSize {
				flush()
			}
		case <-ticker.C:
			flush()
		}
	}
}

// SearchTraces queries recent traces matching the given parameters.
func (s *ClickHouseStore) SearchTraces(ctx context.Context, p SearchParams) ([]map[string]any, int, error) {
	where := "1=1"
	args  := map[string]any{}

	if p.Service != "" {
		where += " AND service_name = {service:String}"
		args["service"] = p.Service
	}
	if p.Operation != "" {
		where += " AND operation_name = {op:String}"
		args["op"] = p.Operation
	}
	if p.MinDurationMs > 0 {
		where += " AND duration_ns >= {min_ns:UInt64}"
		args["min_ns"] = uint64(p.MinDurationMs) * 1_000_000
	}
	if p.HasError {
		where += " AND status_code = 2"
	}
	if !p.StartTime.IsZero() {
		where += " AND start_time >= {start:DateTime64}"
		args["start"] = p.StartTime
	}
	if !p.EndTime.IsZero() {
		where += " AND start_time <= {end:DateTime64}"
		args["end"] = p.EndTime
	}

	query := fmt.Sprintf(`
        SELECT trace_id,
               argMin(service_name, start_time) AS root_service,
               argMin(operation_name, start_time) AS root_operation,
               sum(duration_ns) / 1e6 AS duration_ms,
               count() AS span_count,
               max(status_code) >= 2 AS has_error,
               min(start_time) AS started_at
        FROM infratrace.spans
        WHERE %s
        GROUP BY trace_id
        ORDER BY started_at DESC
        LIMIT {limit:Int32} OFFSET {offset:Int32}
    `, where)

	args["limit"]  = p.Limit
	args["offset"] = p.Offset

	rows, err := s.conn.Query(ctx, query, args)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var results []map[string]any
	for rows.Next() {
		var (
			traceID, rootService, rootOp string
			durationMs                   float64
			spanCount                    uint64
			hasError                     bool
			startedAt                    time.Time
		)
		if err := rows.Scan(&traceID, &rootService, &rootOp, &durationMs, &spanCount, &hasError, &startedAt); err != nil {
			return nil, 0, err
		}
		results = append(results, map[string]any{
			"trace_id":       traceID,
			"root_service":   rootService,
			"root_operation": rootOp,
			"duration_ms":    durationMs,
			"span_count":     spanCount,
			"error":          hasError,
			"started_at":     startedAt.Format(time.RFC3339Nano),
		})
	}

	return results, len(results), nil
}

// Close closes the ClickHouse connection.
func (s *ClickHouseStore) Close() {
	_ = s.conn.Close()
}
