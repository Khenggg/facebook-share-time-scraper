# System Architecture

## Overview

The `facebook-share-time-scraper` Actor operates as an event-driven, passive-network-interception scraper. Instead of reverse-engineering Facebook's dynamic client cryptography and request signing (which frequently break), it leverages a headless Playwright Chromium instance to execute Facebook's official client bundle in an unauthenticated sandbox.

As the browser automates opening and scrolling the "People who shared this" dialog, the network layer captures the resulting GraphQL responses, which are parsed by a standalone schema-normalization engine.

```mermaid
flowchart TD
    subgraph Apify ["Apify Actor Runtime"]
        Main["src/main.ts"] --> CrawlerConfig["src/crawler/createCrawler.ts"]
        CrawlerConfig --> PlaywrightBrowser["Headless Chromium (Logged-out, __user=0)"]
    end

    subgraph Browser ["Browser Automation Layer (src/facebook/)"]
        PlaywrightBrowser --> OpenPost["openPost(url)"]
        OpenPost --> DetectTrigger["openResharesDialog()"]
        DetectTrigger --> LocateDialog["findScrollableDialog()"]
        LocateDialog --> ScrollLoop["scrollReshares() (Lazy-load triggers)"]
    end

    subgraph Network ["Network Interception Layer (src/graphql/)"]
        PlaywrightBrowser -.->|POST /api/graphql/| NetListener["Network Response Interceptor"]
        NetListener --> Identify["identifyOperation() ('CometResharesFeedPaginationQuery')"]
        Identify --> RawPayload["Raw GraphQL Body (JSON / JSON-Lines)"]
    end

    subgraph Normalization ["Data Pipeline (src/graphql/ & src/utils/)"]
        RawPayload --> PureParser["parseReshares() (Pure extraction)"]
        PureParser --> ExactTime["Extract edge.node.creation_time"]
        PureParser --> Sharer["Extract actor identity & post URLs"]
        ExactTime --> Dedupe["deduplicate() (Story ID / Post ID / Compound Key)"]
        Sharer --> Dedupe
        Dedupe --> Record["Normalized ShareRecord"]
    end

    subgraph Storage ["Persistence"]
        Record --> Dataset["Actor.pushData() (Apify Dataset)"]
    end
```

---

## Detailed Component Responsibilities

### 1. Actor Entry & Orchestration (`src/main.ts`, `src/crawler/`)
- Initializes Apify environment and validates input against `ActorInput`.
- Manages Playwright browser lifecycle via Crawlee.
- Enforces logged-out context policies (disabling cookie persistence, clean user-data-dir).
- Handles graceful shutdown and summary reporting.

### 2. Facebook UI Interaction Engine (`src/facebook/`)
- **`selectors.ts`**: Centralized repository of semantic and role-based locators.
- **`openPost.ts`**: Navigates to the Facebook post URL in a clean logged-out context.
- **`dismissLoginModal.ts`**: Detects and dismisses the unauthenticated login modal ("See more on Facebook").
- **`findPostScrollContainer.ts`**: Identifies the post detail dialog or scrollable post feed container.
- **`scrollPostToEngagement.ts`**: Scrolls the post downward until the engagement section is visible.
- **`findReshareTrigger.ts`**: Locates the specific share-count trigger (`X shares` / `X lượt chia sẻ`), avoiding the composer action button.
- **`openResharesDialog.ts`**: Clicks the reshare trigger and waits for the "People who shared this" dialog (`role="dialog"`).
- **`findReshareScrollContainer.ts`**: Locates the inner scrollable container for the reshares feed.
- **`scrollReshares.ts`**: Scrolls the inner reshares container using dynamic element evaluation across React re-renders.

### 3. Network Interceptor & Classifier (`src/graphql/identifyOperation.ts`)
- Hooks into Playwright's `page.on('response', ...)`.
- Filters traffic to `https://www.facebook.com/api/graphql/`.
- Inspects payload headers or friendly name parameter (`CometResharesFeedPaginationQuery`).
- Buffers responses asynchronously to avoid blocking the browser event loop.

### 4. GraphQL Parser & Normalizer (`src/graphql/parseReshares.ts`)
- Decodes JSON and newline-delimited stream responses.
- Traverses `data.node.reshares.edges`.
- Extracts canonical `creation_time` from the outer node.
- Extracts sharer details and URLs with resilient fallbacks.
- Ignores internal attached stories.

### 5. Utilities & Deduplication (`src/utils/`)
- **`timestamp.ts`**: Converts Unix seconds to ISO-8601 UTC and localized string timestamps.
- **`deduplicate.ts`**: Maintains an in-memory Set of seen identifiers, prioritizing `shareStoryId` > `sharePostId` > `shareUrl` > compound key.
- **`logger.ts`**: Structured contextual logger with sensitive credential sanitization.

### 6. Hybrid Direct GraphQL Engine (`src/graphql/captureRequestTemplate.ts`, `src/graphql/replayPagination.ts`)
- **`captureRequestTemplate.ts`**: Captures real unauthenticated `CometResharesFeedPaginationQuery` POST form data emitted by the browser, preserving signed tokens in memory without hardcoding or logging. Provides `cloneRequestWithCursor` to immutably replace `variables.cursor` with next cursors.
- **`replayPaginationRequest.ts`**: Dispatches subsequent pagination requests directly via `page.evaluate(window.fetch)` inside the active browser context. Achieves sub-second page retrieval with zero DOM scrolling, immune to DOM re-renders or virtual scroll staleness. Includes `CursorLoopDetector` to prevent pagination loops.

### 7. Session Isolation & Comparison Engine (`src/facebook/session/`, `src/comparison/`)
- **`cookieValidator.ts`**: Validates Playwright cookie arrays safely, enforcing domains and names while never logging sensitive token values.
- **`createAnonymousContext.ts` / `createAuthenticatedContext.ts`**: Builds completely isolated browser contexts without cross-contamination.
- **`verifyFacebookSession.ts`**: Validates active session state, masks user ID (e.g. `****1234`), and throws `AUTH_SESSION_INVALID` upon expired cookies.
- **`compareShareSets.ts`**: Computes mathematical overlap, union, anonymous-only, authenticated-only records, and Jaccard similarity between two execution passes.

