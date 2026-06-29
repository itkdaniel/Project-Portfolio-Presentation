"""
Shared Azure Quantum client — nexus_shared.azure_quantum_client

Single source of truth for Azure Quantum workspace connectivity.  Used by:
  - nexus_shared.quantum_utils  (QuantumBackend hardware dispatch)
  - apps/nexus-quantum/app/services/azure_quantum.py  (direct job API)

All methods degrade gracefully when the azure-quantum package is absent or
credentials are not set, so every service continues to work in local-simulation
mode without an Azure subscription.

Configuration (environment variables)
--------------------------------------
AZURE_QUANTUM_WORKSPACE_ID      workspace name — if empty, Azure is disabled
AZURE_QUANTUM_SUBSCRIPTION_ID   Azure subscription ID
AZURE_QUANTUM_RESOURCE_GROUP    Azure resource group
AZURE_QUANTUM_WORKSPACE_NAME    workspace display name
AZURE_QUANTUM_LOCATION          region (default: eastus)
AZURE_QUANTUM_TARGET            default QPU/simulator target
                                (default: ionq.qpu — real IonQ trapped-ion hardware)
                                Set to "ionq.simulator" for cloud simulation,
                                "quantinuum.qpu.h1-1" for Quantinuum hardware, etc.

Circuit format
--------------
Generated circuits are OPENQASM 2.0; submissions use input_data_format="qasm2".
"""
from __future__ import annotations

import logging
import os
import time
import uuid
from typing import Any, Optional

logger = logging.getLogger("nexus.azure_quantum_client")

# ── Environment defaults ───────────────────────────────────────────────────────

_DEFAULT_LOCATION = "eastus"
_DEFAULT_TARGET = "ionq.qpu"          # real IonQ trapped-ion hardware
_INPUT_DATA_FORMAT = "qasm2"          # matches OPENQASM 2.0 circuits
_OUTPUT_DATA_FORMAT = "microsoft.quantum-results.v1"


def _env(key: str, default: str = "") -> str:
    return os.environ.get(key, default).strip()


# ── Main client class ─────────────────────────────────────────────────────────

