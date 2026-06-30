"""
BM25 corpus mismatch detection tests.

These tests specifically validate that the in-memory BM25 index stays
consistent with the DB after every write operation (create, update, delete).
If the incremental index update path is broken, search results silently decay
without any error being raised — this file catches that class of regression.

Coverage:
  1. After a project update the new tokens are indexed and the old stale tokens
     no longer affect scoring (content drift detection).
  2. After a project delete the doc is removed from the BM25 corpus so a
     targeted query returns no hits (phantom-doc detection).
  3. Multiple sequential updates preserve the correct corpus size (n_docs
     bookkeeping regression).
  4. A freshly created project is immediately present in the BM25 index before
     any search request is made (creation path validation).
  5. Deleting a non-existent project does not corrupt the BM25 index state.
  6. Replacing a project's entire description flips searchability for both old
     and new keywords in one round-trip (full-content replacement).
  7. A sequence of create → update → delete leaves the BM25 corpus clean with
     no phantom entries.

All tests reuse the shared `admin_client` / `client` / `app` fixtures from
`tests/conftest.py` (in-memory SQLite + fakeredis — no external deps).
"""
from __future__ import annotations

import pytest

from app.algorithms.search import get_bm25_index


# ── Helpers ───────────────────────────────────────────────────────────────────

def _index_contains(doc_id: str) -> bool:
    """Return True if the BM25 singleton has the given doc_id in its corpus."""
    return doc_id in get_bm25_index()._doc_tokens


def _index_doc_count() -> int:
    """Return the BM25 singleton's current n_docs counter."""
    return get_bm25_index()._n_docs


def _index_tokens_for(doc_id: str) -> list[str]:
    """Return the token list stored for a doc (empty list if absent)."""
    return get_bm25_index()._doc_tokens.get(doc_id, [])


# ── Tests ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_update_reflects_new_content_in_bm25_index(client, admin_client):
    """
    After PATCH, the BM25 index must contain the updated tokens so a search
    on a new keyword returns the project and a search on the replaced unique
    keyword returns nothing.
    """
    cr = await admin_client.post("/v1/projects/", json={
        "name": "Mutable Service",
        "description": "zephyrcloud distributed tracing platform",
        "type": "backend",
        "tags": ["tracing"],
    })
    assert cr.status_code == 201, cr.text
    pid = cr.json()["id"]

    # Confirm old unique keyword is indexed
    assert "zephyrcloud" in _index_tokens_for(pid), (
        "Expected 'zephyrcloud' in BM25 tokens immediately after creation"
    )

    # Update with a completely different description
    patch = await admin_client.patch(f"/v1/projects/{pid}", json={
        "description": "nebulasync event-driven messaging broker",
    })
    assert patch.status_code == 200, patch.text

    # New keyword must now be in the BM25 index
    assert "nebulasync" in _index_tokens_for(pid), (
        "BM25 index did not pick up the new token 'nebulasync' after PATCH"
    )

    # Old unique keyword must be gone from this doc's token list
    assert "zephyrcloud" not in _index_tokens_for(pid), (
        "Stale token 'zephyrcloud' still present in BM25 index after PATCH — "
        "incremental upsert failed to remove old tokens"
    )

    # End-to-end: the search endpoint must return the project for the new keyword
    resp = await client.get("/v1/search/", params={"q": "nebulasync"})
    assert resp.status_code == 200, resp.text
    names = [p["name"] for p in resp.json()]
    assert "Mutable Service" in names, (
        "Updated project not findable via search for new description keyword"
    )


@pytest.mark.asyncio
async def test_delete_removes_doc_from_bm25_index(client, admin_client):
    """
    After DELETE the doc must be absent from the BM25 corpus so a targeted
    search query returns no results.
    """
    cr = await admin_client.post("/v1/projects/", json={
        "name": "Ephemeral BM25 Target",
        "description": "vortexdb specialized database for ephemeral workloads",
        "type": "backend",
        "tags": ["ephemeral", "database"],
    })
    assert cr.status_code == 201, cr.text
    pid = cr.json()["id"]

    assert _index_contains(pid), "Project not found in BM25 index right after creation"

    dr = await admin_client.delete(f"/v1/projects/{pid}")
    assert dr.status_code == 204, dr.text

    # Index must no longer reference the doc
    assert not _index_contains(pid), (
        "Deleted project still present in BM25 corpus — delete() did not clean up the index"
    )

    # End-to-end: targeted search must produce no hit
    resp = await client.get("/v1/search/", params={"q": "vortexdb"})
    assert resp.status_code == 200, resp.text
    names = [p["name"] for p in resp.json()]
    assert "Ephemeral BM25 Target" not in names, (
        "Deleted project still returned by BM25 search — phantom doc in corpus"
    )


@pytest.mark.asyncio
async def test_sequential_updates_preserve_n_docs(admin_client):
    """
    n_docs must remain stable across multiple updates of the same project.
    Each upsert removes then re-inserts one doc, so the count should not drift.
    """
    baseline = _index_doc_count()

    cr = await admin_client.post("/v1/projects/", json={
        "name": "Counter Canary",
        "description": "initial description for counter test",
        "type": "backend",
        "tags": ["counter"],
    })
    assert cr.status_code == 201, cr.text
    pid = cr.json()["id"]

    assert _index_doc_count() == baseline + 1, "n_docs should increase by 1 after create"

    for i in range(4):
        patch = await admin_client.patch(f"/v1/projects/{pid}", json={
            "description": f"updated description iteration {i} for counter canary",
        })
        assert patch.status_code == 200, patch.text
        assert _index_doc_count() == baseline + 1, (
            f"n_docs drifted after update iteration {i}: "
            f"expected {baseline + 1}, got {_index_doc_count()}"
        )


