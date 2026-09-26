# Data Model & Schema Specification

## 1. Output Record: `ShareRecord`

The `ShareRecord` interface defines the normalized schema written to the Apify Dataset.

```typescript
export interface ShareRecord {
  /**
   * The public Facebook post URL provided as input.
   */
  originalPostUrl: string;

  /**
   * Facebook internal feedback identifier corresponding to the post.
   * Example: "ZmVlZGJhY2s6NDkxNDI5MzA3NTUyMzU3Mg=="
   */
  feedbackId?: string | null;

  /**
   * Unique Facebook User ID of the sharer.
   * Example: "100001234567890"
   */
  sharerId?: string | null;

  /**
   * Display name of the sharer.
   * Example: "Bim Bi"
   */
  sharerName?: string | null;

  /**
   * Public profile URL of the sharer.
   * Example: "https://www.facebook.com/profile.php?id=100001234567890"
   */
  sharerProfileUrl?: string | null;

  /**
   * The Facebook Story ID of the reshare.
   */
  shareStoryId?: string | null;

  /**
   * The Facebook Post ID of the reshare.
   * Example: "4914293075523572"
   */
  sharePostId?: string | null;

  /**
   * Canonical permalink of the outer reshare post.
   * Example: "https://facebook.com/example/posts/4914293075523572"
   */
  shareUrl?: string | null;

  /**
   * CANONICAL SHARE TIMESTAMP in Unix seconds.
   * Sourced EXCLUSIVELY from edge.node.creation_time.
   * Example: 1785512929
   */
  sharedAtUnix: number;

  /**
   * Share timestamp formatted as ISO-8601 UTC.
   * Example: "2026-07-31T15:48:49.000Z"
   */
  sharedAtIso: string;

  /**
   * Share timestamp converted to the user's requested IANA timezone.
   * Example: "2026-07-31 22:48:49 GMT+7"
   */
  sharedAtLocal?: string | null;

  /**
   * Stated privacy setting of the share (e.g., "Public").
   */
  visibility?: string | null;

  /**
   * ISO-8601 UTC timestamp recording when this record was scraped.
   */
  scrapedAt: string;
}
```

---

## 2. Share Time vs Original Post Time

| Field | Source | Meaning | Included in Output? |
|---|---|---|---|
| `sharedAtUnix` | `edge.node.creation_time` | The exact second when this user reshared the post | **YES (Primary Field)** |
| Attached Story Time | `edge.node.attached_story.creation_time` | The timestamp when the original post was created | **NO (Explicitly Discarded)** |

> **Crucial Rule**: The attached story timestamp is completely separate and must never be assigned to `sharedAtUnix`.

---

## 3. Deduplication Strategy

A single Facebook user may reshare the same post multiple times over days or weeks. Therefore, deduplication by `sharerId` alone is **strictly prohibited**.

The crawler computes a unique deduplication key per record using the following priority order:

1. **`shareStoryId`**: If present, globally identifies the reshare story.
2. **`sharePostId`**: Outer post ID.
3. **`shareUrl`**: Normalized canonical reshare permalink.
4. **Composite Fallback Key**:
   ```typescript
   `${sharerId ?? 'unknown'}_${sharedAtUnix}_${shareUrl ?? ''}`
   ```

---

## 4. Input Configuration Schema: `ActorInput`

```typescript
export interface ActorInput {
  /**
   * List of target public Facebook post URLs.
   */
  postUrls: string[];

  /**
   * Maximum records to collect per post.
   * Default: 1000
   */
  maxSharesPerPost?: number;

  /**
   * Maximum scroll attempts per post before terminating.
   * Default: 1000
   */
  maxScrollAttempts?: number;

  /**
   * Delay in milliseconds between consecutive scroll actions.
   * Default: 1000
   */
  scrollDelayMs?: number;

  /**
   * IANA timezone for localized timestamp formatting.
   * Default: "Asia/Ho_Chi_Minh"
   */
  timezone?: string;

  /**
   * Toggle verbose diagnostic logs.
   * Default: false
   */
  debug?: boolean;
}
```
