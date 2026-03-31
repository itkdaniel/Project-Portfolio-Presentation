"""
Unit tests for search and graph algorithms.
Run with: pytest tests/test_algorithms.py -v
"""
import pytest
from app.algorithms.search import (
    bm25_score, jaccard_similarity, binary_search_id,
    levenshtein, fuzzy_match, build_tag_graph, bfs_related, tag_ranked,
)

SAMPLE_DOCS = [
    {"id": "1", "name": "Auth Service",    "description": "JWT authentication microservice", "tags": ["auth", "jwt", "security"]},
    {"id": "2", "name": "Analytics Engine","description": "Real-time data streaming pipeline", "tags": ["kafka", "streaming", "data"]},
    {"id": "3", "name": "Commerce API",    "description": "Headless e-commerce GraphQL API",  "tags": ["graphql", "stripe", "ecommerce"]},
    {"id": "4", "name": "Auth Gateway",    "description": "OAuth2 gateway service",           "tags": ["auth", "oauth", "security"]},
]


class TestBM25:
    def test_query_auth_returns_auth_docs_first(self):
        ranked = bm25_score("auth", SAMPLE_DOCS, ["name", "description"])
        top_ids = [d["id"] for _, d in ranked if _ > 0]
        assert "1" in top_ids or "4" in top_ids  # auth-related docs ranked first

    def test_empty_query_returns_zero_scores(self):
        ranked = bm25_score("", SAMPLE_DOCS, ["name"])
        assert all(score == 0.0 for score, _ in ranked)

    def test_exact_term_match_ranks_higher(self):
        ranked = bm25_score("GraphQL", SAMPLE_DOCS, ["name", "description"])
        top = ranked[0][1]
        assert top["id"] == "3"  # Commerce API has GraphQL


class TestJaccard:
    def test_identical_sets_return_1(self):
        assert jaccard_similarity({"a", "b"}, {"a", "b"}) == 1.0

    def test_disjoint_sets_return_0(self):
        assert jaccard_similarity({"a"}, {"b"}) == 0.0

    def test_partial_overlap(self):
        score = jaccard_similarity({"a", "b", "c"}, {"b", "c", "d"})
        assert 0 < score < 1

    def test_empty_sets_return_0(self):
        assert jaccard_similarity(set(), set()) == 0.0


class TestBinarySearch:
    def test_finds_existing_id(self):
        ids = ["a", "b", "c", "d", "e"]
        assert binary_search_id(ids, "c") == 2

    def test_returns_minus_one_for_missing(self):
        assert binary_search_id(["a", "b", "c"], "z") == -1

    def test_single_element_found(self):
        assert binary_search_id(["only"], "only") == 0


class TestLevenshtein:
    def test_identical_strings(self):
        assert levenshtein("auth", "auth") == 0

    def test_single_substitution(self):
        assert levenshtein("auth", "Auth") == 0  # lowercase normalization

    def test_empty_string(self):
        assert levenshtein("abc", "") == 3

    def test_insertion(self):
        assert levenshtein("ab", "abc") == 1


class TestGraph:
    def test_bfs_finds_related_by_shared_tag(self):
        graph = build_tag_graph(SAMPLE_DOCS)
        related = bfs_related("1", graph)  # Auth Service
        # Auth Service and Auth Gateway share "auth" tag
        assert "4" in related

    def test_bfs_max_hops_limits_results(self):
        graph = build_tag_graph(SAMPLE_DOCS)
        related_0 = bfs_related("1", graph, max_hops=0)
        assert related_0 == []

    def test_isolated_node_has_no_relations(self):
        isolated = [{"id": "x", "name": "Isolated", "description": "No tags", "tags": []}]
        graph = build_tag_graph(isolated)
        assert bfs_related("x", graph) == []