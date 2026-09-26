# Scraper Limitations & Known Constraints

## 1. Facebook Server-Side Soft Caps
- **Public Feed Truncation**: For unauthenticated (`__user = 0`) sessions, Facebook's GraphQL server often imposes a soft cap (typically ~100–300 reshares) on public lists to mitigate mass-scraping, even if the post header states thousands of total shares.
- **Counter Disparity**: The total counter displayed on a post (e.g. "2.1k shares") includes private shares (Friends Only, Only Me, Secret Groups, Messenger). These non-public shares are fundamentally inaccessible to unauthenticated visitors and will not appear in the "People who shared this" feed.

## 2. Authenticated Session Boundaries
- **Account-Visible, Not Global**: An authenticated session only views what the specific authenticated Facebook account is permitted to see by Facebook's audience settings. It does not provide access to private shares of users outside the account's social network.
- **Session Expiration & Checkpoints**: Facebook cookies frequently expire or trigger captive challenge checkpoints if used across differing IP addresses or geo-locations.
- **No Login Automation**: This scraper strictly avoids automated credential logins (username/password submission, 2FA bypass) to adhere to safety policies and prevent account compromise.

## 3. UI and Virtualization Constraints
- **Modal DOM Virtualization**: When scrolling through long reshare lists via pure UI actions, React unmounts distant DOM nodes, leading to potential DOM thrashing. The Hybrid Direct GraphQL Replay architecture bypasses this by executing network fetch calls directly within the active browser session.
- **Doc ID Churn**: Facebook rotates GraphQL query `doc_id` hashes across frontend deployments. Hardcoding query document IDs is forbidden; queries must always be identified by `fb_api_req_friendly_name = CometResharesFeedPaginationQuery`.

## 4. Sharer Identity Redaction
- If a user shares a post publicly but has configured their profile with strict visibility limits (e.g., Profile Lock), Facebook's GraphQL payload may redact their name, returning an anonymous placeholder or omitting the user node.
