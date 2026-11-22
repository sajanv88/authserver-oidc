Feature: Apps sign people in with OIDC
  Admins register the apps (OIDC clients) that may sign people in here. An app sends people
  here to sign in, they allow it once, and the app gets tokens and an ID token it verifies.
  The example app plays the app's part.

  Scenario: An admin registers a confidential app and sees its secret once
    Given I am signed in as an admin
    When I register a confidential app
    Then I am shown its client ID and its secret
    When I copy the client ID
    Then I am told the client ID was copied
    When I close the dialog
    Then the app is listed as confidential, with its redirect URI

  Scenario: An admin rotates an app's secret
    Given I am signed in as an admin
    And I have registered a confidential app
    When I rotate its secret
    Then I am shown a new secret, not the old one

  Scenario: An admin deletes an app
    Given I am signed in as an admin
    And I have registered a confidential app
    When I delete it
    Then it is no longer listed

  Scenario: Only admins manage apps
    Given I am signed in
    When I open the OIDC clients page
    Then I am told the page can't be found

  Scenario: Signing in to an app and allowing it
    Given I have an account
    When I sign in to the example app with OIDC
    And I sign in with my email and password
    Then I am asked to allow the example app to:
      | Know it's you         |
      | Your name and picture |
      | Your email address    |
      | Stay connected        |
    When I allow it
    Then the example app has signed me in with a verified ID token

  Scenario: Denying the app
    Given I have an account
    When I sign in to the example app with OIDC
    And I sign in with my email and password
    And I deny it
    Then the example app says I chose Deny

  Scenario: An app I allowed doesn't ask again
    Given I have signed in to the example app with OIDC and allowed it
    When I sign out of the example app
    And I sign in to the example app with OIDC again
    Then the example app has signed me in with a verified ID token

  Scenario: The app refreshes its tokens
    Given I have signed in to the example app with OIDC and allowed it
    When the example app refreshes its tokens
    Then the example app says the tokens were refreshed

  Scenario: An app on a sibling subdomain sees the shared session
    Given I am signed in
    When I open the example app
    Then the example app sees that I am signed in here
