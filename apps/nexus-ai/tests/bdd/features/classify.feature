Feature: Intent Classification
  As an API client
  I want to classify text intents
  So that I can route queries to the right service

  Background:
    Given the AI service is running with a mock model

  Scenario: Classify a single text with default top_k
    When I POST to "/v1/ai/classify" with text "I need help with my microservices"
    Then the response status is 200
    And the response contains "predictions"
    And "predictions" has 3 items
    And each prediction has "label" and "score"

  Scenario: Classify with top_k=1
    When I POST to "/v1/ai/classify" with text "docker deployment" and top_k 1
    Then the response status is 200
    And "predictions" has 1 items

  Scenario: Classify with top_k=5
    When I POST to "/v1/ai/classify" with text "machine learning model" and top_k 5
    Then the response status is 200
    And "predictions" has 5 items

  Scenario: Empty text is rejected
    When I POST to "/v1/ai/classify" with text that is 1001 characters long
    Then the response status is 422

  Scenario: Response includes device field
    When I POST to "/v1/ai/classify" with text "devops automation"
    Then the response status is 200
    And the response contains "device"

  Scenario: Response includes request_id
    When I POST to "/v1/ai/classify" with text "kubernetes scaling"
    Then the response status is 200
    And the response contains "request_id"

  Scenario: All prediction scores sum approximately to 1
    When I POST to "/v1/ai/classify" with text "pricing and billing"
    Then the response status is 200
    And prediction scores sum is approximately 1.0
