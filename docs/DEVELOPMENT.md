# Development Guide

This guide covers local environment setup, project conventions, scripts, and workflows.

---

## 1. Environment Requirements

- **Node.js**: >= 20.0.0 (Node 24 LTS tested)
- **Package Manager**: npm >= 10.0.0
- **TypeScript**: 5.7+
- **Browser Automation**: Playwright with Chromium dependencies

---

## 2. Directory Layout

```text
facebook-share-time-scraper/
├── .actor/                        # Apify Actor definitions (actor.json, input/dataset schemas)
├── docs/                          # Comprehensive technical documentation
├── src/
│   ├── main.ts                    # Actor entrypoint
│   ├── crawler/                   # Crawlee/Playwright setup & request handler
│   ├── facebook/                  # DOM interaction & selectors
│   ├── graphql/                   # Pure GraphQL parsing & operation identification
│   ├── models/                    # TypeScript interfaces & domain errors
│   ├── utils/                     # Timestamp, deduplication, and logging utilities
│   └── constants.ts               # Shared constants
├── tests/
│   ├── fixtures/graphql/          # Sanitized GraphQL response payloads
│   ├── parseReshares.test.ts      # Parser contract tests
│   ├── timestamp.test.ts          # Timestamp conversion & timezone tests
│   ├── deduplicate.test.ts        # Deduplication priority tests
│   └── graphqlParser.test.ts      # Stream parsing and error resilience tests
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

---

## 3. NPM Scripts

| Command | Action |
|---|---|
| `npm run build` | Compiles TypeScript code from `src/` to `dist/`. |
| `npm test` | Runs the Vitest test suite once against contract tests. |
| `npm run test:watch` | Starts Vitest in interactive watch mode for rapid TDD. |
| `npm run lint` | Performs type verification without emitting JavaScript files. |
| `npm start` | Executes the compiled actor bundle (`dist/main.js`). |

---

## 4. Coding Conventions

1. **Pure GraphQL Logic**:
   Never import Playwright `Page` or browser DOM types into `src/graphql/`. All parsing and transformation logic must operate on plain strings or JSON objects.
2. **Defensive Parsing**:
   Never assume optional fields exist. Use optional chaining (`?.`) and safe default values.
3. **No Console Log**:
   Use `src/utils/logger.ts` for all logging. Avoid `console.log()` to ensure log format consistency and sanitize potential secrets.
4. **Fixture First**:
   When fixing a parser bug or accommodating a Facebook schema change:
   - Capture the response payload.
   - Sanitize all PII (user IDs, personal names).
   - Save it into `tests/fixtures/graphql/`.
   - Write a failing unit test asserting the expected behavior.
   - Implement the fix until the test passes.
