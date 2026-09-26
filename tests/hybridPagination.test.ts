import { describe, it, expect } from 'vitest';
import {
  parseCapturedTemplate,
  cloneRequestWithCursor,
  hashCursor,
  getSafeTemplateMetadata,
} from '../src/graphql/captureRequestTemplate.js';
import { CursorLoopDetector } from '../src/graphql/replayPagination.js';
import { ScraperError } from '../src/models/errors.js';

describe('Hybrid Pagination & Request Template Unit Tests', () => {
  const sampleValidPostData =
    'av=0&__user=0&fb_api_req_friendly_name=CometResharesFeedPaginationQuery&doc_id=28947339021537955&lsd=secretLsdToken&variables=%7B%22count%22%3A1%2C%22cursor%22%3A%22cursor_page_1%22%2C%22id%22%3A%22feedback_123%22%2C%22renderLocation%22%3A%22reshares_dialog%22%7D';

  describe('parseCapturedTemplate', () => {
    it('successfully parses valid CometResharesFeedPaginationQuery form data', () => {
      const template = parseCapturedTemplate(sampleValidPostData);
      expect(template.friendlyName).toBe('CometResharesFeedPaginationQuery');
      expect(template.docId).toBe('28947339021537955');
      expect(template.variables.cursor).toBe('cursor_page_1');
      expect(template.variables.id).toBe('feedback_123');
      expect(template.params.lsd).toBe('secretLsdToken');
    });

    it('throws GRAPHQL_TEMPLATE_NOT_CAPTURED if body is missing or empty', () => {
      expect(() => parseCapturedTemplate('')).toThrowError(ScraperError);
      expect(() => parseCapturedTemplate(null)).toThrowError(ScraperError);
    });

    it('throws GRAPHQL_TEMPLATE_NOT_CAPTURED if friendly name is not CometResharesFeedPaginationQuery', () => {
      const unrelated = 'fb_api_req_friendly_name=SomeOtherQuery&variables=%7B%22id%22%3A%22123%22%7D';
      expect(() => parseCapturedTemplate(unrelated)).toThrowError(/does not match/);
    });

    it('throws GRAPHQL_TEMPLATE_NOT_CAPTURED if variables parameter is missing', () => {
      const missingVars = 'fb_api_req_friendly_name=CometResharesFeedPaginationQuery&doc_id=123';
      expect(() => parseCapturedTemplate(missingVars)).toThrowError(/missing "variables"/);
    });

    it('throws GRAPHQL_TEMPLATE_NOT_CAPTURED if variables JSON is malformed', () => {
      const malformedVars = 'fb_api_req_friendly_name=CometResharesFeedPaginationQuery&variables=not_a_json';
      expect(() => parseCapturedTemplate(malformedVars)).toThrowError(/Malformed variables JSON/);
    });

    it('throws GRAPHQL_TEMPLATE_NOT_CAPTURED if essential feedback identifier is missing', () => {
      const missingId = 'fb_api_req_friendly_name=CometResharesFeedPaginationQuery&variables=%7B%22count%22%3A1%7D';
      expect(() => parseCapturedTemplate(missingId)).toThrowError(/missing feedback identifier/);
    });
  });

  describe('cloneRequestWithCursor', () => {
    it('clones template with updated cursor while keeping original template completely immutable', () => {
      const template = parseCapturedTemplate(sampleValidPostData);
      const originalCursor = template.variables.cursor;
      const nextCursor = 'cursor_page_2_next';

      const cloned = cloneRequestWithCursor(template, nextCursor);

      // Verify cloned values
      expect(cloned.variables.cursor).toBe(nextCursor);
      expect(cloned.variables.id).toBe('feedback_123');

      // Verify cloned body string contains updated cursor
      const clonedParams = new URLSearchParams(cloned.body);
      const clonedVars = JSON.parse(clonedParams.get('variables')!);
      expect(clonedVars.cursor).toBe(nextCursor);
      expect(clonedParams.get('doc_id')).toBe('28947339021537955');
      expect(clonedParams.get('lsd')).toBe('secretLsdToken');

      // VERIFY IMMUTABILITY of original template
      expect(template.variables.cursor).toBe(originalCursor);
      const originalParams = new URLSearchParams(template.body);
      const originalVars = JSON.parse(originalParams.get('variables')!);
      expect(originalVars.cursor).toBe(originalCursor);
    });

    it('supports optional count override', () => {
      const template = parseCapturedTemplate(sampleValidPostData);
      const cloned = cloneRequestWithCursor(template, 'cursor_new', 10);
      expect(cloned.variables.count).toBe(10);
      const parsedVars = JSON.parse(new URLSearchParams(cloned.body).get('variables')!);
      expect(parsedVars.count).toBe(10);
    });

    it('throws GRAPHQL_CURSOR_MISSING if nextCursor is empty or whitespace', () => {
      const template = parseCapturedTemplate(sampleValidPostData);
      expect(() => cloneRequestWithCursor(template, '')).toThrowError(/valid nextCursor/);
      expect(() => cloneRequestWithCursor(template, '   ')).toThrowError(/valid nextCursor/);
    });
  });

  describe('hashCursor & getSafeTemplateMetadata', () => {
    it('generates consistent 8-character hex hash without exposing sensitive cursor string', () => {
      const cursor = 'AQHT0-Et0BaEtx0PUC-1nmQcEuavP_VERY_LONG_SECRET_CURSOR_DATA';
      const hash = hashCursor(cursor);
      expect(hash).toHaveLength(8);
      expect(hashCursor(cursor)).toBe(hash);
      expect(hashCursor(null)).toBeNull();
    });

    it('extracts safe metadata omitting raw token values', () => {
      const template = parseCapturedTemplate(sampleValidPostData);
      const meta = getSafeTemplateMetadata(template);
      expect(meta.friendlyName).toBe('CometResharesFeedPaginationQuery');
      expect(meta.hasDocId).toBe(true);
      expect(meta.hasLsd).toBe(true);
      expect(meta.cursorPresent).toBe(true);
      expect(meta.cursorHash).toHaveLength(8);
      // Ensure no raw tokens in metadata
      expect(JSON.stringify(meta)).not.toContain('secretLsdToken');
    });
  });

  describe('CursorLoopDetector', () => {
    it('registers unique cursors and detects duplicate loop', () => {
      const detector = new CursorLoopDetector();
      detector.register('cursor_1');
      detector.register('cursor_2');
      expect(detector.size()).toBe(2);
      expect(detector.hasSeen('cursor_1')).toBe(true);
      expect(detector.hasSeen('cursor_3')).toBe(false);

      expect(() => detector.register('cursor_1')).toThrowError(
        /Cursor loop detected: cursor hash/
      );
    });
  });
});
