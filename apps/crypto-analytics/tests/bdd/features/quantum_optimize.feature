Feature: Quantum portfolio optimization
  The crypto-analytics service exposes a QAOA-inspired portfolio optimization
  endpoint that finds Pareto-optimal weights on the efficient frontier.

  Scenario: Happy path — quantum and classical weights returned
    Given the crypto-analytics quantum endpoint is available
    When I POST a portfolio optimization request
    Then the response status is 200
    And the body contains "quantum_weights"
    And the body contains "classical_weights"
    And the body contains "quantum_sharpe"
    And the body contains "classical_sharpe"
    And the body contains "fallback_used"

  Scenario: Offline fallback — runs locally when Azure absent
    Given the crypto-analytics quantum endpoint is available
    When I POST a portfolio optimization request
    Then the response status is 200
    And "fallback_used" is a boolean in the body

  Scenario: Validation — single asset rejected
    Given the crypto-analytics quantum endpoint is available
    When I POST a single-asset optimization request
    Then the response status is 422
