import { describe, it, expect } from 'vitest';
import {
  verifyFacebookSession,
  maskUserId,
} from '../src/facebook/session/verifyFacebookSession.js';
import { ScraperError } from '../src/models/errors.js';
import type { BrowserContext } from 'playwright';

function mockContext(cookies: Array<{ name: string; value: string }>): BrowserContext {
  return {
    cookies: async () => cookies,
  } as unknown as BrowserContext;
}

describe('verifyFacebookSession & maskUserId', () => {
  describe('maskUserId', () => {
    it('masks long user IDs preserving only last 4 digits', () => {
      expect(maskUserId('100085492109843')).toBe('****9843');
      expect(maskUserId('123456')).toBe('****3456');
    });

    it('handles short user IDs safely', () => {
      expect(maskUserId('123')).toBe('****123');
      expect(maskUserId('4')).toBe('****4');
    });
  });

  describe('verifyFacebookSession', () => {
    it('verifies anonymous session when no c_user cookie is present', async () => {
      const context = mockContext([]);
      const state = await verifyFacebookSession(context, 'anonymous');

      expect(state.verified).toBe(true);
      expect(state.mode).toBe('anonymous');
      expect(state.userId).toBeNull();
    });

    it('throws if anonymous session contains c_user cookie (isolation failure)', async () => {
      const context = mockContext([{ name: 'c_user', value: '123' }]);
      await expect(verifyFacebookSession(context, 'anonymous')).rejects.toThrowError(ScraperError);
    });

    it('throws AUTH_SESSION_INVALID in authenticated mode if c_user is missing', async () => {
      const context = mockContext([{ name: 'xs', value: 'token123' }]);
      await expect(verifyFacebookSession(context, 'authenticated')).rejects.toThrowError(
        /c_user/
      );
    });

    it('throws AUTH_SESSION_INVALID in authenticated mode if xs is missing', async () => {
      const context = mockContext([{ name: 'c_user', value: '1000123456' }]);
      await expect(verifyFacebookSession(context, 'authenticated')).rejects.toThrowError(/xs/);
    });

    it('verifies authenticated session when c_user and xs cookies are present', async () => {
      const context = mockContext([
        { name: 'c_user', value: '1000123456' },
        { name: 'xs', value: 'valid_token' },
      ]);

      const state = await verifyFacebookSession(context, 'authenticated');
      expect(state.verified).toBe(true);
      expect(state.mode).toBe('authenticated');
      expect(state.userId).toBe('****3456');
    });
  });
});
