import { describe, it, expect } from 'vitest';
import { parseGraphqlResponse, parseRawGraphqlResponse } from '../src/graphql/parseGraphqlResponse.js';

describe('GraphQL Low-level Deserializer (parseGraphqlResponse)', () => {
  it('parses single standard JSON object', () => {
    const raw = '{"data":{"node":{"id":"feedback_123"}}}';
    const parsed = parseGraphqlResponse(raw);

    expect(parsed).toHaveLength(1);
    expect((parsed[0] as any).data.node.id).toBe('feedback_123');
  });

  it('strips for (;;); anti-hijack prefix and parses JSON object', () => {
    const raw = 'for (;;);{"data":{"node":{"id":"feedback_anti_hijack"}}}';
    const parsed = parseGraphqlResponse(raw);

    expect(parsed).toHaveLength(1);
    expect((parsed[0] as any).data.node.id).toBe('feedback_anti_hijack');
  });

  it('parses newline-delimited JSON objects (Relay stream chunks)', () => {
    const stream = [
      '{"data":{"chunk":1}}',
      '{"data":{"chunk":2}}',
      '{"data":{"chunk":3}}',
    ].join('\n');

    const parsed = parseGraphqlResponse(stream);
    expect(parsed).toHaveLength(3);
    expect((parsed[0] as any).data.chunk).toBe(1);
    expect((parsed[1] as any).data.chunk).toBe(2);
    expect((parsed[2] as any).data.chunk).toBe(3);
  });

  it('handles blank lines and whitespace between chunks', () => {
    const stream = `
      
      {"data":{"edge_id":"edge_a"}}
      
      
      {"data":{"edge_id":"edge_b"}}
      
    `;
    const parsed = parseGraphqlResponse(stream);
    expect(parsed).toHaveLength(2);
    expect((parsed[0] as any).data.edge_id).toBe('edge_a');
    expect((parsed[1] as any).data.edge_id).toBe('edge_b');
  });

  it('safely recovers when one malformed line is among valid JSON lines', () => {
    const mixedStream = [
      '{"data":{"status":"valid_1"}}',
      'THIS_IS_A_CORRUPT_OR_HTML_CHUNK <div class="err">',
      '{"data":{"status":"valid_2"}}',
      '{"incomplete_json":',
      '{"data":{"status":"valid_3"}}',
    ].join('\n');

    const parsed = parseGraphqlResponse(mixedStream);
    // Should parse the 3 valid lines and ignore the 2 malformed ones
    expect(parsed).toHaveLength(3);
    expect((parsed[0] as any).data.status).toBe('valid_1');
    expect((parsed[1] as any).data.status).toBe('valid_2');
    expect((parsed[2] as any).data.status).toBe('valid_3');
  });

  it('handles multiple incremental payloads prefixed with for (;;);', () => {
    const stream = [
      'for (;;);{"data":{"incremental":1}}',
      'for (;;);{"data":{"incremental":2}}',
    ].join('\n');

    const parsed = parseGraphqlResponse(stream);
    expect(parsed).toHaveLength(2);
    expect((parsed[0] as any).data.incremental).toBe(1);
    expect((parsed[1] as any).data.incremental).toBe(2);
  });

  it('returns empty array on blank or non-JSON text', () => {
    expect(parseGraphqlResponse('')).toEqual([]);
    expect(parseGraphqlResponse('   \n\r  ')).toEqual([]);
    expect(parseGraphqlResponse('<!DOCTYPE html><html><body>Login Required</body></html>')).toEqual([]);
  });

  it('exports parseRawGraphqlResponse as backward-compatible alias', () => {
    expect(parseRawGraphqlResponse).toBe(parseGraphqlResponse);
  });
});
