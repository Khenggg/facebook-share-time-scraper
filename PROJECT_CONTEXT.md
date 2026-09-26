# PROJECT_CONTEXT.md

## 1. Project Overview & Problem Statement

**Facebook Public Reshare Time Scraper** is an Apify Actor engineered to scrape public reshares of any given Facebook public post URL. 

### Core Problem Solved
When analyzing viral distribution, disinformation cascades, PR crises, or organic post amplification on Facebook, knowing **exact chronological share timestamps** is essential. However:
1. The Facebook web UI displays relative human strings (`"5d"`, `"31 July"`, `"2 hrs ago"`) which lack exact seconds, omit years for recent dates, and are prone to browser timezone distortion.
2. Logged-in Facebook users clicking the "Share" count or button often get trapped in the Share Composer dialog rather than viewing "People who shared this".
3. Private or friends-only reshares are intentionally inaccessible; attempting to authenticate accounts leads to checkpoint bans, cookie invalidation, and compliance violations.

### Solution
This project operates entirely in **LOGGED-OUT mode** (`__user = 0`), opens the public post, triggers the native "People who shared this" dialog, and intercepts the Facebook frontend's Relay GraphQL pagination queries (`CometResharesFeedPaginationQuery`). The crawler extracts the **exact Unix timestamp** (`creation_time`) directly from the outer reshare GraphQL response, converts it to ISO/local formats, deduplicates entries, and outputs structured records to the Apify Dataset.

---

## 2. Reverse-Engineering Facts vs Assumptions vs Unknowns

### 2.1 Confirmed Facts (Observed via Chrome DevTools - September 2026)
- **Logged-Out Execution**: When an incognito/logged-out browser accesses a public Facebook post, it can view the "People who shared this" dialog without authentication (`__user=0` in payload).
- **GraphQL Endpoint**: The Facebook frontend posts to `https://www.facebook.com/api/graphql/`.
- **Query Classification**: Pagination is powered by Relay Modern:
  - `fb_api_caller_class = RelayModern`
  - `fb_api_req_friendly_name = CometResharesFeedPaginationQuery`
- **Canonical Share Time Source**:
  $$\text{Share Timestamp} = \texttt{data.node.reshares.edges[i].node.creation_time}$$
  This is an exact Unix timestamp in seconds (e.g., `1785512929`).
- **Critical Structural Distinction (Outer Story vs Attached Story)**:
  ```text
  reshares.edges[i].node
  │
  ├── creation_time ───────► [CANONICAL SHARE TIMESTAMP] (e.g. 1785512929)
  │
  ├── post_id ─────────────► Outer reshare post ID
  ├── permalink_url ───────► Outer reshare permalink
  │
  └── attached_story ──────► [ATTACHED ORIGINAL POST]
          └── creation_time ─► [ORIGINAL POST TIMESTAMP] (e.g. 1753949084) - DO NOT USE!
  ```
- **Two Distinct Scroll Phases (Confirmed Logged-Out UI Flow)**:
  1. **Phase A (Post Scroll)**:
     - Facebook may present an initial unauthenticated Login Modal over the post. This is **EXPECTED behavior** and is NOT considered `FACEBOOK_BLOCKED`. The crawler dismisses it via its close button.
     - Facebook displays the post inside a post-detail dialog/container. The engagement section (like/comment/share counts) is located further down.
     - The crawler must first scroll the **POST CONTAINER** downward until the share count trigger (`X shares` / `X lượt chia sẻ`) becomes visible, strictly distinguishing it from the `Share` action button.
  2. **Phase B (Reshare Scroll)**:
     - Clicking the share count trigger opens the separate **"People who shared this"** modal dialog.
     - This creates a **SECOND scrollable container** (`Reshare Scroll Container`).
     - Scrolling this inner container triggers `CometResharesFeedPaginationQuery` GraphQL responses.
     - The crawler must NEVER reuse the post container finder blindly for both phases.

### 2.2 Assumptions (Valid for Current Implementation)
- As long as the post is publicly accessible, Facebook allows unauthenticated browsers to read public reshares up to Facebook's internal public listing cap.
- Triggering the reshares listing from the UI requires finding an anchor/button whose accessible text or structure corresponds to the share count (e.g. `X shares` or `X lượt chia sẻ`).
- Network responses may be delivered as a single JSON object or newline-delimited JSON chunks (Relay batch / defer format).

