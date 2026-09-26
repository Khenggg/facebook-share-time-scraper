/**
 * Canonical normalized output record representing a single public reshare event.
 */
export interface ShareRecord {
  /**
   * The original public post URL that was scraped.
   */
  originalPostUrl: string;

  /**
   * Facebook internal feedback identifier if present.
   */
  feedbackId?: string | null;

  /**
   * Facebook user ID of the person who reshared.
   */
  sharerId?: string | null;

  /**
   * Display name of the sharer.
   */
  sharerName?: string | null;

  /**
   * Profile URL of the sharer.
   */
  sharerProfileUrl?: string | null;

  /**
   * GraphQL Story ID of the outer reshare.
   */
  shareStoryId?: string | null;

  /**
   * Post ID of the outer reshare.
   */
  sharePostId?: string | null;

  /**
   * Canonical permalink of the outer reshare post.
   */
  shareUrl?: string | null;

  /**
   * CANONICAL SHARE TIMESTAMP in Unix seconds.
   * Extracted exclusively from edge.node.creation_time.
   */
  sharedAtUnix: number;

  /**
   * Share timestamp formatted as ISO-8601 UTC string.
   */
  sharedAtIso: string;

  /**
   * Share timestamp formatted in the user-specified local timezone.
   */
  sharedAtLocal?: string | null;

  /**
   * Visibility or privacy description if present.
   */
  visibility?: string | null;

  /**
   * ISO-8601 UTC timestamp recording when this record was scraped.
   */
  scrapedAt: string;
}
