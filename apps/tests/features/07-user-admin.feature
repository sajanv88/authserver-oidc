Feature: Admins manage people's accounts
  On the Users screens, admins find someone, disable or enable the account, sign them out
  everywhere, require two-factor authentication, and delete the account. The person hears
  of it by email.

  Scenario: An admin finds someone by their email
    Given I am signed in as an admin
    And there is someone with an account
    When I search the users for their email
    Then they are the only one listed

  Scenario: A disabled account can't sign in until it's enabled
    Given I am signed in as an admin
    And there is someone with an account
    When I disable their account
    Then they are told by email that their account is disabled
    And they are told their account is disabled when they sign in
    When I enable their account
    Then they can sign in

  Scenario: Signing someone out everywhere
    Given I am signed in as an admin
    And someone is signed in on their device
    When I sign them out everywhere
    Then their device is signed out

  Scenario: Requiring two-factor sends them to set it up
    Given I am signed in as an admin
    And there is someone with an account
    When I require two-factor authentication of them
    And they sign in
    Then they are asked to set up two-factor authentication

  Scenario: Deleting an account
    Given I am signed in as an admin
    And there is someone with an account
    When I delete their account, typing their email address
    Then they are told by email that their account was deleted
    And they are no longer listed

  Scenario: Only admins see the users
    Given I am signed in
    When I open the users page
    Then I am told the page can't be found
