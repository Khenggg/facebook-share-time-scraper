import { ShareRecord } from '../models/shareRecord.js';

/**
 * Computes a unique deduplication key for a ShareRecord based on hierarchical priority:
 * 1. shareStoryId
 * 2. sharePostId
 * 3. shareUrl
 * 4. Compound key: `${sharerId}_${sharedAtUnix}_${shareUrl}`
 *
 * NOTE: Never deduplicate on sharerId alone, because a single user can reshare a post multiple times.
 */
export function computeDeduplicationKey(record: ShareRecord): string {
  if (record.shareStoryId && record.shareStoryId.trim() !== '') {
    return `story:${record.shareStoryId.trim()}`;
  }
  if (record.sharePostId && record.sharePostId.trim() !== '') {
    return `post:${record.sharePostId.trim()}`;
  }
  if (record.shareUrl && record.shareUrl.trim() !== '') {
    return `url:${record.shareUrl.trim()}`;
  }
  const sharer = record.sharerId ?? 'unknown_user';
  const time = record.sharedAtUnix;
  const url = record.shareUrl ?? 'no_url';
  return `compound:${sharer}_${time}_${url}`;
}

/**
 * Filter manager to track and filter duplicate ShareRecords in memory.
 */
export class DeduplicationFilter {
  private readonly seenKeys = new Set<string>();

  /**
   * Evaluates if a record is new. If new, stores its key and returns true.
   * If already seen, returns false.
   */
  public isNewRecord(record: ShareRecord): boolean {
    const key = computeDeduplicationKey(record);
    if (this.seenKeys.has(key)) {
      return false;
    }
    this.seenKeys.add(key);
    return true;
  }

  /**
   * Filters an array of ShareRecords, returning only records that haven't been seen yet.
   */
  public filterBatch(records: ShareRecord[]): ShareRecord[] {
    return records.filter((r) => this.isNewRecord(r));
  }

  /**
   * Returns current count of unique records tracked.
   */
  public get size(): number {
    return this.seenKeys.size;
  }

  /**
   * Clears tracked keys (e.g. when beginning a new post).
   */
  public clear(): void {
    this.seenKeys.clear();
  }
}
