"""
Search & ranking algorithms for the projects API.

Design decisions:
  - BM25 text scoring for full-text relevance (better than TF-IDF for short docs)
  - Greedy tag similarity for tag-based filtering
  - Binary search for sorted ID lookups (O(log n) vs O(n))
  - Dynamic programming for edit-distance fuzzy matching
  - Graph BFS for related-project recommendation traversal
"""
from __future__ import annotations
import math
from typing import List, Dict, Optional, Tuple
from collections import defaultdict, deque


# ── BM25 Scoring ──────────────────────────────────────────────────────────────
# BM25 is the de-facto standard for IR ranking (used by Elasticsearch/Lucene).
# Params: k1=1.5 (term freq saturation), b=0.75 (length normalization)

K1, B = 1.5, 0.75

def tokenize(text: str) -> List[str]:
    """Simple whitespace + punctuation tokenizer."""
    import re
    return re.findall(r"[a-z0-9]+", text.lower())


def bm25_score(query: str, docs: List[Dict], fields: List[str]) -> List[Tuple[float, Dict]]:
    """
    Rank documents by BM25 relevance against a text query.

    Args:
        query:  User search string
        docs:   List of project dicts
        fields: Document fields to index (e.g. ['name', 'description'])

    Returns:
        List of (score, doc) tuples sorted by descending score.

    Complexity: O(|docs| * |query_tokens|)
    """
    query_tokens = tokenize(query)
    if not query_tokens:
        return [(0.0, d) for d in docs]

    # Build inverted index: term -> {doc_idx -> freq}
    inv_index: Dict[str, Dict[int, int]] = defaultdict(lambda: defaultdict(int))
    doc_lengths: List[int] = []

    for idx, doc in enumerate(docs):
        text = " ".join(str(doc.get(f, "")) for f in fields)
        tokens = tokenize(text)
        doc_lengths.append(len(tokens))
        for tok in tokens:
            inv_index[tok][idx] += 1

    n_docs   = len(docs)
    avg_dlen = sum(doc_lengths) / max(n_docs, 1)

    scores: List[float] = [0.0] * n_docs

    for term in query_tokens:
        df = len(inv_index[term])       # documents containing term
        if df == 0:
            continue
        # IDF component (log-smoothed)
        idf = math.log((n_docs - df + 0.5) / (df + 0.5) + 1)

        for doc_idx, tf in inv_index[term].items():
            dl   = doc_lengths[doc_idx]
            norm = K1 * (1 - B + B * dl / avg_dlen)
            # TF component (saturated)
            tf_score = tf * (K1 + 1) / (tf + norm)
            scores[doc_idx] += idf * tf_score

    ranked = sorted(zip(scores, docs), key=lambda x: x[0], reverse=True)
    return ranked


# ── Greedy Tag Similarity ──────────────────────────────────────────────────────
def jaccard_similarity(set_a: set, set_b: set) -> float:
    """
    Jaccard index: |A ∩ B| / |A ∪ B|.  O(min(|A|,|B|)).
    Returns 0.0 if both sets empty.
    """
    if not set_a and not set_b:
        return 0.0
    intersection = len(set_a & set_b)
    union        = len(set_a | set_b)
    return intersection / union


def tag_ranked(query_tags: List[str], docs: List[Dict]) -> List[Tuple[float, Dict]]:
    """
    Greedily rank docs by tag overlap using Jaccard similarity.
    O(n * max_tags).
    """
    q_set = set(t.lower() for t in query_tags)
    return sorted(
        [(jaccard_similarity(q_set, set(d.get("tags", []))), d) for d in docs],
        key=lambda x: x[0],
        reverse=True,
    )


# ── Binary Search on sorted ID list ───────────────────────────────────────────
def binary_search_id(sorted_ids: List[str], target: str) -> int:
    """
    Standard binary search. O(log n).
    Returns index or -1 if not found.
    """
    lo, hi = 0, len(sorted_ids) - 1
    while lo <= hi:
        mid = (lo + hi) >> 1          # arithmetic right shift = floor division
        if sorted_ids[mid] == target:
            return mid
        elif sorted_ids[mid] < target:
            lo = mid + 1
        else:
            hi = mid - 1
    return -1


# ── Levenshtein (DP edit distance) for fuzzy matching ─────────────────────────
def levenshtein(a: str, b: str) -> int:
    """
    Classic bottom-up DP. O(|a| * |b|) time, O(|b|) space.
    Used for fuzzy name matching when BM25 scores are all zero.
    """
    a, b = a.lower(), b.lower()
    if len(a) < len(b):
        a, b = b, a
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        curr = [i]
        for j, cb in enumerate(b, 1):
            cost = 0 if ca == cb else 1
            curr.append(min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost))
        prev = curr
    return prev[-1]


def fuzzy_match(query: str, docs: List[Dict], field: str = "name") -> List[Tuple[int, Dict]]:
    """
    Rank docs by edit distance to query on a given field. O(n * |query| * |field|).
    Lower score = better match.
    """
    return sorted(
        [(levenshtein(query, str(d.get(field, ""))), d) for d in docs],
        key=lambda x: x[0],
    )


# ── Graph BFS for related-project recommendations ────────────────────────────
def build_tag_graph(docs: List[Dict]) -> Dict[str, List[str]]:
    """
    Build adjacency list: doc_id -> [doc_id, ...] sharing ≥1 tag.
    O(n^2 * max_tags) — acceptable for small portfolios.
    """
    graph: Dict[str, List[str]] = defaultdict(list)
    for i, a in enumerate(docs):
        tags_a = set(a.get("tags", []))
        for j, b in enumerate(docs):
            if i == j:
                continue
            if tags_a & set(b.get("tags", [])):
                graph[a["id"]].append(b["id"])
    return dict(graph)


def bfs_related(start_id: str, graph: Dict[str, List[str]], max_hops: int = 2) -> List[str]:
    """
    BFS from start_id up to max_hops away.
    Returns ordered list of related project IDs. O(V + E).
    """
    visited: set = {start_id}
    queue:  deque = deque([(start_id, 0)])
    result: List[str] = []

    while queue:
        node, depth = queue.popleft()
        if depth >= max_hops:
            continue
        for neighbor in graph.get(node, []):
            if neighbor not in visited:
                visited.add(neighbor)
                result.append(neighbor)
                queue.append((neighbor, depth + 1))
    return result