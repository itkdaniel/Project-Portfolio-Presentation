Feature: Quantum embedding projection
  The AI service exposes a VQE-inspired quantum feature projection endpoint
  that works with or without Azure Quantum credentials.

  Scenario: Happy path — quantum embeddings returned
    Given the AI service is running with a mock model
    When I POST to "/v1/ai/quantum/embed" with texts "microservices docker" and target_dim 4
    Then the response status is 200
    And the body contains "quantum_embeddings"
    And the body contains "classical_embeddings"
    And the body contains "fidelity"
    And the body contains "fallback_used"

  Scenario: Offline fallback — simulates locally when Azure absent
    Given the AI service is running with a mock model
    When I POST to "/v1/ai/quantum/embed" with texts "pytorch transformer" and target_dim 4
    Then the response status is 200
    And "fallback_used" is true or false in the body

  Scenario: Validation — empty texts list rejected
    Given the AI service is running with a mock model
    When I POST to "/v1/ai/quantum/embed" with an empty texts list
    Then the response status is 422
