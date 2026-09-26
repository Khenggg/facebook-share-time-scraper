import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseReshares } from '../src/graphql/parseReshares.js';

describe('parseReshares Contract Tests', () => {
  const fixturePath = join(__dirname, 'fixtures/graphql/cometResharesResponse.json');
  const fixtureJson = JSON.parse(readFileSync(fixturePath, 'utf-8'));
  const originalPostUrl = 'https://www.facebook.com/4914293075523572';

  it('CRITICAL: extracts canonical share timestamp from edge.node.creation_time', () => {
    const result = parseReshares(fixtureJson, originalPostUrl);

    expect(result.records).toHaveLength(1);
    const record = result.records[0];

    // Assert exact canonical share time (1785512929)
    expect(record.sharedAtUnix).toBe(1785512929);

    // Assert it NEVER picks up the attached_story.creation_time (1753949084)
    expect(record.sharedAtUnix).not.toBe(1753949084);
  });

  it('correctly extracts sharer details and outer post identifiers', () => {
    const result = parseReshares(fixtureJson, originalPostUrl);
    const record = result.records[0];

    expect(record.sharerId).toBe('USER_ID');
    expect(record.sharerName).toBe('Example User');
    expect(record.sharerProfileUrl).toBe('https://facebook.com/user.example');
    expect(record.sharePostId).toBe('4914293075523572');
    expect(record.shareUrl).toBe('https://facebook.com/example/posts/RESHARE');
    expect(record.feedbackId).toBe('feedback_test_123');
    expect(record.originalPostUrl).toBe(originalPostUrl);
  });

  it('correctly formats ISO-8601 UTC and local timezone timestamps', () => {
    const result = parseReshares(fixtureJson, originalPostUrl, 'Asia/Ho_Chi_Minh');
    const record = result.records[0];

    expect(record.sharedAtIso).toBe(new Date(1785512929 * 1000).toISOString());
    expect(record.sharedAtLocal).toBeDefined();
    expect(typeof record.sharedAtLocal).toBe('string');
  });

  it('correctly extracts pagination page_info', () => {
    const result = parseReshares(fixtureJson, originalPostUrl);

    expect(result.pageInfo).toBeDefined();
    expect(result.pageInfo?.end_cursor).toBe('NEXT_CURSOR');
    expect(result.pageInfo?.has_next_page).toBe(true);
  });

  it('handles multi-edge payloads and records without attached story or actor', () => {
    const multiPath = join(__dirname, 'fixtures/graphql/cometResharesResponseMultiple.json');
    const multiJson = JSON.parse(readFileSync(multiPath, 'utf-8'));
    const result = parseReshares(multiJson, originalPostUrl);

    expect(result.records).toHaveLength(3);
    expect(result.records[0].sharedAtUnix).toBe(1785513000);
    expect(result.records[0].sharerName).toBe('First Sharer');

    expect(result.records[1].sharedAtUnix).toBe(1785514000);
    expect(result.records[1].sharerName).toBe('Second Sharer');

    // Edge 3 has empty actors array and null permalink
    expect(result.records[2].sharedAtUnix).toBe(1785515000);
    expect(result.records[2].sharerId).toBeNull();
    expect(result.records[2].sharerName).toBeNull();
    expect(result.records[2].shareUrl).toBeNull();

    expect(result.pageInfo?.has_next_page).toBe(false);
  });

  it('safely handles empty or malformed inputs without throwing', () => {
    expect(parseReshares(null, originalPostUrl).records).toEqual([]);
    expect(parseReshares({}, originalPostUrl).records).toEqual([]);
    expect(parseReshares({ data: {} }, originalPostUrl).records).toEqual([]);
    expect(parseReshares({ data: { node: { reshares: { edges: 'not-an-array' } } } }, originalPostUrl).records).toEqual([]);
  });

  it('correctly uses fallbacks for actors, URLs, and IDs when standard paths are absent', () => {
    const fallbackPayload = {
      data: {
        node: {
          id: 'feedback_fb',
          reshares: {
            edges: [
              {
                node: {
                  post_id: 'post_fallback_123',
                  creation_time: 1789000000,
                  actors: [
                    {
                      id: 'user_fallback_456',
                      name: 'Fallback User',
                    },
                  ],
                  url: 'https://facebook.com/custom_url',
                  privacy_scope: { description: 'Public' },
                },
              },
            ],
          },
        },
      },
    };

    const result = parseReshares(fallbackPayload, originalPostUrl);
    expect(result.records).toHaveLength(1);
    const rec = result.records[0];
    expect(rec.sharedAtUnix).toBe(1789000000);
    expect(rec.sharerId).toBe('user_fallback_456');
    expect(rec.sharerName).toBe('Fallback User');
    expect(rec.sharerProfileUrl).toBe('https://www.facebook.com/user_fallback_456');
    expect(rec.shareUrl).toBe('https://facebook.com/custom_url');
    expect(rec.visibility).toBe('Public');
  });

  it('correctly parses initial dialog payload where root is data.feedback (CometResharesDialogQuery)', () => {
    const dialogPayload = {
      data: {
        feedback: {
          id: 'ZmVlZGJhY2s6Nzc1MTMwOTk4NDAwMDYw',
          reshares: {
            edges: [
              {
                node: {
                  post_id: 'post_dialog_1',
                  creation_time: 1774006209,
                  comet_sections: {
                    context_layout: {
                      story: {
                        actors: [{ id: 'vu_hoa_id', name: 'Vu Hoa', profile_url: 'https://fb.com/vuhoa' }],
                      },
                    },
                  },
                },
              },
              {
                node: {
                  post_id: 'post_dialog_2',
                  creation_time: 1774888059,
                  comet_sections: {
                    context_layout: {
                      story: {
                        actors: [{ id: 'luong_hien_id', name: 'Lương Văn Hiển', profile_url: 'https://fb.com/luonghien' }],
                      },
                    },
                  },
                },
              },
            ],
            page_info: {
              has_next_page: true,
              end_cursor: 'cursor_dialog_abc',
            },
          },
        },
      },
    };

    const result = parseReshares(dialogPayload, originalPostUrl);
    expect(result.records).toHaveLength(2);
    expect(result.records[0].sharerName).toBe('Vu Hoa');
    expect(result.records[0].sharedAtUnix).toBe(1774006209);
    expect(result.records[1].sharerName).toBe('Lương Văn Hiển');
    expect(result.records[1].sharedAtUnix).toBe(1774888059);
    expect(result.pageInfo?.has_next_page).toBe(true);
    expect(result.pageInfo?.end_cursor).toBe('cursor_dialog_abc');
    expect(result.feedbackId).toBe('ZmVlZGJhY2s6Nzc1MTMwOTk4NDAwMDYw');
  });
});
