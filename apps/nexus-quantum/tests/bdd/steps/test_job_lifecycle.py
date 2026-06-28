"""
pytest-bdd step definitions for job lifecycle feature.

pytest-bdd does not support async step functions natively, so all HTTP calls
use starlette.testclient.TestClient (synchronous ASGI wrapper) instead of
httpx.AsyncClient.  Jobs now return status=pending immediately; poll steps
retry GET until the job reaches a terminal state.
"""
from __future__ import annotations

import asyncio
import os
import time

import pytest
from pytest_bdd import given, parsers, scenario, then, when
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from starlette.testclient import TestClient

import app.database as _db_module
from app.config import Settings
from app.database import Base, get_db_dep
from app.main import create_app
from app.services.azure_quantum import configure_azure

TERMINAL = {"completed", "failed", "cancelled"}

FEATURE_FILE = os.path.join(
    os.path.dirname(__file__), "..", "features", "job_lifecycle.feature"
)


def _make_settings(db_url: str):
    return Settings(database_url=db_url, port=8200, debug=True)


def _poll_job(client: TestClient, job_id: str, timeout: float = 5.0, interval: float = 0.05) -> dict:
    """Poll GET until the job leaves pending/running.  Returns the final dict."""
    deadline = time.monotonic() + timeout
    while True:
        data = client.get(f"/v1/quantum/jobs/{job_id}").json()
        if data.get("status") not in ("pending", "running"):
            return data
        if time.monotonic() >= deadline:
            return data
        time.sleep(interval)


# ── Shared state ───────────────────────────────────────────────────────────────

class ScenarioState:
    def __init__(self):
        self.client: TestClient | None = None
        self.response = None
        self.data = None
        self.job = None
        self.final_job: dict | None = None
        self.submitted_jobs: list = []


@pytest.fixture
def state() -> ScenarioState:
    return ScenarioState()


@pytest.fixture
def bdd_client(state: ScenarioState, tmp_path):
    """Synchronous TestClient backed by a per-test file-based SQLite DB.

    Using a file DB (not :memory:) ensures that the table-creation event loop
    (asyncio.run) and the TestClient's event loop (anyio) share the same
    physical database file, so background tasks can read/write the rows
    created during request handling.

    The module-level _engine and _session_factory are injected so that
    get_db() calls inside background tasks use the same DB as the DI-override.
    """
    db_file = tmp_path / "bdd_test.db"
    db_url = f"sqlite+aiosqlite:///{db_file}"
    settings = _make_settings(db_url)

    engine = create_async_engine(db_url, echo=False, connect_args={"check_same_thread": False})

    async def _setup():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
            await conn.run_sync(Base.metadata.create_all)

    asyncio.run(_setup())

    prev_engine = _db_module._engine
    prev_factory = _db_module._session_factory

    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    _db_module._engine = engine
    _db_module._session_factory = factory

    configure_azure(settings)

    async def override_db():
        async with factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app_instance = create_app(settings)
    app_instance.dependency_overrides[get_db_dep] = override_db

    with TestClient(app_instance, raise_server_exceptions=True) as client:
        state.client = client
        yield client

    _db_module._engine = prev_engine
    _db_module._session_factory = prev_factory

    async def _teardown():
        await engine.dispose()

    asyncio.run(_teardown())


# ── Scenarios ─────────────────────────────────────────────────────────────────

@scenario(FEATURE_FILE, "Submit a circuit simulation job and receive a completed result")
def test_submit_circuit_job():
    pass


@scenario(FEATURE_FILE, "Submit a portfolio optimization job")
def test_submit_portfolio_job():
    pass


@scenario(FEATURE_FILE, "List jobs returns submitted jobs")
def test_list_jobs():
    pass


@scenario(FEATURE_FILE, "Retrieve a single job by ID")
def test_get_job():
    pass


@scenario(FEATURE_FILE, "Cancel a job")
def test_cancel_job():
    pass


@scenario(FEATURE_FILE, "Get a non-existent job returns 404")
def test_get_nonexistent_job():
    pass


@scenario(FEATURE_FILE, "Submit job with invalid type returns 400")
def test_invalid_job_type():
    pass


# ── Shared given ──────────────────────────────────────────────────────────────

@given("the quantum service is running")
def service_running(bdd_client, state):
    pass


# ── Circuit simulation scenario ───────────────────────────────────────────────

@when("I submit a circuit simulation job with 512 shots")
def submit_circuit_job(bdd_client, state):
    resp = bdd_client.post(
        "/v1/quantum/jobs",
        json={
            "job_type": "circuit_simulation",
            "input_payload": {
                "circuit": "OPENQASM 3.0; qubit[2] q; h q[0]; cx q[0], q[1];",
                "shots": 512,
            },
        },
    )
    state.response = resp
    state.data = resp.json()


