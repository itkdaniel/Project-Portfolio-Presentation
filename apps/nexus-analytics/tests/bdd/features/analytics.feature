Feature: Platform API analytics ingestion and reporting

  Background:
    Given the analytics service is running

  Scenario: Record a successful API call
    When I POST an event for service "nexus-quantum" with status 201 and latency 42ms
    Then the response status code is 201
    And the response body contains service "nexus-quantum"
    And the response body contains latency 42.0

  Scenario: Reject an event with an invalid HTTP method
    When I POST an event with HTTP method "NOTAVERB123"
    Then the response status code is 422
    And the response body contains "error"

  Scenario: Summary shows correct call counts
    Given I have recorded 3 events for "nexus-booking" with statuses 200, 200, 500
    When I GET /v1/analytics/summary
    Then the summary for "nexus-booking" has total_calls 3

  Scenario: Top-endpoints returns highest-volume endpoint first
    Given I have recorded 5 events for endpoint "/v1/quantum/jobs" and 2 for "/health"
    When I GET /v1/analytics/top-endpoints with limit 1
    Then the first endpoint is "/v1/quantum/jobs"

  Scenario: Error report excludes fully-healthy services
    Given I have recorded 1 success for "healthy-svc" and 1 error for "broken-svc"
    When I GET /v1/analytics/errors
    Then "broken-svc" appears in the results
    And "healthy-svc" does not appear in the results

  Scenario: Timeseries returns bucketed data points
    Given I have recorded 3 events spread across the last 3 hours
    When I GET /v1/analytics/timeseries with bucket_minutes 60
    Then I receive at least 1 timeseries bucket
    And the total calls across all buckets is 3
