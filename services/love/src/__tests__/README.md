# Tests for love service

This directory contains tests for the love service, which manages meeting functionality.

## Test Structure

All tests are in `src/__tests__/` directory:

### Unit Tests

| File | Description |
|------|-------------|
| **webhook.test.ts** | Tests for webhook event processing |
| **utils.test.ts** | Utility function tests |
| **edge-cases.test.ts** | Edge cases and boundary conditions |

### Test Helpers

| File | Description |
|------|-------------|
| **test-helpers.ts** | Shared test utilities and fixtures |
| **README.md** | This documentation

## Running Tests

```bash
# Run all tests
rushx test

# Run with coverage
rushx test --coverage

# Run specific test file
npx jest webhook.test.ts

# Run in watch mode
npx jest --watch
```

## Test Coverage Areas

### Meeting Lifecycle
1. **Activation** - Meeting becomes Active when room starts
2. **Participants** - ParticipantInfo created/updated when participants join/leave
3. **Completion** - Meeting marked as Finished when room ends

### Error Handling
- Missing meetings
- Missing roomId
- WorkspaceClient connection failures

### Edge Cases
- Meeting without roomId
- Rapid join/leave sequences
- AI participants without sessionId

## Test Helpers

- **test-helpers.ts** - Shared test utilities:
  - `TEST_IDS` - Common test IDs
  - `TEST_TIMESTAMPS` - Timestamp constants
  - `createMockContext()` - Mock MeasureContext factory
  - `createMockMeeting()` - MeetingMinutes factory
  - `createMockParticipant()` - ParticipantInfo factory
  - `createMockRoom()` - Room factory
  - `TEST_SCENARIOS` - Common test scenarios

Use these helpers to ensure consistency across tests.

## Mocking Strategy

Tests use Jest mocks for:
- `RestClient` (API client)
- `WorkspaceClient.create()`
- `@hcengineering/server-token`

This allows testing without actual database or LiveKit connections.

## Adding New Tests

When adding features to the love service:

1. Add unit tests for new methods in appropriate test files
2. Add webhook tests in `webhook.test.ts` if new events are handled
3. Add integration tests for complex scenarios
4. Update this README with new test coverage areas