### 2.3 Unknowns & Volatility Points
- **`doc_id` Longevity**: A documented query ID observed was `28947339021537955`. **DO NOT hardcode this doc_id**; Facebook rotates query doc IDs across weekly frontend builds. Intercepting response by friendly name is vastly more robust.
- **Maximum Visible Shares Cap**: Facebook often caps the visible public reshares list (e.g. 200–2,000 items) regardless of the total counter displayed on the post.
- **Sharer Identity Redaction**: If a user shared a post publicly but their profile has strict public visibility restrictions, Facebook may omit `name` or return an anonymous user placeholder.

---

## 3. Architecture Decisions

1. **Passive Interception over Direct HTTP Replay**:
   Instead of forging signed GraphQL requests (which require fragile parameters like `fb_dtsg`, `lsd`, dynamic `doc_id`, internal session hashes), the scraper drives a real Chromium instance via Playwright. Facebook's own JavaScript client handles crypto, tokens, and pagination calls; our crawler simply listens to network responses.
2. **Strict Separation of Concerns**:
   - `src/facebook/`: DOM interactions and selectors. If Facebook changes its CSS or DOM layout, changes are isolated here.
   - `src/graphql/`: Pure response parsing, validation, and normalization. Zero DOM or browser dependencies. Can be tested 100% offline with recorded fixtures.
   - `src/crawler/`: Orchestration, Playwright context setup, event routing, Apify dataset persistence.
3. **No Auth / Zero Sensitive Data**:
   No credentials, cookies, tokens, or session pools are stored, logged, or needed.

---

## 4. Key Terminology

| Term | Definition |
|---|---|
| **Outer Reshare Story** | The new post created when a user shares an existing post. Represented by `edge.node`. |
| **Attached Story** | The original embedded post inside the reshare. Represented by `edge.node.attached_story`. |
| **`creation_time`** | Unix timestamp (in seconds) stored at `edge.node.creation_time` indicating when the reshare happened. |
| **`CometResharesFeedPaginationQuery`** | The Facebook GraphQL query responsible for fetching the next slice of reshares. |
| **Logged-Out State** | Browser session without cookies or credentials, operating with `__user = 0`. |
| **Compound Deduplication Key** | Fallback unique identifier: `sharerId + sharedAtUnix + shareUrl`. |
| **Hybrid Direct Replay** | Capturing real browser pagination request template and paginating via browser-context `fetch` with new cursors without UI scrolling. |

---

## 5. Phase 1.5 Hybrid Pagination Findings

### 5.1 Confirmed Facts (Live Experimentally Proven)
- **Direct Cursor Pagination Works**: After the browser triggers the first `CometResharesFeedPaginationQuery` via a single scroll, replaying the exact request body inside the browser context via `page.evaluate(window.fetch)` with only `variables.cursor = end_cursor` successfully returns the next page of reshares.
- **Zero Further UI Scrolling Required**: Consecutive pages (Page 2, Page 3, Page 4) can be retrieved via direct cursor replay without dispatching any additional scroll events or manipulating the DOM.
- **Canonical Share Time Invariant Preserved**: Replayed responses return `data.node.reshares.edges[i].node.creation_time` with the identical second-precision timestamp structure as standard UI-scrolled responses.
- **End-of-Feed Signal**: Replay cleanly signals `page_info.has_next_page = false` when all public reshares have been retrieved.

### 5.2 Inferred Architecture
- **Production Pipeline**:
  `Browser Bootstrap -> Single UI Scroll -> Capture Request Template -> Direct Browser-Context Cursor Replay Loop -> Dataset`.
  Fallback to UI-scroll mode if direct replay fails or returns unexpected schemas.

### 5.3 Unknowns & Volatility Points
- **Template Lifespan**: Request templates (with dynamic `lsd`, `doc_id`, `__spin_*`) are only guaranteed valid for the current browser session.
- **Count Override Clamping**: Facebook's unauthenticated backend clamps or ignores attempts to arbitrarily increase `variables.count` beyond standard page sizes.
- **Rate-Limiting**: High-concurrency direct fetches without delay may trigger unauthenticated rate limits faster than natural human-paced scrolling.

---

## 6. Phase 2 Anonymous vs Cookie-Authenticated Comparison

### 6.1 Purpose
Quantify the concrete differences between scraping a public post via an unauthenticated session (`__user=0`) versus a cookie-authenticated session using valid test credentials.

### 6.2 Key Semantics
- **Anonymous Session**: Represents public, logged-out web indexability.
- **Authenticated Session**: Represents **account-visible** reshares for that specific user identity, not the entire global private reshare universe.
- **Comparison Engine**: Uses deterministic canonical share identity (`shareStoryId` -> `sharePostId` -> `shareUrl` -> compound fallback) to measure overlap, anonymous-only records, authenticated-only records, unique sharers, and Jaccard similarity index.
