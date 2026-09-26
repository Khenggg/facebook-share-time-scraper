# Known Limitations & Constraints

This document details inherent technical and platform limitations governing the `facebook-share-time-scraper`.

---

## 1. Scope of Scraped Data

- **Public Reshares Only**: The scraper is exclusively capable of extracting public reshares that Facebook serves to unauthenticated users.
- **Private & Friends-Only Shares Inaccessible**: If a Facebook user shares a post to "Friends", "Friends except...", "Custom", "Only Me", or via direct Messenger / WhatsApp / Instagram messages, Facebook enforces strict backend access controls. These reshares will never appear in the public "People who shared this" feed and are completely invisible in logged-out mode.
- **Counter Discrepancy**: The total share count displayed on a Facebook post (e.g. "1,420 shares") counts **all** reshares (including private and message shares). Consequently, the total number of records the scraper can extract will frequently be lower than the displayed counter.

---

## 2. Platform & Anti-Bot Constraints

- **Visible Listing Cap**: Facebook frequently imposes an arbitrary server-side cap on the number of visible public items in the reshares dialog (often capping at ~200 to 2,000 items depending on IP location and traffic). Once Facebook stops returning new edges in `CometResharesFeedPaginationQuery`, pagination terminates.
- **Rate Limiting & IP Challenges**: Frequent automated requests from known datacenter IP ranges may trigger Facebook's CAPTCHA or temporary IP blocking. Mitigated in production via clean residential/datacenter proxies and human-like scroll delays.
- **Ephemeral Login Banners**: Facebook periodically alters unauthenticated splash screens and login walls. While the crawler dismisses known variants, drastic redesigns of the logged-out wall require selector updates.

---

## 3. Schema & Frontend Evolution

- **Volatile DOM Structure**: Facebook's web client uses atomic CSS with auto-generated class names (e.g. `.x1lliihq`). The scraper prioritizes accessible roles, ARIA attributes, and structural proximity over obfuscated classes, but major UI overhauls may require maintenance in `src/facebook/selectors.ts`.
- **GraphQL Schema Drift**: While `edge.node.creation_time` has remained stable, auxiliary fields like `actors[0].profile_url` or nested permalinks may drift. The parser incorporates safe fallback resolution to safeguard against schema mutations.
