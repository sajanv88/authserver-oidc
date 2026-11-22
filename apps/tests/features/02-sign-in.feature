Feature: Sign in and sign out
  People sign in with their email and password, or with a link emailed to them. The answer
  never tells whether an address has an account.

  Scenario: Signing in with the right password
    Given I have an account
    When I sign in with my email and password
    Then I am signed in to the security page

  Scenario: A wrong password is refused
    Given I have an account
    When I sign in with my email and a wrong password
    Then I am told the email or password is incorrect
    And I am still on the sign-in page

  Scenario: An address without an account gets the same answer
    Given I am a new visitor
    When I sign in with my email and password
    Then I am told the email or password is incorrect

  Scenario: A signed-in page asks me to sign in first, then takes me there
    Given I have an account
    When I open my security page
    Then I am asked to sign in first
    When I sign in with my email and password
    Then I am signed in to the security page

  Scenario: Signing out
    Given I am signed in
    When I sign out
    Then I am on the sign-in page
    And my security page asks me to sign in again

  Scenario: Signing in with a link sent by email
    Given I have an account
    When I ask for a sign-in link to be emailed to me
    Then I am asked to check my email
    And I receive a sign-in link
    When I open the sign-in link
    Then I am signed in to the security page

  Scenario: A sign-in link works only once
    Given I have signed in with a link sent by email
    And I have signed out
    When I open the same sign-in link again
    Then I am told the sign-in link didn't work
