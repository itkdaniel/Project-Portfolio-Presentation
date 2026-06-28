"""
Azure Quantum SDK integration layer.

All methods are graceful no-ops when AZURE_QUANTUM_WORKSPACE_ID is absent,
falling back to local simulation. This allows the entire service to run
without an Azure subscription during development and testing.

Architecture:
  - AzureQuantumService wraps azure-quantum SDK
  - is_available() returns False when env vars are absent → callers degrade gracefully
  - submit_job() returns a mock job dict in offline mode
"""
from __future__ import annotations

import logging
import uuid
from typing import Any

logger = logging.getLogger("nexus-quantum.azure")


class AzureQuantumService:
    """Thin wrapper around the Azure Quantum SDK.

    Instantiated once at app startup via configure_azure(settings).
    When AZURE_QUANTUM_WORKSPACE_ID is absent, all methods return
    simulated responses so the rest of the service works unchanged.
    """

    def __init__(self, settings) -> None:
        self._settings = settings
        self._workspace = None
        self._connected = False
        self._try_connect()

    def _try_connect(self) -> None:
        """Attempt to connect to Azure Quantum workspace."""
        if not self._settings.azure_quantum_workspace_id:
            logger.info(
                "AZURE_QUANTUM_WORKSPACE_ID not set — running in local simulation mode"
            )
            return
        try:
            from azure.quantum import Workspace  # type: ignore[import]

            self._workspace = Workspace(
                subscription_id=self._settings.azure_quantum_subscription_id,
                resource_group=self._settings.azure_quantum_resource_group,
                name=self._settings.azure_quantum_workspace_name,
                location=self._settings.azure_quantum_location,
            )
            self._connected = True
            logger.info("Connected to Azure Quantum workspace")
        except ImportError:
            logger.warning(
                "azure-quantum package not installed — falling back to local simulation"
            )
        except Exception as exc:
            logger.warning("Azure Quantum connection failed: %s — using local sim", exc)

    @property
    def is_available(self) -> bool:
        return self._connected

    async def submit_job(
        self,
        job_type: str,
        target: str,
        circuit: str,
        shots: int = 1024,
    ) -> dict[str, Any]:
        """Submit a job to Azure Quantum or return a mock pending job."""
        if not self._connected:
            return {
                "id": str(uuid.uuid4()),
                "status": "pending",
                "target": target,
                "provider": "local_simulator",
                "azure_job_id": None,
            }
        try:
            from azure.quantum.cirq import AzureQuantumService as CirqService  # type: ignore[import]

            job = self._workspace.submit_job(  # type: ignore[union-attr]
                name=f"nexus-{job_type}-{uuid.uuid4().hex[:8]}",
                target=target,
                input_data=circuit.encode(),
                input_data_format="qasm.v3",
                output_data_format="microsoft.quantum-results.v1",
                shots=shots,
            )
            return {
                "id": job.id,
                "status": "pending",
                "target": target,
                "provider": "azure",
                "azure_job_id": job.id,
            }
        except Exception as exc:
            logger.error("Azure job submission failed: %s", exc)
            return {
                "id": str(uuid.uuid4()),
                "status": "failed",
                "target": target,
                "provider": "azure",
                "error": str(exc),
            }

    async def get_job_status(self, azure_job_id: str) -> dict[str, Any]:
        """Poll Azure Quantum for job status."""
        if not self._connected:
            return {"status": "completed", "azure_job_id": azure_job_id}
        try:
            job = self._workspace.get_job(azure_job_id)  # type: ignore[union-attr]
            job.refresh()
            return {
                "status": job.details.status.lower(),
                "azure_job_id": azure_job_id,
                "output_data_uri": getattr(job.details, "output_data_uri", None),
            }
        except Exception as exc:
            logger.error("Azure job status poll failed: %s", exc)
            return {"status": "unknown", "azure_job_id": azure_job_id, "error": str(exc)}

    def list_targets(self) -> list[dict[str, Any]]:
        """List available Azure Quantum targets."""
        if not self._connected:
            return [
                {"name": "ionq.simulator", "provider": "IonQ", "available": False},
                {"name": "quantinuum.sim.h1-1sc", "provider": "Quantinuum", "available": False},
                {"name": "microsoft.estimator", "provider": "Microsoft", "available": False},
            ]
        try:
            targets = self._workspace.get_targets()  # type: ignore[union-attr]
            return [
                {
                    "name": t.name,
                    "provider": t.provider_id,
                    "available": t.current_availability == "Available",
                }
                for t in targets
            ]
        except Exception as exc:
            logger.error("Azure targets list failed: %s", exc)
            return []


# Module-level singleton — set by configure_azure() at app startup
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
