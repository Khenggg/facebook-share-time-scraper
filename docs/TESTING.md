# Testing Strategy & Verification Guide

A reliable test suite for a Facebook scraper must insulate critical business logic (data normalization, canonical timestamp parsing, deduplication) from Facebook's live network volatility.

---

## 1. Test Tier Hierarchy

```
┌──────────────────────────────────────────────────────────┐
│                   Live Smoke Tests                       │ (Manual / CI nightly)
│  - Real public Facebook post                             │
│  - Headless Chromium verification                        │
└────────────────────────────┬─────────────────────────────┘
                             │
              ┌──────────────▼──────────────┐
              │      Integration Tests      │ (Fast, hermetic)
              │  - Multiple edges           │
              │  - Pagination transitions   │
              │  - Stream batch responses   │
              └──────────────┬──────────────┘
                             │
              ┌──────────────▼──────────────┐
              │         Unit Tests          │ (Sub-second execution)
              │  - Canonical timestamp test │
              │  - Attached story rejection │
              │  - Deduplication priorities │
              │  - Timezone conversions     │
              └─────────────────────────────┘
```

---

## 2. Unit Testing Strategy

### 2.1 Canonical Timestamp Verification
The core contract of this actor is guaranteeing that:
$$\texttt{record.sharedAtUnix} == \texttt{edge.node.creation\_time} \neq \texttt{edge.node.attached\_story.creation\_time}$$

Unit tests in `tests/parseReshares.test.ts` load sanitized fixtures and verify this contract explicitly.

### 2.2 Deduplication Priority Test
Tests in `tests/deduplicate.test.ts` verify:
1. Two records with identical `shareStoryId` are deduplicated.
2. Two records with identical `sharePostId` are deduplicated.
3. Two records with identical `shareUrl` are deduplicated.
4. Two records with identical `sharerId` but different timestamps are **NOT** discarded (same user sharing multiple times).
5. Compound keys correctly distinguish ambiguous cases.

### 2.3 Timestamp & Timezone Formatting
Tests in `tests/timestamp.test.ts` verify:
- Accurate conversion from Unix seconds to ISO-8601 UTC string.
- Handling of leap seconds and timezone shifts.
- Correct rendering for target timezones (e.g. `Asia/Ho_Chi_Minh`, `America/New_York`).

---

## 3. Hermetic Integration Tests

Using full offline response fixtures:
- `tests/fixtures/graphql/cometResharesResponse.json`: Validates single-edge extraction with attached original story.
- `tests/fixtures/graphql/cometResharesResponseMultiple.json`: Validates multi-edge extraction, partial metadata, null actor names, and cursor progression.

---

## 4. Live Smoke Testing Protocol

Live smoke tests run against designated public post URLs in an isolated test script.

**Pre-conditions**:
- Incognito / unauthenticated context (`__user = 0`).
- No Facebook cookies.

**Assertions**:
- Reshare button found.
- Modal opens.
- At least one `CometResharesFeedPaginationQuery` response intercepted.
- At least one valid `ShareRecord` generated with `sharedAtUnix > 0`.

---

## 5. Hybrid Pagination Live Experiment Protocol

Run Phase 1.5 hybrid direct replay experiment:

```bash
npm run experiment:hybrid -- <facebook-post-url>
```

**Assertions Verified**:
1. Captures valid `CometResharesFeedPaginationQuery` request template after exactly one scroll.
2. Extracts `end_cursor` from the initial response.
3. Successfully replays the request in browser context via `page.evaluate(window.fetch)` without scrolling.
4. Replayed response returns HTTP 200 and genuinely new `ShareRecord` items.
5. Multi-page loop advances through subsequent cursors until `has_next_page === false`.
6. Zero sensitive tokens, passwords, or cookies are logged or persisted.

---

## 6. Phase 2 Anonymous vs Authenticated Comparison Testing

Run the comparison experiment runner:
```bash
npm run experiment:auth-compare -- \
  --url "<facebook-post-url>" \
  --cookies "./secrets/facebook-cookies.json" \
  --maxShares 1000 \
  --maxTime 120
```

**Assertions Verified**:
1. Cookie validation safely checks array of objects (`name`, `value`, `domain`) without logging values.
2. Session verification checks `c_user` + `xs`, masks account ID (e.g. `****1234`), and rejects invalid cookies.
3. Both modes run in strictly isolated browser contexts without cross-contamination.
4. Sets are mathematically compared for overlap, union, anonymous-only, authenticated-only, and Jaccard similarity.
5. Outputs sanitized `artifacts/comparison-report.json` and `artifacts/comparison-diff.csv`.

