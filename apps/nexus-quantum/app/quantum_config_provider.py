"""
Hot-reloading quantum configuration provider.

Fetches Azure Quantum workspace credentials from the main NexusConsult app's
internal service endpoint (GET /api/internal/quantum-config) at request time
with a short TTL cache.  This allows admins to update credentials in the
Settings UI and have them take effect within `_TTL_SECONDS` without restarting
containers.

Authentication:
  The internal endpoint is protected by the NEXUS_INTERNAL_API_KEY env var
  (shared secret between main app and nexus-quantum).  When the key is absent
  or the request fails, the provider falls back to environment variables so the
  service keeps working in standalone / local-dev mode.

Fallback chain (in order):
  1. DB-backed config from /api/internal/quantum-config (primary)
  2. Environment variables via Settings                 (fallback)
"""
from __future__ import annotations

import logging
import os
import time
from dataclasses import dataclass

import httpx

logger = logging.getLogger("nexus-quantum.config-provider")

_TTL_SECONDS = 30


@dataclass
class QuantumCredentials:
    workspace_id: str
    subscription_id: str
    resource_group: str
    workspace_name: str
    location: str
    enabled: bool


_cached_creds: QuantumCredentials | None = None
_cached_at: float = 0.0
_portfolio_url: str = "http://localhost:5000"


def configure_provider(portfolio_url: str) -> None:
    """Call once at startup to set the base URL of the main NexusConsult app."""
    global _portfolio_url
    _portfolio_url = portfolio_url.rstrip("/")


def _fetch_from_api() -> QuantumCredentials | None:
    """
    Fetch quantum config from the main app's internal service endpoint.
    Returns None on any network/HTTP failure so the caller can fall back.
    """
    service_key = os.environ.get("NEXUS_INTERNAL_API_KEY", "")
    if not service_key:
        logger.debug(
            "NEXUS_INTERNAL_API_KEY not set — skipping API fetch, using env vars"
        )
        return None

    url = f"{_portfolio_url}/api/internal/quantum-config"
    headers = {"X-Service-Key": service_key}
    try:
        with httpx.Client(timeout=5.0) as client:
            resp = client.get(url, headers=headers)
        if resp.status_code == 200:
            data = resp.json()
            return QuantumCredentials(
                workspace_id=data.get("workspaceId", ""),
                subscription_id=data.get("subscriptionId", ""),
                resource_group=data.get("resourceGroup", ""),
                workspace_name=data.get("workspaceName", ""),
                location=data.get("location", "eastus") or "eastus",
                enabled=bool(data.get("enabled", False)),
            )
        logger.warning(
            "Internal quantum-config endpoint returned %s — falling back to env vars",
            resp.status_code,
        )
    except Exception as exc:
        logger.debug(
            "Could not reach internal quantum-config endpoint: %s — using env vars",
            exc,
        )
    return None


def _fallback_from_settings(settings) -> QuantumCredentials:
    workspace_id = getattr(settings, "azure_quantum_workspace_id", "")
    return QuantumCredentials(
        workspace_id=workspace_id,
        subscription_id=getattr(settings, "azure_quantum_subscription_id", ""),
        resource_group=getattr(settings, "azure_quantum_resource_group", ""),
        workspace_name=getattr(settings, "azure_quantum_workspace_name", ""),
        location=getattr(settings, "azure_quantum_location", "eastus") or "eastus",
        enabled=bool(workspace_id),
    )


def get_credentials(settings=None) -> QuantumCredentials:
    """
    Return current Azure Quantum credentials, refreshing from the API if the
    TTL has expired.  Falls back to environment variables when the API is
    unreachable or NEXUS_INTERNAL_API_KEY is absent.
    """
    global _cached_creds, _cached_at

    now = time.monotonic()
    if _cached_creds is None or (now - _cached_at) >= _TTL_SECONDS:
        fresh = _fetch_from_api()
        if fresh is not None:
            _cached_creds = fresh
        elif settings is not None:
            _cached_creds = _fallback_from_settings(settings)
        elif _cached_creds is None:
            _cached_creds = QuantumCredentials(
                workspace_id="",
                subscription_id="",
                resource_group="",
                workspace_name="",
                location="eastus",
                enabled=False,
            )
        _cached_at = now

    return _cached_creds


def invalidate_cache() -> None:
    """Force a fresh fetch on the next call to get_credentials()."""
    global _cached_at
    _cached_at = 0.0
