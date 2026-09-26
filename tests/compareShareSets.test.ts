import { describe, it, expect } from 'vitest';
import {
  getShareIdentity,
  getSharerIdentity,
  compareShareSets,
  generateComparisonReport,
  generateComparisonDiffRows,
  formatComparisonDiffCsv,
} from '../src/comparison/compareShareSets.js';
import { ShareRecord } from '../src/models/shareRecord.js';
import { ScrapeRunResult } from '../src/models/comparison.js';

function createDummyRecord(overrides: Partial<ShareRecord>): ShareRecord {
  return {
    originalPostUrl: 'https://www.facebook.com/test/posts/1',
    feedbackId: 'fb:1',
    sharerId: 'user1',
    sharerName: 'User One',
    sharerProfileUrl: 'https://www.facebook.com/user1',
    shareStoryId: 'story:1',
    sharePostId: 'post:1',
    shareUrl: 'https://www.facebook.com/user1/posts/1',
    sharedAtUnix: 1700000000,
    sharedAtIso: '2023-11-14T22:13:20.000Z',
    sharedAtLocal: '2023-11-15 05:13:20',
    visibility: null,
    scrapedAt: '2026-09-26T18:00:00.000Z',
    ...overrides,
  };
}

describe('compareShareSets & Share Identity', () => {
  describe('getShareIdentity priority', () => {
    it('prioritizes shareStoryId when present', () => {
      const rec = createDummyRecord({
        shareStoryId: 'story:100',
        sharePostId: 'post:200',
        shareUrl: 'https://facebook.com/post/300',
      });
      expect(getShareIdentity(rec)).toBe('story:story:100');
    });

    it('falls back to sharePostId when shareStoryId is null', () => {
      const rec = createDummyRecord({
        shareStoryId: null,
        sharePostId: 'post:200',
        shareUrl: 'https://facebook.com/post/300',
      });
      expect(getShareIdentity(rec)).toBe('post:post:200');
    });

    it('falls back to shareUrl when storyId and postId are null', () => {
      const rec = createDummyRecord({
        shareStoryId: null,
        sharePostId: null,
        shareUrl: 'https://facebook.com/post/300',
      });
      expect(getShareIdentity(rec)).toBe('url:https://facebook.com/post/300');
    });

    it('falls back to compound key when storyId, postId, and shareUrl are null', () => {
      const rec = createDummyRecord({
        shareStoryId: null,
        sharePostId: null,
        shareUrl: null,
        sharerId: 'uid123',
        sharedAtUnix: 1774000000,
      });
      expect(getShareIdentity(rec)).toContain('compound:uid123_1774000000_');
    });
  });

  describe('getSharerIdentity priority', () => {
    it('prioritizes sharerId', () => {
      const rec = createDummyRecord({ sharerId: '999', sharerProfileUrl: 'https://facebook.com/profile' });
      expect(getSharerIdentity(rec)).toBe('id:999');
    });

    it('falls back to clean profile URL without trailing slashes', () => {
      const rec = createDummyRecord({ sharerId: null, sharerProfileUrl: 'https://facebook.com/Alice///' });
      expect(getSharerIdentity(rec)).toBe('profile:https://facebook.com/alice');
    });

    it('falls back to sharerName when id and profileUrl are null', () => {
      const rec = createDummyRecord({ sharerId: null, sharerProfileUrl: null, sharerName: 'Bob Builder' });
      expect(getSharerIdentity(rec)).toBe('name:bob builder');
    });
  });

  describe('compareShareSets math and logic', () => {
    it('handles identical sets (full overlap)', () => {
      const rec1 = createDummyRecord({ shareStoryId: 's1' });
      const rec2 = createDummyRecord({ shareStoryId: 's2' });

      const res = compareShareSets([rec1, rec2], [rec1, rec2]);
      expect(res.overlap.length).toBe(2);
      expect(res.anonymousOnly.length).toBe(0);
      expect(res.authenticatedOnly.length).toBe(0);
      expect(res.unionCount).toBe(2);
      expect(res.jaccardSimilarity).toBe(1.0);
    });

    it('computes partial overlap and exact Jaccard similarity', () => {
      // anon: [A, B, C]
      // auth: [B, C, D, E]
      // overlap: [B, C] (2)
      // anonOnly: [A] (1)
      // authOnly: [D, E] (2)
      // union: 3 + 4 - 2 = 5
      // jaccard: 2 / 5 = 0.4
      const recA = createDummyRecord({ shareStoryId: 'sA' });
      const recB = createDummyRecord({ shareStoryId: 'sB' });
      const recC = createDummyRecord({ shareStoryId: 'sC' });
      const recD = createDummyRecord({ shareStoryId: 'sD' });
      const recE = createDummyRecord({ shareStoryId: 'sE' });

      const res = compareShareSets([recA, recB, recC], [recB, recC, recD, recE]);
      expect(res.overlap.length).toBe(2);
      expect(res.anonymousOnly.length).toBe(1);
      expect(res.authenticatedOnly.length).toBe(2);
      expect(res.unionCount).toBe(5);
      expect(res.jaccardSimilarity).toBe(0.4);
    });

    it('handles completely disjoint sets (no overlap)', () => {
      const rec1 = createDummyRecord({ shareStoryId: 's1' });
      const rec2 = createDummyRecord({ shareStoryId: 's2' });

      const res = compareShareSets([rec1], [rec2]);
      expect(res.overlap.length).toBe(0);
      expect(res.anonymousOnly.length).toBe(1);
      expect(res.authenticatedOnly.length).toBe(1);
      expect(res.unionCount).toBe(2);
      expect(res.jaccardSimilarity).toBe(0.0);
    });

    it('handles empty sets gracefully', () => {
      const res = compareShareSets([], []);
      expect(res.overlap.length).toBe(0);
      expect(res.unionCount).toBe(0);
      expect(res.jaccardSimilarity).toBe(1.0);
    });

    it('deduplicates input sets before comparing', () => {
      const rec1 = createDummyRecord({ shareStoryId: 's1' });
      const res = compareShareSets([rec1, rec1], [rec1]);
      expect(res.overlap.length).toBe(1);
      expect(res.unionCount).toBe(1);
      expect(res.jaccardSimilarity).toBe(1.0);
    });

    it('handles same sharer sharing multiple times', () => {
      const rec1 = createDummyRecord({ sharerId: 'user1', shareStoryId: 'story1' });
      const rec2 = createDummyRecord({ sharerId: 'user1', shareStoryId: 'story2' });

      const res = compareShareSets([rec1, rec2], [rec1]);
      expect(res.overlap.length).toBe(1);
      expect(res.anonymousOnly.length).toBe(1);
      expect(res.anonUniqueSharerCount).toBe(1);
      expect(res.authUniqueSharerCount).toBe(1);
    });
  });

  describe('Report and CSV formatting', () => {
    it('generates a full comparison report', () => {
      const anonResult: ScrapeRunResult = {
        mode: 'anonymous',
        postUrl: 'https://facebook.com/post/1',
        records: [createDummyRecord({ shareStoryId: 's1' })],
        uniqueSharerCount: 1,
        pagesFetched: 1,
        graphqlOperationNames: ['CometResharesFeedPaginationQuery'],
        stopReason: 'HAS_NEXT_PAGE_FALSE',
        startedAt: '2026-09-26T18:00:00.000Z',
        completedAt: '2026-09-26T18:00:10.000Z',
        durationMs: 10000,
        sessionState: { mode: 'anonymous', verified: true, userId: null, evidence: [] },
      };

      const authResult: ScrapeRunResult = {
        mode: 'authenticated',
        postUrl: 'https://facebook.com/post/1',
        records: [createDummyRecord({ shareStoryId: 's1' }), createDummyRecord({ shareStoryId: 's2' })],
        uniqueSharerCount: 2,
        pagesFetched: 2,
        graphqlOperationNames: ['CometResharesFeedPaginationQuery'],
        stopReason: 'HAS_NEXT_PAGE_FALSE',
        startedAt: '2026-09-26T18:00:15.000Z',
        completedAt: '2026-09-26T18:00:25.000Z',
        durationMs: 10000,
        sessionState: { mode: 'authenticated', verified: true, userId: '****1234', evidence: [] },
      };

      const report = generateComparisonReport('https://facebook.com/post/1', anonResult, authResult);
      expect(report.overlapCount).toBe(1);
      expect(report.anonymousOnlyCount).toBe(0);
      expect(report.authenticatedOnlyCount).toBe(1);
      expect(report.unionCount).toBe(2);
      expect(report.jaccardSimilarity).toBe(0.5);
    });

    it('formats diff CSV correctly', () => {
      const recA = createDummyRecord({ shareStoryId: 'sA', sharerName: 'Alice' });
      const recB = createDummyRecord({ shareStoryId: 'sB', sharerName: 'Bob, Jr.' });

      const rows = generateComparisonDiffRows([recA, recB], [recA]);
      const csv = formatComparisonDiffCsv(rows);

      expect(csv).toContain('classification,shareStoryId');
      expect(csv).toContain('COMMON');
      expect(csv).toContain('ANON_ONLY');
      expect(csv).toContain('"Bob, Jr."'); // Escaped comma
    });
  });
});
