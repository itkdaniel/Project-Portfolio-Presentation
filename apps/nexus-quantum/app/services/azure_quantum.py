"""
Azure Quantum SDK integration layer — nexus-quantum service.

This module wraps nexus_shared.azure_quantum_client.SharedAzureQuantumClient,
which is the single source of truth for Azure Quantum workspace connectivity
across all NexusConsult services.  Keeping the integration logic in the shared
client avoids duplicating workspace connection, circuit submission, and polling
code across services.

Architecture:
  - AzureQuantumService is a thin adapter over SharedAzureQuantumClient
  - is_available() delegates to the shared client's .is_available property
  - submit_job() / get_job_status() / list_targets() delegate to the shared client
  - All methods are graceful no-ops when Azure credentials are absent

Configuration (hot-reload):
  Credentials are read from the DB-backed /api/settings/quantum-config endpoint
  on each call to get_azure_service(), refreshed at most every 30 s.
  Environment variables (AZURE_QUANTUM_*) serve as fallback when the API is
  unreachable, so the service works in standalone / local-dev mode too.
"""
from __future__ import annotations

import logging
from typing import Any

from nexus_shared.azure_quantum_client import (
    SharedAzureQuantumClient,
    configure_client,
    get_azure_client,
)

logger = logging.getLogger("nexus-quantum.azure")


class AzureQuantumService:
    """
    Thin adapter over SharedAzureQuantumClient for the nexus-quantum service.

    Instantiated via configure_azure(credentials) whenever live credentials
    change.  Delegates all Azure operations to the shared client singleton.
    """

    def __init__(self, credentials) -> None:
        self._credentials = credentials

        # When `enabled` is False, force all workspace fields to empty strings so
        # the shared client treats the service as unconfigured and falls back to the
        # local simulator — regardless of what the credential fields contain.
        enabled = getattr(credentials, "enabled", bool(credentials.workspace_id))
        if enabled:
            workspace_id    = credentials.workspace_id
            subscription_id = credentials.subscription_id
            resource_group  = credentials.resource_group
            workspace_name  = credentials.workspace_name
            location        = credentials.location
        else:
            workspace_id = subscription_id = resource_group = workspace_name = ""
            location = getattr(credentials, "location", "eastus") or "eastus"

        self._client: SharedAzureQuantumClient = configure_client(
            workspace_id=workspace_id,
            subscription_id=subscription_id,
            resource_group=resource_group,
            workspace_name=workspace_name,
            location=location,
            default_target=getattr(credentials, "default_target", ""),
        )
        if self._client.is_available:
            logger.info("AzureQuantumService: connected to Azure Quantum workspace")
        else:
            logger.info(
                "AzureQuantumService: %s — running in local simulation mode",
                "disabled by admin" if not enabled else "workspace_id absent or connection failed",
            )

    @property
    def is_available(self) -> bool:
        return self._client.is_available

    async def submit_job(
        self,
        job_type: str,
        target: str,
        circuit: str,
        shots: int = 1024,
    ) -> dict[str, Any]:
        """Submit a job to Azure Quantum (delegates to shared client, sync internally)."""
        result = self._client.submit_circuit(
            job_type=job_type,
            circuit=circuit,
            target=target,
            shots=shots,
        )
        return {
            "id": result.get("id", ""),
            "status": result.get("status", "failed"),
            "target": result.get("target", target),
            "provider": result.get("provider", "azure"),
            "azure_job_id": result.get("azure_job_id"),
            "error": result.get("error"),
        }

    async def get_job_status(self, azure_job_id: str) -> dict[str, Any]:
        """Poll Azure Quantum for job status (delegates to shared client)."""
        return self._client.get_job_status(azure_job_id)

    def list_targets(self) -> list[dict[str, Any]]:
        """List available Azure Quantum targets (delegates to shared client)."""
        return self._client.list_targets()


# ── Module-level singleton ─────────────────────────────────────────────────────

_azure_service: AzureQuantumService | None = None
_last_creds_key: str = ""


def _creds_key(creds) -> str:
    """Stable fingerprint of a credentials object so we can detect changes."""
    return (
        f"{creds.workspace_id}|{creds.subscription_id}|{creds.resource_group}"
        f"|{creds.workspace_name}|{creds.location}|{creds.enabled}"
    )


def configure_azure(credentials_or_settings) -> None:
    """
    (Re-)initialise the AzureQuantumService from the supplied credentials.

    Accepts either:
      - a QuantumCredentials dataclass (from quantum_config_provider)
      - the legacy Settings object (for backward compat with existing tests)
    """
    global _azure_service, _last_creds_key

    # Normalise legacy Settings objects into a duck-typed credentials object.
    if not hasattr(credentials_or_settings, "workspace_id"):
        class _WrappedSettings:
            def __init__(self, s):
                self.workspace_id    = getattr(s, "azure_quantum_workspace_id", "")
                self.subscription_id = getattr(s, "azure_quantum_subscription_id", "")
                self.resource_group  = getattr(s, "azure_quantum_resource_group", "")
                self.workspace_name  = getattr(s, "azure_quantum_workspace_name", "")
                self.location        = getattr(s, "azure_quantum_location", "eastus") or "eastus"
                self.enabled         = bool(self.workspace_id)
                self.default_target  = getattr(s, "azure_quantum_target", "")
        credentials_or_settings = _WrappedSettings(credentials_or_settings)

    key = _creds_key(credentials_or_settings)
    if key == _last_creds_key and _azure_service is not None:
        return  # nothing changed, reuse existing service

    _azure_service = AzureQuantumService(credentials_or_settings)
    _last_creds_key = key


def get_azure_service() -> AzureQuantumService:
    """
    Return the AzureQuantumService, refreshing it when live credentials have
    changed since the last call (checked via the 30-second TTL in the provider).

    This is the hot-reload path: admin updates /api/settings/quantum-config →
    within 30 s, all new requests pick up the new workspace credentials without
    any service restart.
    """
    global _azure_service

    try:
        from app.quantum_config_provider import get_credentials
        from app.config import get_settings
        creds = get_credentials(settings=get_settings())
        configure_azure(creds)
    except Exception as exc:
        logger.debug("Could not refresh credentials from provider: %s", exc)
        if _azure_service is None:
            from app.config import get_settings
            configure_azure(get_settings())

    return _azure_service  # type: ignore[return-value]
