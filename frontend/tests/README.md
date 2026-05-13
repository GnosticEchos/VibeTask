# Tests

- **Unit / component:** `npm run test:unit` (Vitest, happy-dom, no backend required)
- **Coverage:** `npm run test:coverage`

Unit and component tests mock the API; no real server or login is needed.

For **local or E2E runs against a real backend**, copy `.env.test.example` to `.env.test` and set the test user (see that file). Use that account for manual or Playwright login if needed.
