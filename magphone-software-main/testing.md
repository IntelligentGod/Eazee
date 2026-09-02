# CrossDrag Testing Guide

## Purpose

This document explains how to create, add, and run tests for CrossDrag.

CrossDrag uses the **MagPhone test system** for tests that require two connected devices. Tests are designed to verify that the actual CrossDrag communication system works correctly on physical Android devices.

The existing core tests verify:

* Connection
* Two-way payload communication

Additional tests can be added as new CrossDrag features are implemented.

---

# 1. Test Architecture

The testing system is split into three main parts:

```text
MainActivity
    │
    ├── Run MagPhone Tests
    │
    ▼
CrossDragManager
    │
    ▼
MagPhoneTestManager
    │
    ├── Runs tests
    ├── Sends test messages
    ├── Receives responses
    └── Produces MagPhoneTestResult
    │
    ▼
MainActivity
    │
    └── Displays results
```

### Important files

The exact file locations may change as the project grows, but the important classes are:

```text
tests/
├── MagphoneTestManager.kt
└── MagphoneTestResult.kt
```

The connection system is responsible for transporting test messages.

The test manager is responsible for deciding what the tests actually do.

---

# 2. What Makes a Good Test?

A CrossDrag test should test **one specific piece of functionality**.

Good examples:

```text
Connection test
Payload test
File transfer test
Large file transfer test
Folder transfer test
Disconnect test
Reconnect test
Multiple-device test
```

Avoid making one test responsible for checking many unrelated things.

For example, instead of:

```text
"Test everything"
```

prefer:

```text
Connection
Payload
File Transfer
Folder Transfer
Reconnect
```

This makes failures much easier to understand.

---

# 3. Test Result Structure

Tests should produce a `MagPhoneTestResult`.

The result currently contains information such as:

```kotlin
MagphoneTestResult(
    name = "Payload",
    passed = true,
    message = "Two-way message exchange succeeded"
)
```

The important fields are:

### `name`

The name shown in the UI.

Example:

```kotlin
name = "Payload"
```

Keep this short and recognizable.

### `passed`

Whether the test succeeded.

```kotlin
passed = true
```

or:

```kotlin
passed = false
```

### `message`

A useful description of what happened.

Good:

```kotlin
message = "Two-way message exchange succeeded"
```

Bad:

```kotlin
message = "OK"
```

The message should help diagnose a failure without opening the source code.

---

# 4. Creating a New Test

## Step 1 — Decide what the test verifies

Before writing code, define the exact behaviour being tested.

For example:

> Verify that one device can send a 1 MB file to another device and the received file matches the original.

This gives the test a clear pass/fail condition.

---

## Step 2 — Choose a test name

Use a short name.

Example:

```kotlin
"File Transfer"
```

For related tests, use consistent names:

```text
File Transfer
Large File Transfer
Folder Transfer
```

---

## Step 3 — Add the test to `MagPhoneTestManager`

Tests that require communication between two phones should normally live in:

```text
MagphoneTestManager.kt
```

A test should follow the existing pattern used by the connection and payload tests.

Conceptually:

```kotlin
private fun runMyTest(
    endpointId: String
): MagphoneTestResult {

    // Perform test

    return MagphoneTestResult(
        name = "My Test",
        passed = true,
        message = "Test succeeded"
    )
}
```

The actual implementation will depend on what is being tested.

---

# 5. Tests That Require Two Devices

Most CrossDrag tests will require communication between two devices.

For these tests, remember that the test may be running on either phone.

For example:

```text
Phone A                    Phone B
   │                          │
   │──── TEST_REQUEST ───────►│
   │                          │
   │◄─── TEST_RESPONSE ───────│
   │                          │
```

The test must therefore distinguish between:

1. The device running the test.
2. The device receiving the request.
3. The response coming back.

Do not assume that a particular phone is always the sender.

---

# 6. Adding a New Test Message

If a test requires a new type of message, give it a unique message type.

For example:

```text
FILE_TEST_REQUEST
FILE_TEST_RESPONSE
```

Do not reuse:

```text
TEST_REQUEST
TEST_RESPONSE
```

for completely different purposes.

This keeps the protocol understandable as CrossDrag grows.

---

# 7. Handling Incoming Test Messages

When a device receives a test message, it should identify the message type and perform the appropriate action.

Conceptually:

```kotlin
when (messageType) {

    "TEST_REQUEST" -> {
        // Existing payload test
    }

    "FILE_TEST_REQUEST" -> {
        // File transfer test
    }

    "RECONNECT_TEST_REQUEST" -> {
        // Reconnection test
    }
}
```

The device should then send an appropriate response if the test requires one.

---

# 8. Reporting the Result

When a test finishes, create a `MagphoneTestResult`.

Example:

```kotlin
MagphoneTestResult(
    name = "File Transfer",
    passed = true,
    message = "1 MB file transferred successfully"
)
```

For a failure:

```kotlin
MagphoneTestResult(
    name = "File Transfer",
    passed = false,
    message = "Received file did not match original"
)
```

The test manager should then update the test results exposed to `CrossDragManager`.

`MainActivity` already listens for:

```kotlin
onTestResultsChanged = { results ->
    testResults = results
}
```

Therefore, **MainActivity should not need to know how the test itself works.**

This is important.

