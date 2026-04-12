// GraphShield — API Gateway with Rate Limiting
// Entry point: loads config, wires components, and starts the proxy server.
package main

import (
	"context"
	"flag"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/itkdaniel/graphshield/internal/admin"
	"github.com/itkdaniel/graphshield/internal/config"
	"github.com/itkdaniel/graphshield/internal/gateway"
	"github.com/itkdaniel/graphshield/internal/metrics"
	"github.com/itkdaniel/graphshield/internal/ratelimit"
	"github.com/itkdaniel/graphshield/internal/store"
	"go.uber.org/zap"
)

func main() {
	cfgPath := flag.String("config", "config.yaml", "path to config file")
	flag.Parse()

	log, _ := zap.NewProduction()
	defer log.Sync()

	// ── Load configuration ─────────────────────────────────────────────────
	cfg, err := config.Load(*cfgPath)
	if err != nil {
		log.Fatal("failed to load config", zap.Error(err))
	}

	// ── Connect Redis ──────────────────────────────────────────────────────
	redisClient, err := store.NewRedisClient(cfg.Redis)
	if err != nil {
		log.Fatal("failed to connect to Redis", zap.Error(err))
	}
	defer redisClient.Close()

	// ── Metrics ────────────────────────────────────────────────────────────
	metricsServer := metrics.NewServer(cfg.Metrics)
	go metricsServer.Start()

	// ── Rate limiter ───────────────────────────────────────────────────────
	limiter := ratelimit.NewTokenBucket(redisClient, cfg.RateLimiting)

	// ── Gateway (proxy + router + circuit breaker) ─────────────────────────
	gw, err := gateway.New(cfg, limiter, log)
	if err != nil {
		log.Fatal("failed to create gateway", zap.Error(err))
	}

	// ── Admin API ─────────────────────────────────────────────────────────
	adminSrv := admin.NewServer(cfg.Admin, gw, log)

	// ── HTTP Servers ───────────────────────────────────────────────────────
	proxySrv := &http.Server{
		Addr:         cfg.Server.Addr(),
		Handler:      gw,
		ReadTimeout:  cfg.Server.ReadTimeout,
		WriteTimeout: cfg.Server.WriteTimeout,
		IdleTimeout:  cfg.Server.IdleTimeout,
	}

	// Start proxy
	go func() {
		log.Info("proxy listening", zap.String("addr", proxySrv.Addr))
		if err := proxySrv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal("proxy server error", zap.Error(err))
		}
	}()

	// Start admin
	go func() {
		log.Info("admin listening", zap.String("addr", adminSrv.Addr()))
		if err := adminSrv.Start(); err != nil {
			log.Error("admin server error", zap.Error(err))
		}
	}()

	// ── Graceful shutdown ──────────────────────────────────────────────────
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Info("shutting down...")
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := proxySrv.Shutdown(ctx); err != nil {
		log.Error("proxy shutdown error", zap.Error(err))
	}
	log.Info("shutdown complete")
}
