Feature: Embedding Generation
  As an API client
  I want to generate semantic embeddings
  So that I can perform similarity search and clustering

  Background:
    Given the AI service is running with a mock model

  Scenario: Embed a single text
    When I POST to "/v1/ai/embed" with texts ["hello world"]
    Then the response status is 200
    And the response contains "embeddings"
    And "embeddings" has 1 rows
    And "cached" is false

  Scenario: Embed multiple texts
    When I POST to "/v1/ai/embed" with texts ["microservices", "docker", "kubernetes"]
    Then the response status is 200
    And "embeddings" has 3 rows
    And "dim" equals 64

  Scenario: Empty texts list is rejected
    When I POST to "/v1/ai/embed" with texts []
    Then the response status is 422

  Scenario: Response includes dim field
    When I POST to "/v1/ai/embed" with texts ["test embedding"]
    Then the response status is 200
    And the response contains "dim"

  Scenario: Response includes request_id
    When I POST to "/v1/ai/embed" with texts ["neural network"]
    Then the response status is 200
    And the response contains "request_id"

  Scenario: Embeddings are lists of floats
    When I POST to "/v1/ai/embed" with texts ["pytorch model"]
    Then the response status is 200
    And each embedding is a list of floats
