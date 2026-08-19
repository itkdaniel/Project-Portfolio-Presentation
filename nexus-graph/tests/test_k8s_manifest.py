"""
Deployment-manifest validation for the NexusGraph Kubernetes deployment.

Guards the admin-token invariant end to end: the Deployment must both mount
NEXUS_GRAPH_ADMIN_TOKEN from the shared Secret AND set GRAPH_REQUIRE_ADMIN_TOKEN
so that an empty/misprovisioned Secret makes the pod fail fast instead of
serving graph write endpoints unauthenticated (see
app.main.enforce_admin_token_requirement).

Skipped automatically when the k8s manifests are not present (e.g. when tests
run inside the service Docker image, which only copies the app).
"""
from __future__ import annotations

from pathlib import Path

import pytest

yaml = pytest.importorskip("yaml")

_MANIFEST = Path(__file__).resolve().parents[2] / "k8s" / "nexus-graph-deployment.yaml"

pytestmark = pytest.mark.skipif(
    not _MANIFEST.exists(),
    reason="k8s manifests not available in this environment",
)


def _load_docs() -> list[dict]:
    with _MANIFEST.open() as fh:
        return [doc for doc in yaml.safe_load_all(fh) if doc]


def _graph_container() -> dict:
    docs = _load_docs()
    deployments = [d for d in docs if d.get("kind") == "Deployment"]
    assert deployments, "nexus-graph Deployment missing from manifest"
    containers = deployments[0]["spec"]["template"]["spec"]["containers"]
    matches = [c for c in containers if c["name"] == "nexus-graph"]
    assert matches, "nexus-graph container missing from Deployment"
    return matches[0]


def _env_by_name(container: dict) -> dict[str, dict]:
    return {e["name"]: e for e in container.get("env", [])}


def test_deployment_mounts_admin_token_from_secret():
    env = _env_by_name(_graph_container())
    assert "NEXUS_GRAPH_ADMIN_TOKEN" in env, "admin token env var missing"
    ref = env["NEXUS_GRAPH_ADMIN_TOKEN"].get("valueFrom", {}).get("secretKeyRef", {})
    assert ref.get("name") == "nexus-secrets"
    assert ref.get("key") == "graph-admin-token"


def test_deployment_requires_admin_token_fail_fast():
    """GRAPH_REQUIRE_ADMIN_TOKEN must be enabled so an empty Secret aborts startup."""
    env = _env_by_name(_graph_container())
    assert "GRAPH_REQUIRE_ADMIN_TOKEN" in env, (
        "GRAPH_REQUIRE_ADMIN_TOKEN missing — an empty graph-admin-token Secret "
        "would silently disable write-endpoint auth"
    )
    value = str(env["GRAPH_REQUIRE_ADMIN_TOKEN"].get("value", "")).strip().lower()
    assert value in {"1", "true", "yes"}, f"unexpected value: {value!r}"


def test_deployment_and_service_port_is_8006():
    docs = _load_docs()
    container = _graph_container()
    assert {p["containerPort"] for p in container["ports"]} == {8006}
    services = [d for d in docs if d.get("kind") == "Service"]
    assert services and services[0]["spec"]["ports"][0]["port"] == 8006


def test_deployment_runs_as_non_root():
    docs = _load_docs()
    deployment = next(d for d in docs if d.get("kind") == "Deployment")
    pod_sec = deployment["spec"]["template"]["spec"].get("securityContext", {})
    assert pod_sec.get("runAsNonRoot") is True
    assert pod_sec.get("runAsUser") == 10001
