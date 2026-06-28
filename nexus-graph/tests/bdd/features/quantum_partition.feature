Feature: Quantum graph bipartitioning
  The graph service exposes a QAOA-inspired graph partition endpoint that
  minimises cut weight using quantum annealing.

  Scenario: Happy path — bipartition returned
    Given the graph service is running
    When I POST nodes and edges to "/v1/graph/quantum/partition"
    Then the response status is 200
    And the body contains "partition_a"
    And the body contains "partition_b"
    And the body contains "cut_weight"
    And the body contains "classical_cut_weight"
    And the body contains "improvement_pct"
    And the body contains "fallback_used"

  Scenario: Offline fallback — simulates locally when Azure absent
    Given the graph service is running
    When I POST nodes and edges to "/v1/graph/quantum/partition"
    Then the response status is 200
    And "fallback_used" is a boolean in the body

  Scenario: Validation — single node rejected
    Given the graph service is running
    When I POST a single node to "/v1/graph/quantum/partition"
    Then the response status is 422 or 400