@pytest.mark.asyncio
async def test_created_project_immediately_in_bm25_index(admin_client):
    """
    A newly created project must be present in the BM25 corpus immediately
    after the POST returns — before any search request triggers lazy indexing.
    """
    cr = await admin_client.post("/v1/projects/", json={
        "name": "Instant Index Service",
        "description": "quarkonix real-time stream indexing service",
        "type": "backend",
        "tags": ["indexing"],
    })
    assert cr.status_code == 201, cr.text
    pid = cr.json()["id"]

    assert _index_contains(pid), (
        "Project not found in BM25 corpus immediately after creation — "
        "the POST handler must call get_bm25_index().upsert() synchronously"
    )
    assert "quarkonix" in _index_tokens_for(pid), (
        "Unique description token 'quarkonix' missing from BM25 index right after creation"
    )


@pytest.mark.asyncio
async def test_delete_nonexistent_project_does_not_corrupt_index(admin_client):
    """
    Deleting a project that does not exist must return 404 and must not
    alter the BM25 corpus size.
    """
    before = _index_doc_count()
    dr = await admin_client.delete("/v1/projects/nonexistent-id-that-never-existed")
    assert dr.status_code == 404, f"Expected 404, got {dr.status_code}"
    assert _index_doc_count() == before, (
        "BM25 n_docs changed after a 404 delete — index state was corrupted"
    )


@pytest.mark.asyncio
async def test_full_content_replacement_flips_searchability(client, admin_client):
    """
    Replacing the entire description of a project must flip which keywords
    are present in the BM25 index: the old unique keyword must be absent from
    the index and the new unique keyword must be present after a single PATCH.

    Note on end-to-end search behaviour: when ALL BM25 scores are zero the
    search router falls back to fuzzy (Levenshtein) matching on the `name`
    field, which may return any project. The per-doc BM25 score assertions
    below directly verify the index state without being confused by the fuzzy
    fallback path.
    """
    cr = await admin_client.post("/v1/projects/", json={
        "name": "Flip Service",
        "description": "hyperledger blockchain consensus protocol implementation",
        "type": "backend",
        "tags": ["blockchain"],
    })
    assert cr.status_code == 201, cr.text
    pid = cr.json()["id"]

    # Verify old unique keyword is in the index before the patch
    old_tokens = _index_tokens_for(pid)
    assert "hyperledger" in old_tokens, "Expected 'hyperledger' in tokens before patch"

    # Full replacement
    patch = await admin_client.patch(f"/v1/projects/{pid}", json={
        "description": "prismaflow vector database for similarity search workloads",
        "tags": ["vector", "similarity"],
    })
    assert patch.status_code == 200, patch.text

    new_tokens = _index_tokens_for(pid)
    assert "prismaflow" in new_tokens, (
        "New unique keyword 'prismaflow' missing from BM25 index after full replacement"
    )
    assert "hyperledger" not in new_tokens, (
        "Old keyword 'hyperledger' still in BM25 index after full content replacement"
    )

    # Direct BM25 score check: old keyword must score zero for this doc
    idx = get_bm25_index()
    old_scored = {d["id"]: score for score, d in idx.search("hyperledger")}
    assert old_scored.get(pid, 0.0) == 0.0, (
        f"BM25 score for 'hyperledger' on updated doc should be 0.0, "
        f"got {old_scored.get(pid)}"
    )

    # Direct BM25 score check: new keyword must score above zero for this doc
    new_scored = {d["id"]: score for score, d in idx.search("prismaflow")}
    assert new_scored.get(pid, 0.0) > 0.0, (
        f"BM25 score for 'prismaflow' on updated doc should be > 0, "
        f"got {new_scored.get(pid, 0.0)}"
    )

    # End-to-end: search for the new keyword must surface this project
    new_resp = await client.get("/v1/search/", params={"q": "prismaflow"})
    assert new_resp.status_code == 200
    new_names = [p["name"] for p in new_resp.json()]
    assert "Flip Service" in new_names, (
        "Project not found by new keyword 'prismaflow' after content was replaced"
    )


@pytest.mark.asyncio
async def test_create_update_delete_leaves_clean_corpus(admin_client):
    """
    A full create → update → delete lifecycle must leave the BM25 corpus
    exactly as it was before the project existed (no phantom entries, no
    n_docs drift).
    """
    baseline_count = _index_doc_count()

    cr = await admin_client.post("/v1/projects/", json={
        "name": "Lifecycle Service",
        "description": "solarplex distributed cache warming service",
        "type": "backend",
        "tags": ["cache"],
    })
    assert cr.status_code == 201, cr.text
    pid = cr.json()["id"]

    assert _index_doc_count() == baseline_count + 1
    assert _index_contains(pid)

    patch = await admin_client.patch(f"/v1/projects/{pid}", json={
        "description": "solarplex evolved into a persistent message queue",
    })
    assert patch.status_code == 200, patch.text
    assert _index_doc_count() == baseline_count + 1, "n_docs drifted after update"

    dr = await admin_client.delete(f"/v1/projects/{pid}")
    assert dr.status_code == 204, dr.text

    assert not _index_contains(pid), (
        "Project still in BM25 index after full lifecycle delete"
    )
    assert _index_doc_count() == baseline_count, (
        f"n_docs did not return to baseline after lifecycle delete. "
        f"Expected {baseline_count}, got {_index_doc_count()}"
    )
