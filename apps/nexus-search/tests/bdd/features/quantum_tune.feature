Feature: Quantum BM25 parameter tuning
  The search service exposes a quantum-inspired BM25 tuning endpoint that
  finds optimal k1 and b parameters via simulated quantum annealing.

  Scenario: Happy path — optimal parameters returned
    Given the search service quantum endpoint is available
    When I POST training pairs to "/v1/search/quantum/tune"
    Then the response status is 200
    And the body contains "optimal_k1"
    And the body contains "optimal_b"
    And the body contains "quantum_ndcg"
    And the body contains "baseline_ndcg"
    And the body contains "fallback_used"

  Scenario: Offline fallback — runs locally when Azure absent
    Given the search service quantum endpoint is available
    When I POST training pairs to "/v1/search/quantum/tune"
    Then the response status is 200
    And "fallback_used" is a boolean in the body

  Scenario: Validation — empty training pairs rejected
    Given the search service quantum endpoint is available
    When I POST empty training pairs to "/v1/search/quantum/tune"
    Then the response status is 422
