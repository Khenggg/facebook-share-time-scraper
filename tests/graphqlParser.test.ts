import { describe, it, expect } from 'vitest';
import { parseRawGraphqlResponse } from '../src/graphql/parseGraphqlResponse.js';
import { isCometResharesRequest, isFacebookGraphqlUrl, isResharesPayload } from '../src/graphql/identifyOperation.js';

describe('GraphQL Low-level Deserializer & Identifier', () => {
  it('identifies Facebook GraphQL URLs', () => {
    expect(isFacebookGraphqlUrl('https://www.facebook.com/api/graphql/')).toBe(true);
    expect(isFacebookGraphqlUrl('https://www.facebook.com/api/graphql/?doc_id=123')).toBe(true);
    expect(isFacebookGraphqlUrl('https://www.facebook.com/messages/')).toBe(false);
  });

  it('identifies CometResharesFeedPaginationQuery form payload', () => {
    const validPostData = 'fb_api_caller_class=RelayModern&fb_api_req_friendly_name=CometResharesFeedPaginationQuery&variables={}';
    expect(isCometResharesRequest(validPostData)).toBe(true);
    expect(isCometResharesRequest('fb_api_req_friendly_name=OtherQuery')).toBe(false);
    expect(isCometResharesRequest(null)).toBe(false);
  });

  it('identifies valid reshares payload object', () => {
    const validPayload = { data: { node: { reshares: { edges: [] } } } };
    expect(isResharesPayload(validPayload)).toBe(true);
    expect(isResharesPayload({ data: { node: { comments: {} } } })).toBe(false);
    expect(isResharesPayload(null)).toBe(false);
  });

  it('strips for (;;); anti-hijack prefix and parses JSON', () => {
    const raw = 'for (;;);{"data":{"node":{"id":"test"}}}';
    const parsed = parseRawGraphqlResponse(raw);

    expect(parsed).toHaveLength(1);
    expect((parsed[0] as any).data.node.id).toBe('test');
  });

  it('parses newline-delimited JSON chunks (Relay stream batch)', () => {
    const stream = `
      {"data":{"chunk":1}}
      {"data":{"chunk":2}}
    `;
    const parsed = parseRawGraphqlResponse(stream);

    expect(parsed).toHaveLength(2);
    expect((parsed[0] as any).data.chunk).toBe(1);
    expect((parsed[1] as any).data.chunk).toBe(2);
  });

  it('returns empty array on blank or invalid text', () => {
    expect(parseRawGraphqlResponse('')).toEqual([]);
    expect(parseRawGraphqlResponse('   ')).toEqual([]);
    expect(parseRawGraphqlResponse('<!DOCTYPE html><html>error</html>')).toEqual([]);
  });
});
