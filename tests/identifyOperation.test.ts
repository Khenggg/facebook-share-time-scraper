import { describe, it, expect } from 'vitest';
import {
  identifyGraphqlOperation,
  isFacebookGraphqlUrl,
  isCometResharesRequest,
  isResharesPayload,
} from '../src/graphql/identifyOperation.js';

describe('identifyOperation Unit Tests', () => {
  it('detects CometResharesFeedPaginationQuery from standard URL-encoded form data', () => {
    const postData =
      '__user=0&__a=1&fb_api_caller_class=RelayModern&fb_api_req_friendly_name=CometResharesFeedPaginationQuery&variables=%7B%22count%22%3A1%2C%22id%22%3A%22123%22%7D&doc_id=28947339021537955';

    const info = identifyGraphqlOperation(postData);
    expect(info.isResharePagination).toBe(true);
    expect(info.friendlyName).toBe('CometResharesFeedPaginationQuery');
    expect(info.variables).toEqual({ count: 1, id: '123' });
    expect(isCometResharesRequest(postData)).toBe(true);
  });

  it('detects operation when friendly_name is encoded in JSON payload', () => {
    const postData = JSON.stringify({
      friendly_name: 'CometResharesFeedPaginationQuery',
      variables: { cursor: 'abc_cursor', count: 10 },
    });

    const info = identifyGraphqlOperation(postData);
    expect(info.isResharePagination).toBe(true);
    expect(info.friendlyName).toBe('CometResharesFeedPaginationQuery');
    expect(info.variables).toEqual({ cursor: 'abc_cursor', count: 10 });
  });

  it('ignores unrelated GraphQL queries', () => {
    const postData =
      'fb_api_caller_class=RelayModern&fb_api_req_friendly_name=CometCommentsFeedPaginationQuery&variables=%7B%22count%22%3A10%7D';

    const info = identifyGraphqlOperation(postData);
    expect(info.isResharePagination).toBe(false);
    expect(info.friendlyName).toBe('CometCommentsFeedPaginationQuery');
    expect(isCometResharesRequest(postData)).toBe(false);
  });

  it('handles malformed or truncated form bodies without throwing', () => {
    expect(identifyGraphqlOperation('')).toEqual({ isResharePagination: false });
    expect(identifyGraphqlOperation('random_garbage_string_without_delimiters')).toEqual({
      isResharePagination: false,
    });
    expect(identifyGraphqlOperation(null)).toEqual({ isResharePagination: false });
    expect(identifyGraphqlOperation(undefined)).toEqual({ isResharePagination: false });
  });

  it('handles malformed JSON in variables gracefully', () => {
    const postData = 'fb_api_req_friendly_name=CometResharesFeedPaginationQuery&variables=%7Bmalformed_json';
    const info = identifyGraphqlOperation(postData);

    expect(info.isResharePagination).toBe(true);
    expect(info.friendlyName).toBe('CometResharesFeedPaginationQuery');
    expect(info.variables).toBeUndefined();
  });

  it('identifies Facebook GraphQL endpoints correctly', () => {
    expect(isFacebookGraphqlUrl('https://www.facebook.com/api/graphql/')).toBe(true);
    expect(isFacebookGraphqlUrl('https://www.facebook.com/api/graphql/?doc_id=123')).toBe(true);
    expect(isFacebookGraphqlUrl('https://www.facebook.com/api/graphql/batch/')).toBe(true);
    expect(isFacebookGraphqlUrl('https://www.facebook.com/home.php')).toBe(false);
    expect(isFacebookGraphqlUrl('https://www.google.com/api/graphql/')).toBe(false);
  });

  it('validates reshares payload structure', () => {
    expect(isResharesPayload({ data: { node: { reshares: { edges: [] } } } })).toBe(true);
    expect(isResharesPayload({ data: { node: { feedback: {} } } })).toBe(false);
    expect(isResharesPayload(null)).toBe(false);
    expect(isResharesPayload('string')).toBe(false);
  });
});
