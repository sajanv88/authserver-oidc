Feature: Keep my account secure
  On the security pages, signed-in people change their password, and see and end the sessions
  their account has on each device.

  Scenario: Changing my password signs out my other devices
    Given I am signed in on this device and on another device
    When I change my password
    Then I am still signed in on this device
    And the other device is signed out

  Scenario: The page confirms that the password was changed
    Given I am signed in
    When I change my password
    Then I am told my password was changed

  Scenario: Changing my password needs the current one
    Given I am signed in
    When I change my password, giving a wrong current password
    Then I see "That isn't your current password."

  Scenario: Seeing where I'm signed in
    Given I am signed in on this device and on another device
    When I open the sessions on my security page
    Then the list of sessions shows this device and one other

  Scenario: Signing out another device
    Given I am signed in on this device and on another device
    When I sign out the other device from my security page
    Then the other device is signed out
    And I am still signed in on this device

  Scenario: Signing out everywhere
    Given I am signed in on this device and on another device
    When I sign out everywhere
    Then I am on the sign-in page
    And the other device is signed out