Keep test logic inside the testing system rather than putting it into the UI.

---

# 9. Adding the Test to the Test Suite

Once the individual test works, add it to the main test sequence.

The suite should run tests in a sensible order.

For example:

```text
1. Connection
2. Payload
3. File Transfer
4. Large File Transfer
5. Folder Transfer
```

Tests that depend on an earlier test should come after it.

For example, a file transfer test should not run before the connection has been established.

---

# 10. Test Failure Behaviour

A failed test should produce a result rather than crashing the application.

Prefer:

```kotlin
MagphoneTestResult(
    name = "File Transfer",
    passed = false,
    message = "Transfer timed out after 30 seconds"
)
```

instead of allowing an exception to terminate the test suite.

The test suite should ideally continue testing independent tests after one test fails.

For example:

```text
Connection       ✅ PASS
Payload          ✅ PASS
File Transfer    ❌ FAIL
Reconnect        ✅ PASS
```

This gives much more useful information than:

```text
File Transfer failed
Application stopped
```

---

# 11. Timeouts

Any test that waits for another device should have a timeout.

Never wait forever for a response.

For example:

```text
Send request
      │
      ▼
Wait for response
      │
      ├── Response received → PASS
      │
      └── Timeout → FAIL
```

The timeout should be long enough for slower phones and connections, but short enough that a broken test doesn't hang the entire suite.

---

# 12. Logging

Every test should produce useful Logcat messages.

Use the existing `MagPhoneTest` logging tag.

Example:

```kotlin
Log.d(
    "MagPhoneTest",
    "Starting File Transfer test"
)
```

Then log important stages:

```text
Starting File Transfer test
File transfer request sent
Waiting for response
Response received
File verified
File Transfer: PASS
```

For failures:

```text
File Transfer: FAIL - Received file size was incorrect
```

This makes debugging much easier when a test fails on a physical phone.

---

# 13. Running Tests

To run the test suite:

1. Build and install CrossDrag on both phones.
2. Open CrossDrag on both phones.
3. Connect the two phones.
4. Confirm the handshake completes.
5. Confirm both devices show as connected.
6. Press **Run MagPhone Tests**.
7. Watch the Logcat output.
8. Check the results shown in the application.

The current core test should produce:

```text
Connection: PASS
Payload: PASS
```

---

# 14. Testing on Both Phones

A two-device test should be run with the test initiated from both devices when appropriate.

For example:

```text
Test from Phone A → Phone B
Test from Phone B → Phone A
```

This can expose bugs where the implementation accidentally assumes that one device is always the sender.

For communication features, this is especially important.

---

# 15. Do Not Put Test Logic in `MainActivity`

Avoid doing this:

```kotlin
Button(
    onClick = {

        // Huge test implementation here

    }
)
```

Instead, the button should only trigger the test system.

The intended structure is:

```text
MainActivity
    │
    │ Run tests
    ▼
CrossDragManager
    │
    ▼
MagPhoneTestManager
    │
    ▼
Connection / Payload system
```

This keeps the UI simple and makes the testing system reusable.

---

# 16. When to Add a New Test

Add a test when a new feature introduces behaviour that could break independently.

For example:

### Adding file transfers

Add:

```text
File Transfer
Large File Transfer
Failed File Transfer
```

### Adding folder transfers

Add:

```text
Folder Transfer
Nested Folder Transfer
Empty Folder Transfer
```

### Adding reconnection

Add:

```text
Disconnect Detection
Reconnect
Reconnect After Timeout
```

### Adding multiple devices

Add:

```text
Two Devices
Three Devices
Independent Device Communication
```

Do not add tests just for the sake of having more tests.

Each test should protect a real piece of functionality.

---

# 17. Recommended Test Naming

Use names that describe the behaviour rather than the implementation.

Good:

```text
Connection
Payload
File Transfer
Folder Transfer
Reconnect
Large File Transfer
```

Avoid:

```text
ConnectionManagerTest1
PayloadFunctionTest
Test123
NewTest
```

The names appear directly in the application, so they should make sense to someone who has never opened the source code.

---

# 18. Before Considering a Test Complete

A new test is complete when:

* [ ] It has one clearly defined purpose.
* [ ] It has a unique name.
* [ ] It produces a `MagphoneTestResult`.
* [ ] It reports both success and failure.
* [ ] It has a timeout if it waits for another device.
* [ ] It logs useful information.
* [ ] It does not crash the application on failure.
* [ ] It works when initiated from the appropriate device.
* [ ] It has been tested on real devices.
* [ ] It has been added to the test suite.
* [ ] It does not put unnecessary logic into `MainActivity`.

---

# 19. Current Core Tests

The current CrossDrag core test suite verifies:

### Connection

Confirms that two CrossDrag devices can establish a Nearby Connections connection.

Expected:

```text
Connection: PASS
```

### Payload

Confirms that data can travel in both directions between the two devices.

Expected:

```text
Payload: PASS
```

These tests should be kept permanently because they act as **regression tests**.

Whenever the connection or payload system is changed, run them again.

---

# 20. General Rule

When adding a new CrossDrag feature, ask:

> "What is the smallest test that proves this feature actually works between two real devices?"

Create that test, add it to the MagPhone suite, and keep it permanently.

The test suite should grow alongside CrossDrag rather than being built all at once.
