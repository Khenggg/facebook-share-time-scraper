import { describe, it, expect, beforeEach } from 'vitest';
import { ShareRecord } from '../src/models/shareRecord.js';
import { computeDeduplicationKey, DeduplicationFilter } from '../src/utils/deduplicate.js';

describe('Deduplication Utilities', () => {
  let filter: DeduplicationFilter;

  beforeEach(() => {
    filter = new DeduplicationFilter();
  });

  const baseRecord: ShareRecord = {
    originalPostUrl: 'https://facebook.com/post1',
    sharerId: 'user_100',
    sharerName: 'User One',
    shareStoryId: 'story_100',
    sharePostId: 'post_100',
    shareUrl: 'https://facebook.com/user_100/posts/100',
    sharedAtUnix: 1700000000,
    sharedAtIso: '2023-11-14T22:13:20.000Z',
    scrapedAt: '2026-09-26T12:00:00.000Z',
  };

  it('computes deduplication key prioritizing shareStoryId', () => {
    const key = computeDeduplicationKey(baseRecord);
    expect(key).toBe('story:story_100');
  });

  it('falls back to sharePostId if shareStoryId is missing', () => {
    const record = { ...baseRecord, shareStoryId: null };
    const key = computeDeduplicationKey(record);
    expect(key).toBe('post:post_100');
  });

  it('falls back to shareUrl if story and post IDs are missing', () => {
    const record = { ...baseRecord, shareStoryId: null, sharePostId: null };
    const key = computeDeduplicationKey(record);
    expect(key).toBe('url:https://facebook.com/user_100/posts/100');
  });

  it('falls back to compound key if storyId, postId, and shareUrl are missing', () => {
    const record = { ...baseRecord, shareStoryId: null, sharePostId: null, shareUrl: null };
    const key = computeDeduplicationKey(record);
    expect(key).toBe('compound:user_100_1700000000_no_url');
  });

  it('DOES NOT discard records from the same sharer with different timestamps (multiple reshares)', () => {
    const share1 = { ...baseRecord, shareStoryId: null, sharePostId: null, shareUrl: null, sharedAtUnix: 1700000000 };
    const share2 = { ...baseRecord, shareStoryId: null, sharePostId: null, shareUrl: null, sharedAtUnix: 1700000500 };

    expect(filter.isNewRecord(share1)).toBe(true);
    expect(filter.isNewRecord(share2)).toBe(true); // Should NOT be treated as duplicate
    expect(filter.size).toBe(2);
  });

  it('correctly filters duplicates in batch mode', () => {
    const batch = [
      baseRecord,
      { ...baseRecord }, // exact duplicate
      { ...baseRecord, shareStoryId: 'story_200' }, // new record
    ];

    const unique = filter.filterBatch(batch);
    expect(unique).toHaveLength(2);
    expect(unique[0].shareStoryId).toBe('story_100');
    expect(unique[1].shareStoryId).toBe('story_200');
  });
});