class SharedAzureQuantumClient:
    """
    Thin, synchronous wrapper around the Azure Quantum SDK Workspace.

    Intended as a shared singleton that multiple services can reference.
    All public methods are synchronous; they call the blocking Azure SDK
    directly without wrapping in async.  Callers that live inside async
    FastAPI handlers should dispatch to a thread (anyio.to_thread.run_sync).

    When the azure-quantum package is absent or credentials are missing the
    client reports is_available=False and all submission methods return mock
    responses, leaving the caller to fall back to local simulation.
    """

    def __init__(
        self,
        workspace_id: str = "",
        subscription_id: str = "",
        resource_group: str = "",
        workspace_name: str = "",
        location: str = "",
        default_target: str = "",
    ) -> None:
        self.workspace_id = workspace_id or _env("AZURE_QUANTUM_WORKSPACE_ID")
        self.subscription_id = subscription_id or _env("AZURE_QUANTUM_SUBSCRIPTION_ID")
        self.resource_group = resource_group or _env("AZURE_QUANTUM_RESOURCE_GROUP")
        self.workspace_name = workspace_name or _env("AZURE_QUANTUM_WORKSPACE_NAME")
        self.location = location or _env("AZURE_QUANTUM_LOCATION", _DEFAULT_LOCATION)
        self.default_target = default_target or _env("AZURE_QUANTUM_TARGET", _DEFAULT_TARGET)

        self._workspace: Any = None
        self._connected: bool = False

        if self.workspace_id:
            self._try_connect()

    # ── Connection ─────────────────────────────────────────────────────────────

    def _try_connect(self) -> None:
        """Attempt to connect to the Azure Quantum workspace (sync)."""
        try:
            from azure.quantum import Workspace  # type: ignore[import]

            self._workspace = Workspace(
                subscription_id=self.subscription_id,
                resource_group=self.resource_group,
                name=self.workspace_name,
                location=self.location,
            )
            self._connected = True
            logger.info(
                "SharedAzureQuantumClient: connected to workspace '%s' (target='%s')",
                self.workspace_id,
                self.default_target,
            )
        except ImportError:
            logger.warning(
                "SharedAzureQuantumClient: azure-quantum not installed — local simulation only"
            )
        except Exception as exc:
            logger.warning(
                "SharedAzureQuantumClient: connection failed (%s) — local simulation only",
                exc,
            )

    @property
    def is_available(self) -> bool:
        return self._connected

    # ── Job submission ─────────────────────────────────────────────────────────

    def submit_circuit(
        self,
        job_type: str,
        circuit: str,
        target: Optional[str] = None,
        shots: int = 1024,
    ) -> dict[str, Any]:
        """
        Submit an OPENQASM 2.0 circuit to Azure Quantum (synchronous).

        When not connected, returns a mock pending response.

        Parameters
        ----------
        job_type : str
            Label used in the job name (e.g. "vqe", "qaoa_bipartition").
        circuit : str
            OPENQASM 2.0 circuit source.
        target : str | None
            Azure Quantum target.  Defaults to self.default_target.
            Use "ionq.qpu" for IonQ hardware, "ionq.simulator" for cloud
            simulation, "quantinuum.qpu.h1-1" for Quantinuum hardware, etc.
        shots : int
            Number of measurement shots.

        Returns
        -------
        dict with keys: id, status, target, provider, azure_job_id, error
        """
        resolved_target = target or self.default_target

        if not self._connected:
            return {
                "id": str(uuid.uuid4()),
                "status": "pending",
                "target": resolved_target,
                "provider": "local_simulator",
                "azure_job_id": None,
            }

        job_name = f"nexus-{job_type}-{uuid.uuid4().hex[:8]}"
        try:
            job = self._workspace.submit_job(  # type: ignore[union-attr]
                name=job_name,
                target=resolved_target,
                input_data=circuit.encode(),
                input_data_format=_INPUT_DATA_FORMAT,
                output_data_format=_OUTPUT_DATA_FORMAT,
                shots=shots,
            )
            logger.info(
                "SharedAzureQuantumClient: submitted job %s (target=%s, shots=%d)",
                job.id, resolved_target, shots,
            )
            return {
                "id": job.id,
                "status": "pending",
                "target": resolved_target,
                "provider": "azure",
                "azure_job_id": job.id,
            }
        except Exception as exc:
            logger.error("SharedAzureQuantumClient: job submission failed: %s", exc)
            return {
                "id": str(uuid.uuid4()),
                "status": "failed",
                "target": resolved_target,
                "provider": "azure",
                "azure_job_id": None,
                "error": str(exc),
            }

    # ── Job polling ────────────────────────────────────────────────────────────

    def get_job_status(self, azure_job_id: str) -> dict[str, Any]:
        """
        Poll a single job and return its current status (synchronous).

        Returns
        -------
        dict with keys: status, azure_job_id, counts (when completed), error
        """
        if not self._connected:
            return {"status": "unavailable", "azure_job_id": azure_job_id}
        try:
            job = self._workspace.get_job(azure_job_id)  # type: ignore[union-attr]
            job.refresh()
            status_raw = (job.details.status or "").lower()

            if status_raw in ("succeeded", "completed"):
                result = job.get_results()
                counts: dict[str, int] = {}
                if isinstance(result, dict):
                    counts = {k: int(v) for k, v in result.items() if isinstance(v, (int, float))}
                return {"status": "completed", "azure_job_id": azure_job_id, "counts": counts}

            if status_raw in ("failed", "cancelled"):
                err = (
                    getattr(getattr(job, "details", None), "error_message", None)
                    or status_raw
                )
                return {"status": "failed", "azure_job_id": azure_job_id, "error": err}

            return {"status": "pending", "azure_job_id": azure_job_id}

        except Exception as exc:
            logger.error("SharedAzureQuantumClient.get_job_status error: %s", exc)
            return {"status": "unknown", "azure_job_id": azure_job_id, "error": str(exc)}

    def poll_until_done(
        self,
        azure_job_id: str,
        timeout_sec: float,
        poll_interval_sec: float = 0.5,
    ) -> dict[str, Any]:
        """
        Poll a job repeatedly until it completes or the timeout is reached (synchronous).

        Returns the same dict structure as get_job_status.
        When the timeout expires the returned status is "pending".
        """
        deadline = time.monotonic() + timeout_sec
        while time.monotonic() < deadline:
            result = self.get_job_status(azure_job_id)
            if result["status"] not in ("pending",):
                return result
            time.sleep(poll_interval_sec)
        logger.info(
            "SharedAzureQuantumClient: job %s still pending after %.1fs",
            azure_job_id, timeout_sec,
        )
        return {"status": "pending", "azure_job_id": azure_job_id}

    # ── Target listing ─────────────────────────────────────────────────────────

    def list_targets(self) -> list[dict[str, Any]]:
        """Return available Azure Quantum targets, or mock list when offline."""
        if not self._connected:
            return [
                {"name": "ionq.qpu", "provider": "IonQ", "available": False},
                {"name": "ionq.simulator", "provider": "IonQ", "available": False},
                {"name": "quantinuum.qpu.h1-1", "provider": "Quantinuum", "available": False},
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
            logger.error("SharedAzureQuantumClient.list_targets error: %s", exc)
            return []


# ── Module-level singleton ─────────────────────────────────────────────────────

_client: Optional[SharedAzureQuantumClient] = None


def get_azure_client() -> SharedAzureQuantumClient:
    """Return the module-level SharedAzureQuantumClient singleton."""
    global _client
    if _client is None:
        _client = SharedAzureQuantumClient()
    return _client


def configure_client(
    workspace_id: str = "",
    subscription_id: str = "",
    resource_group: str = "",
    workspace_name: str = "",
    location: str = "",
    default_target: str = "",
) -> SharedAzureQuantumClient:
    """
    (Re-)configure the module-level singleton.

    Call this at app startup when you have settings objects rather than
    relying purely on environment variables.
    """
    global _client
    _client = SharedAzureQuantumClient(
        workspace_id=workspace_id,
        subscription_id=subscription_id,
        resource_group=resource_group,
        workspace_name=workspace_name,
        location=location,
        default_target=default_target,
    )
    return _client
