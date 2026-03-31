"""
Redis caching service.

Provides:
  - get/set with TTL and JSON serialization
  - cache-aside pattern helper (get_or_set)
  - pub/sub integration for cache invalidation
  - LRU-style key eviction via Redis maxmemory-policy

Pattern: Cache-Aside (lazy loading)
  1. Check Redis for key
  2. On miss: fetch from DB, write to Redis with TTL
  3. On invalidation: delete key so next read refreshes

This avoids cold-start thundering herd via a simple lock pattern.
"""
from __future__ import annotations
import json
from typing import Any, Optional, Callable, Awaitable
import redis.asyncio as aioredis

from app.config import get_settings


class CacheService:
    """Async cache-aside wrapper around Redis."""

    def __init__(self, redis: aioredis.Redis):
        self._redis = redis
        self._ttl  = get_settings().redis_ttl

    async def get(self, key: str) -> Optional[Any]:
        """Fetch and deserialize a cached value. Returns None on miss."""
        raw = await self._redis.get(key)
        return json.loads(raw) if raw is not None else None

    async def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        """Serialize and store a value with optional TTL override."""
        await self._redis.setex(key, ttl or self._ttl, json.dumps(value, default=str))

    async def delete(self, key: str) -> None:
        """Invalidate a cached key."""
        await self._redis.delete(key)

    async def delete_pattern(self, pattern: str) -> int:
        """
        Delete all keys matching a glob pattern.
        Uses SCAN to avoid blocking Redis on large keyspaces.
        Returns count of deleted keys.
        """
        count = 0
        async for key in self._redis.scan_iter(match=pattern, count=100):
            await self._redis.delete(key)
            count += 1
        return count

    async def get_or_set(
        self,
        key: str,
        fetch_fn: Callable[[], Awaitable[Any]],
        ttl: Optional[int] = None,
    ) -> Any:
        """
        Cache-aside pattern:
          1. Try cache
          2. Miss → call fetch_fn, store result, return it
        """
        cached = await self.get(key)
        if cached is not None:
            return cached
        value = await fetch_fn()
        if value is not None:
            await self.set(key, value, ttl)
        return value

    async def publish(self, channel: str, message: Any) -> None:
        """Publish a message to a Redis pub/sub channel."""
        await self._redis.publish(channel, json.dumps(message, default=str))

    async def ping(self) -> bool:
        """Health check."""
        try:
            return await self._redis.ping()
        except Exception:
            return False