#!/bin/bash
set -e

echo "[post-merge] Installing Node.js dependencies..."
npm ci --prefer-offline 2>/dev/null || npm install

echo "[post-merge] Pushing database schema..."
timeout 60 npm run db:push || echo "[post-merge] db:push skipped (timeout or no schema changes)"

echo "[post-merge] Post-merge setup complete."
