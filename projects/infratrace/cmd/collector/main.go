// InfraTrace — Distributed Tracing Platform
// Collector entry point: receives OTLP traces, processes, and stores in ClickHouse.
package main

import (
	"context"
	"flag"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/itkdaniel/infratrace/internal/api"
	"github.com/itkdaniel/infratrace/internal/collector"
	"github.com/itkdaniel/infratrace/internal/config"
	"github.com/itkdaniel/infratrace/internal/storage"
	"go.uber.org/zap"
)

func main() {
	cfgPath := flag.String("config", "collector.yaml", "path to collector config")
	flag.Parse()

	log, _ := zap.NewProduction()
	defer log.Sync()

	cfg, err := config.LoadCollector(*cfgPath)
	if err != nil {
		log.Fatal("failed to load config", zap.Error(err))
	}

	// ── ClickHouse storage ─────────────────────────────────────────────────
	store, err := storage.NewClickHouseStore(cfg.ClickHouse)
	if err != nil {
		log.Fatal("failed to connect to ClickHouse", zap.Error(err))
	}
	defer store.Close()

	if err := store.Migrate(context.Background()); err != nil {
		log.Fatal("migration failed", zap.Error(err))
	}

	// ── Collector (OTLP gRPC + HTTP receivers) ─────────────────────────────
	coll, err := collector.New(cfg, store, log)
	if err != nil {
		log.Fatal("failed to create collector", zap.Error(err))
	}

	// ── Query API ──────────────────────────────────────────────────────────
	apiSrv := api.NewServer(cfg.API, store, log)
	httpSrv := &http.Server{
		Addr:         cfg.API.Addr(),
		Handler:      apiSrv,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
	}

	// Start collector receivers
	if err := coll.Start(); err != nil {
		log.Fatal("failed to start collector", zap.Error(err))
	}

	// Start query API
	go func() {
		log.Info("query API listening", zap.String("addr", httpSrv.Addr))
		if err := httpSrv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal("API server error", zap.Error(err))
		}
	}()

	log.Info("InfraTrace collector ready",
		zap.String("otlp_grpc", cfg.Collector.OTLPGRPCAddr()),
		zap.String("otlp_http", cfg.Collector.OTLPHTTPAddr()),
		zap.String("api",       cfg.API.Addr()),
	)

	// ── Graceful shutdown ──────────────────────────────────────────────────
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Info("shutting down...")
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	coll.Stop()
	_ = httpSrv.Shutdown(ctx)
	log.Info("shutdown complete")
}
