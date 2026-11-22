Feature: Sign up and confirm the email address
  New people create an account with their name, email and a password. The account works
  once the address is confirmed with the link the auth server emails.

  Scenario: A new person signs up and confirms their address
    Given I am a new visitor
    When I sign up with my name, email and a password
    Then I am asked to check my email
    And I receive an email asking me to confirm my address
    When I open the confirmation link
    Then I am signed in to the security page

  Scenario: Signing in before confirming the address sends a new link
    Given I have signed up but not confirmed my address
    When I sign in with my email and password
    Then I am told to confirm my email first
    And I receive an email asking me to confirm my address

  Scenario: A confirmation link that doesn't work offers a new one
    Given I have signed up but not confirmed my address
    When I open a confirmation link that has expired
    Then I am told the link didn't work
    When I ask for a new confirmation link for my address
    Then I am asked to check my email
    And I receive an email asking me to confirm my address

  Scenario: Signing up with an address that already has an account
    Given I have an account
    When someone signs up with my email address
    Then I am asked to check my email
    And I receive an email saying I already have an account

  Scenario: The form says what is missing
    Given I am on the sign-up page
    When I submit the sign-up form empty
    Then I see "Enter your name."
    And I see "Enter your email address."
    And I see "Use at least 12 characters."
