Feature: Two-factor authentication
  People can ask for a code from an authenticator app after their password. Backup codes
  stand in for the app, once each.

  Scenario: Turning on two-factor authentication
    Given I am signed in
    When I set up two-factor authentication with my authenticator app
    Then two-factor authentication is on
    When I sign out and sign in again with my email and password
    Then I am asked for a code from my authenticator app
    When I enter the current code from my authenticator app
    Then I am signed in to the security page

  # Known bug: two-factor is turned on, but the dialog closes before it shows the backup
  # codes (the page loses the action's answer when it refreshes), so they're never seen.
  # @fail expects this scenario to fail; once the codes show, Playwright reports it.
  @fail
  Scenario: The backup codes are shown once two-factor authentication is on
    Given I am signed in
    When I set up two-factor authentication with my authenticator app
    Then I am given 10 backup codes to save

  Scenario: Signing in asks for a code from the app
    Given I have an account with two-factor authentication on
    When I sign in with my email and password
    Then I am asked for a code from my authenticator app
    When I enter the current code from my authenticator app
    Then I am signed in to the security page

  Scenario: A wrong code is refused
    Given I have an account with two-factor authentication on
    When I sign in with my email and password
    And I enter a code that isn't the current one
    Then I am told the code didn't match

  Scenario: A backup code instead of the app, once
    Given I have an account with two-factor authentication on
    When I sign in with my email and password
    And I enter one of my backup codes
    Then I am signed in to the security page
    When I sign out and sign in again with my email and password
    And I enter the same backup code again
    Then I am told the backup code didn't match or was already used

  Scenario: Turning two-factor authentication off
    Given I am signed in with two-factor authentication on
    When I turn off two-factor authentication with my password
    Then two-factor authentication is off

  Scenario: No sign-in links for an account with two-factor authentication
    Given I have an account with two-factor authentication on
    When I ask for a sign-in link to be emailed to me
    Then I am asked to check my email
    And no sign-in link is emailed to me
