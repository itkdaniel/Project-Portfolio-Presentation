Feature: Wallet Lifecycle
  Scenario: Create and retrieve a wallet
    Given the crypto-wallet service is running
    When I create a wallet for user 'bdd-user'
    Then the wallet should be created successfully
    And I can retrieve it via user_id
