# Troubleshooting & Diagnostic Guide

This guide details resolutions for common operational errors and debugging techniques.

---

## 1. Error Codes & Resolutions

### `POST_NOT_PUBLIC`
- **Cause**: The target post was published with a restricted audience ("Friends", "Group members only", or deleted).
- **Resolution**: Verify that the post URL is visible in an unauthenticated incognito browser window. If an unavoidable login page is returned, the post cannot be scraped logged-out.

### `POST_NOT_FOUND`
- **Cause**: The URL is malformed, points to a nonexistent post, or was removed by Facebook.
- **Resolution**: Check the input URL format. Canonical URLs typically follow `https://www.facebook.com/<page>/posts/<id>` or `https://www.facebook.com/<id>`.

### `RESHARE_TRIGGER_NOT_FOUND`
- **Cause**: The post has zero public reshares, or Facebook changed the DOM structure of the share counter button.
- **Resolution**: 
  1. Open the post manually in an incognito window. Check if a clickable "X shares" button exists.
  2. If the button exists but the scraper fails to find it, review and update selectors in `src/facebook/selectors.ts`.

### `RESHARE_DIALOG_NOT_OPENED`
- **Cause**: Clicking the share counter button failed to render the dialog modal (`role="dialog"`), or a transient overlay blocked the click.
- **Resolution**: Enable `debug: true` in the input to review browser screenshots and DOM inspection traces.

### `GRAPHQL_RESPONSE_NOT_FOUND`
- **Cause**: Scrolling the dialog did not trigger the expected `CometResharesFeedPaginationQuery` network request.
- **Resolution**:
  1. Verify whether the scroll container element was correctly targeted (see `src/facebook/findScrollableDialog.ts`).
  2. Check if all available public reshares were already loaded on the initial render.

### `FACEBOOK_SCHEMA_CHANGED`
- **Cause**: Facebook altered the JSON path in `reshares.edges` or changed the node payload structure.
- **Resolution**: Inspect the raw GraphQL response in debug mode. Compare against `docs/FACEBOOK_REVERSE_ENGINEERING.md` and update `src/graphql/parseReshares.ts`.

### `PAGINATION_STALLED`
- **Cause**: Consecutive scroll actions yielded no new reshare records even though `has_next_page` was true.
- **Resolution**: Increase `scrollDelayMs` (e.g. from 1000 to 2000 ms) to give Facebook frontend more time to execute network queries before the next scroll.

### `RATE_LIMITED` / `FACEBOOK_BLOCKED`
- **Cause**: Facebook detected automated scraping patterns and presented an IP-level rate limit or CAPTCHA.
- **Resolution**: Use residential proxies and increase scroll delays.

---

## 2. Debugging Techniques

### Enabling Debug Mode
Set `"debug": true` in the Actor Input. This enables:
- Verbose logging of network URLs and response status codes.
- Diagnostic logs of dialog detection and scroll container coordinates.
- Reporting of edge count increments and deduplication metrics per scroll.

> **Privacy Guarantee**: Even in debug mode, request headers, cookies, and authentication tokens are strictly stripped and never logged.
