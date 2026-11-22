Feature: Reset a forgotten password
  People who forgot their password get a link by email to choose a new one. The link works
  once, and the answer never tells whether an address has an account.

  Scenario: Choosing a new password from the emailed link
    Given I have an account
    When I ask to reset my password
    Then I am asked to check my email
    And I receive a password reset link
    When I open the reset link and choose a new password
    Then I am told my password is changed
    And my old password no longer works
    And I can sign in with my new password

  Scenario: The new password has to be typed the same twice
    Given I have an account
    And I have asked to reset my password
    When I open the reset link and type two different passwords
    Then I see "The passwords don't match. Type the same password twice."

  Scenario: A reset link works only once
    Given I have an account
    And I have reset my password with the emailed link
    When I open the same reset link again
    Then I am told the reset link has expired or was already used

  Scenario: An address without an account gets the same answer
    Given I am a new visitor
    When I ask to reset my password
    Then I am asked to check my email
    And no reset link is emailed to me
