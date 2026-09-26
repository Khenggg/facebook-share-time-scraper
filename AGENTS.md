# AGENTS.md - Instructions for Autonomous AI Engineers

This document governs the operational and architectural rules for any AI agent working on the `facebook-share-time-scraper` repository.

---

## 1. Prime Directives

1. **Read `PROJECT_CONTEXT.md` First**: Before writing, modifying, or refactoring any code in this repository, thoroughly read [PROJECT_CONTEXT.md](file:///d:/facebook-share-time-scraper/PROJECT_CONTEXT.md). It is the authoritative ground truth for reverse-engineered facts.
2. **Canonical Share Time is Immutable Without Evidence**:
   The primary timestamp of when a user reshared a post is strictly located at:
   ```typescript
   edge.node.creation_time
   ```
   **NEVER** change this extraction path to use `edge.node.attached_story.creation_time` or any recursive fallback that grabs the original post's timestamp.
3. **No Authentication or Credentials**:
   - Do **NOT** add Facebook login flows, credentials, email/password fields, account pools, or authenticated cookies.
   - The entire architecture depends on unauthenticated public access (`__user = 0`).
4. **Zero Sensitive Data Logging**:
   - Do **NOT** log or store request cookies, `lsd` tokens, `fb_dtsg` tokens, session IDs, or sensitive authorization headers.
   - All diagnostic logs in `debug` mode must sanitize headers and URL query parameters.
5. **No Hardcoded `doc_id` Assumptions**:
   - Facebook regenerates query doc IDs across deployments. The crawler must identify operations via friendly name:
     `fb_api_req_friendly_name = CometResharesFeedPaginationQuery`
   - Do not make the crawler fail because a `doc_id` changed.

---

## 2. Modularity & Separation of Concerns

Keep the architecture decoupled into strictly isolated layers:

```
src/
├── facebook/   <-- UI Automation & DOM Selectors ONLY (Playwright handles clicks/scrolls)
├── graphql/    <-- Pure GraphQL Parsing & Normalization ONLY (Pure TypeScript, NO DOM)
├── crawler/    <-- Crawlee/Playwright lifecycle orchestration
├── models/     <-- TypeScript contracts and type definitions
└── utils/      <-- Deduplication, timestamps, logging utilities
```

- **Rule**: DOM selectors must remain strictly inside `src/facebook/selectors.ts`. Never inline DOM selectors into crawler loops or GraphQL parsers.
- **Rule**: GraphQL parsing must remain purely functional. It must take raw strings or JSON objects and output normalized records, without any reliance on Playwright Page objects.

---

## 3. Testing Discipline

Whenever touching `src/graphql/`:
1. Always update or add a sanitized fixture in `tests/fixtures/graphql/`.
2. Ensure `npm test` runs and passes all contract tests.
3. Verify that the test explicitly asserts:
   ```typescript
   expect(record.sharedAtUnix).toBe(expectedShareTime);
   expect(record.sharedAtUnix).not.toBe(attachedOriginalStoryTime);
   ```

---

## 4. Error Handling Standards

Use typed domain error codes from `src/models/errors.ts`:
- `POST_NOT_PUBLIC`: Post cannot be accessed without login.
- `POST_NOT_FOUND`: Post URL returned 404 or removed.
- `RESHARE_TRIGGER_NOT_FOUND`: Unable to locate share count button on DOM.
- `RESHARE_DIALOG_NOT_OPENED`: Reshares modal did not appear after click.
- `GRAPHQL_RESPONSE_NOT_FOUND`: No pagination query detected during scrolling.
- `FACEBOOK_SCHEMA_CHANGED`: GraphQL payload structure diverges from contract.
- `PAGINATION_STALLED`: Consecutive scrolls produced no new edges or network requests.
- `RATE_LIMITED`: Facebook triggered anti-bot rate-limiting or captive challenge.
- `MAX_SHARES_REACHED`: Desired share quota fulfilled.

All error messages must provide actionable debugging context.
