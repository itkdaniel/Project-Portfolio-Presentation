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

Configuration:
  AZURE_QUANTUM_WORKSPACE_ID      — workspace name (required to enable Azure)
  AZURE_QUANTUM_SUBSCRIPTION_ID   — Azure subscription ID
  AZURE_QUANTUM_RESOURCE_GROUP    — Azure resource group
  AZURE_QUANTUM_WORKSPACE_NAME    — workspace display name
  AZURE_QUANTUM_LOCATION          — region (default: eastus)
  AZURE_QUANTUM_TARGET            — default QPU target (default: ionq.qpu)
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

    Instantiated once at app startup via configure_azure(settings).
    Delegates all Azure operations to the shared client singleton.
    """

    def __init__(self, settings) -> None:
        self._settings = settings
        # Configure the shared client singleton with values from nexus-quantum settings.
        self._client: SharedAzureQuantumClient = configure_client(
            workspace_id=getattr(settings, "azure_quantum_workspace_id", ""),
            subscription_id=getattr(settings, "azure_quantum_subscription_id", ""),
            resource_group=getattr(settings, "azure_quantum_resource_group", ""),
            workspace_name=getattr(settings, "azure_quantum_workspace_name", ""),
            location=getattr(settings, "azure_quantum_location", ""),
            default_target=getattr(settings, "azure_quantum_target", ""),
        )
        if self._client.is_available:
            logger.info("AzureQuantumService: connected to Azure Quantum workspace")
        else:
            logger.info(
                "AzureQuantumService: AZURE_QUANTUM_WORKSPACE_ID not set or connection "
                "failed — running in local simulation mode"
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
        # Map shared client response to the nexus-quantum job dict format.
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


def configure_azure(settings) -> None:
    global _azure_service
    _azure_service = AzureQuantumService(settings)


def get_azure_service() -> AzureQuantumService:
    global _azure_service
    if _azure_service is None:
        from app.config import get_settings
        configure_azure(get_settings())
    return _azure_service
