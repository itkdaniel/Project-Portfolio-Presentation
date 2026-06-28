Feature: Quantum Job Lifecycle
  As an API consumer
  I want to submit, poll, and cancel quantum jobs
  So that I can track async computations through their full lifecycle

  Scenario: Submit a circuit simulation job and receive a completed result
    Given the quantum service is running
    When I submit a circuit simulation job with 512 shots
    Then the job is initially created with status "pending" or "running"
    And the job has a non-empty id
    And after polling the job is in a terminal state
    And the completed result payload contains "counts"

  Scenario: Submit a portfolio optimization job
    Given the quantum service is running
    When I submit a portfolio optimization job with 3 assets
    Then the job is initially created with status "pending" or "running"
    And after polling the portfolio job is in a terminal state
    And the portfolio weights sum approximately to 1.0

  Scenario: List jobs returns submitted jobs
    Given the quantum service is running
    And I have submitted 2 circuit simulation jobs
    When I list all jobs
    Then I receive at least 2 jobs in the response

  Scenario: Retrieve a single job by ID
    Given the quantum service is running
    And I have submitted a circuit simulation job
    When I retrieve the job by its ID
    Then the response matches the originally submitted job

  Scenario: Cancel a job
    Given the quantum service is running
    And I have submitted a circuit simulation job
    When I cancel the job
    Then the cancel response has status code 204

  Scenario: Get a non-existent job returns 404
    Given the quantum service is running
    When I request job with id "does-not-exist-abc123"
    Then the response status is 404
    And the response contains an "error" field

  Scenario: Submit job with invalid type returns 400
    Given the quantum service is running
    When I submit a job with type "invalid_quantum_magic"
    Then the response status is 400
    And the response contains an "error" field