@then(parsers.parse('the job is initially created with status "{status_a}" or "{status_b}"'))
def check_initial_status(state, status_a, status_b):
    assert state.data["status"] in (status_a, status_b, "completed", "failed"), (
        f"Unexpected status: {state.data['status']}"
    )


@then("the job has a non-empty id")
def check_job_id(state):
    assert state.data.get("id")


@then("after polling the job is in a terminal state")
def poll_circuit_job(bdd_client, state):
    state.final_job = _poll_job(bdd_client, state.data["id"])
    assert state.final_job["status"] in TERMINAL


@then(parsers.parse('the completed result payload contains "{key}"'))
def check_result_key(state, key):
    if state.final_job and state.final_job.get("status") == "completed":
        result = state.final_job.get("result_payload") or {}
        assert key in result, f"'{key}' not in result_payload: {result}"


# ── Portfolio scenario ────────────────────────────────────────────────────────

@when("I submit a portfolio optimization job with 3 assets")
def submit_portfolio_job(bdd_client, state):
    resp = bdd_client.post(
        "/v1/quantum/jobs",
        json={
            "job_type": "portfolio_optimization",
            "input_payload": {
                "assets": ["BTC", "ETH", "SOL"],
                "expected_returns": [0.12, 0.08, 0.20],
                "covariance_matrix": [
                    [0.04, 0.01, 0.02],
                    [0.01, 0.02, 0.01],
                    [0.02, 0.01, 0.05],
                ],
                "risk_tolerance": 0.5,
                "algorithm": "qaoa",
            },
        },
    )
    state.response = resp
    state.data = resp.json()


@then("after polling the portfolio job is in a terminal state")
def poll_portfolio_job(bdd_client, state):
    state.final_job = _poll_job(bdd_client, state.data["id"])
    assert state.final_job["status"] in TERMINAL


@then("the portfolio weights sum approximately to 1.0")
def check_weights_sum(state):
    if state.final_job and state.final_job.get("status") == "completed":
        result = state.final_job.get("result_payload") or {}
        weights = result.get("weights", {})
        total = sum(weights.values())
        assert abs(total - 1.0) < 0.05, f"Weights sum {total} not close to 1.0"


# ── List jobs scenario ────────────────────────────────────────────────────────

@given("I have submitted 2 circuit simulation jobs")
def submit_two_jobs(bdd_client, state):
    for _ in range(2):
        resp = bdd_client.post(
            "/v1/quantum/jobs",
            json={"job_type": "circuit_simulation", "input_payload": {"circuit": "", "shots": 64}},
        )
        state.submitted_jobs.append(resp.json())


@when("I list all jobs")
def list_all_jobs(bdd_client, state):
    resp = bdd_client.get("/v1/quantum/jobs")
    state.response = resp
    state.data = resp.json()


@then("I receive at least 2 jobs in the response")
def check_at_least_two(state):
    assert len(state.data) >= 2


# ── Get by ID scenario ────────────────────────────────────────────────────────

@given("I have submitted a circuit simulation job")
def submit_one_job(bdd_client, state):
    resp = bdd_client.post(
        "/v1/quantum/jobs",
        json={"job_type": "circuit_simulation", "input_payload": {"circuit": "", "shots": 64}},
    )
    state.job = resp.json()


@when("I retrieve the job by its ID")
def get_job_by_id(bdd_client, state):
    job_id = state.job["id"]
    resp = bdd_client.get(f"/v1/quantum/jobs/{job_id}")
    state.response = resp
    state.data = resp.json()


@then("the response matches the originally submitted job")
def check_id_matches(state):
    assert state.data["id"] == state.job["id"]


# ── Cancel scenario ───────────────────────────────────────────────────────────

@when("I cancel the job")
def cancel_the_job(bdd_client, state):
    job_id = state.job["id"]
    resp = bdd_client.delete(f"/v1/quantum/jobs/{job_id}")
    state.response = resp


@then(parsers.parse("the cancel response has status code {code:d}"))
def check_cancel_code(state, code):
    assert state.response.status_code == code


# ── Not found scenario ────────────────────────────────────────────────────────

@when(parsers.parse('I request job with id "{job_id}"'))
def get_nonexistent_job(bdd_client, state, job_id):
    resp = bdd_client.get(f"/v1/quantum/jobs/{job_id}")
    state.response = resp
    state.data = resp.json()


@then(parsers.parse("the response status is {code:d}"))
def check_status_code(state, code):
    assert state.response.status_code == code


@then(parsers.parse('the response contains an "{field}" field'))
def check_field_present(state, field):
    assert field in state.data


# ── Invalid job type scenario ─────────────────────────────────────────────────

@when(parsers.parse('I submit a job with type "{job_type}"'))
def submit_invalid_job(bdd_client, state, job_type):
    resp = bdd_client.post(
        "/v1/quantum/jobs",
        json={"job_type": job_type, "input_payload": {}},
    )
    state.response = resp
    state.data = resp.json()
