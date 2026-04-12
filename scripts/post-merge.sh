#!/bin/bash
set -e

echo "[post-merge] Installing Node.js dependencies..."
npm ci --prefer-offline 2>/dev/null || npm install

echo "[post-merge] Pushing database schema..."
npm run db:push

echo "[post-merge] Post-merge setup complete."
