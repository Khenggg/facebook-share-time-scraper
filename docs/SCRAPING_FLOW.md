# Scraping Lifecycle & Execution Flow

This document details the exact runtime lifecycle of the `facebook-share-time-scraper`.

---

## 1. Sequence Diagram

```mermaid
sequenceDiagram
    autonumber
    actor User as Apify Runner
    participant Main as src/main.ts
    participant Browser as Playwright Page
    participant DOM as Facebook DOM
    participant Network as Network Interceptor
    participant Parser as GraphQL Parser
    participant Storage as Apify Dataset

    User->>Main: Provide ActorInput (postUrls, maxShares, etc.)
    Main->>Browser: Launch Chromium (Fresh incognito, __user=0)
    
    loop For each post URL
        Main->>Browser: page.goto(postUrl)
        Browser->>DOM: Load public post view
        Main->>Browser: Attach network listener for /api/graphql/
        Main->>DOM: Dismiss login prompts / cookie popups if present
        
        Main->>DOM: Locate reshare trigger (e.g. "X shares" / "X lượt chia sẻ")
        alt Reshare trigger found
            Main->>DOM: Click reshare trigger
            DOM->>DOM: Render reshare dialog modal (role="dialog")
        else Trigger missing
            Main->>Main: Emit RESHARE_TRIGGER_NOT_FOUND error
        end

        Main->>DOM: Identify internal scroll container
        
        loop Scroll & Paginate
            Main->>DOM: Scroll container downward
            DOM->>Browser: Dispatch GraphQL request (RelayModern, CometResharesFeedPaginationQuery)
            Browser-->>Network: Response received (/api/graphql/)
            Network->>Parser: Send raw response payload
            Parser->>Parser: Validate friendly name
            Parser->>Parser: Extract edges[].node.creation_time
            Parser->>Parser: Extract actor identity & post URLs
            Parser->>Main: Return parsed ShareRecords + PageInfo
            Main->>Storage: Deduplicate & push new ShareRecords
            
            alt Stop condition met
                Note over Main: Stop conditions:<br/>1. has_next_page == false<br/>2. maxSharesPerPost reached<br/>3. maxScrollAttempts reached<br/>4. Stalled consecutive attempts
            end
        end
        Main->>Browser: Close page / cleanup listeners
    end

    Main->>User: Actor complete (Dataset populated)
```

---

## 2. Step-by-Step Breakdown

### Step 1: Context Initialization
- Launch unauthenticated Chromium context.
- Ensure no persistent cookies, local storage, or cached credentials exist.

### Step 2: Post Navigation & Wall Handling
- Navigate directly to the Facebook post URL.
- Wait for the post container to mount.
- If Facebook presents a full-screen login barrier or modal dialog, attempt to close or bypass it using non-destructive selectors.

### Step 3: Triggering Reshares Modal
- Inspect the post footer for the share count element.
- Click the element to open the "People who shared this" dialog (`role="dialog"`).
- Wait for the dialog container to render.

### Step 4: Network Interception Activation
- Playwright's `page.on('response')` catches all POST requests to `https://www.facebook.com/api/graphql/`.
- Inspect the request body to verify:
  ```text
  fb_api_req_friendly_name = CometResharesFeedPaginationQuery
  ```

### Step 5: Lazy Loading via Scoped Scrolling
- Retrieve the bounding element of the reshares scroll list inside the dialog.
- Perform gradual scroll actions (`element.scrollTop += delta`).
- Introduce a configurable throttle (`scrollDelayMs`) to allow Facebook frontend to dispatch subsequent queries.

### Step 6: Response Parsing & Canonical Extraction
- Intercepted GraphQL chunks are decoded.
- Each edge's `edge.node.creation_time` is extracted as the canonical share timestamp.
- Any nested `attached_story.creation_time` is strictly ignored.
- The actor's profile details and permalink are parsed.

### Step 7: Deduplication & Pushing Data
- Compute the deduplication key.
- Discard already seen keys.
- Call `Actor.pushData(record)` for all new unique records.

### Step 8: Multi-Signal Termination
The crawler terminates pagination for a post when any of the following occur:
1. **`has_next_page === false`**: Facebook indicates no further public reshares exist.
2. **`totalCollected >= maxSharesPerPost`**: User-configured quota met.
3. **`scrollAttempts >= maxScrollAttempts`**: Hard limit reached to prevent infinite scrolling.
4. **`consecutiveEmptyAttempts >= threshold`**: Scroll actions no longer trigger queries or yield new items (stalled pagination).
