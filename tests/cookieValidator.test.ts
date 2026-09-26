import { describe, it, expect } from 'vitest';
import {
  validateCookieArray,
  loadCookies,
  getSanitizedCookieSummary,
} from '../src/facebook/session/cookieValidator.js';
import { ScraperError } from '../src/models/errors.js';

describe('cookieValidator', () => {
  it('validates a correct Playwright cookie array', () => {
    const raw = [
      {
        name: 'c_user',
        value: '100012345678',
        domain: '.facebook.com',
        path: '/',
        expires: 1800000000,
        httpOnly: false,
        secure: true,
        sameSite: 'Lax',
      },
      {
        name: 'xs',
        value: 'secret_token_123',
        domain: '.facebook.com',
        path: '/',
      },
    ];

    const validated = validateCookieArray(raw);
    expect(validated.length).toBe(2);
    expect(validated[0].name).toBe('c_user');
    expect(validated[0].sameSite).toBe('Lax');
    expect(validated[1].path).toBe('/');
  });

  it('throws ScraperError on non-array input', () => {
    expect(() => validateCookieArray('not an array')).toThrowError(ScraperError);
    expect(() => validateCookieArray({})).toThrowError(ScraperError);
  });

  it('throws ScraperError on empty array', () => {
    expect(() => validateCookieArray([])).toThrowError(ScraperError);
  });

  it('throws ScraperError when name or domain is missing', () => {
    expect(() =>
      validateCookieArray([{ value: '123', domain: '.facebook.com' }])
    ).toThrowError(ScraperError);

    expect(() =>
      validateCookieArray([{ name: 'c_user', value: '123' }])
    ).toThrowError(ScraperError);

    expect(() =>
      validateCookieArray([{ name: 'c_user', value: 123, domain: '.facebook.com' }])
    ).toThrowError(ScraperError);
  });

  it('normalizes expires from ms to seconds if needed', () => {
    const raw = [
      {
        name: 'test',
        value: 'val',
        domain: '.facebook.com',
        expires: 1750000000000, // in ms
      },
    ];
    const validated = validateCookieArray(raw);
    expect(validated[0].expires).toBe(1750000000);
  });

  it('safely extracts sanitized summary without exposing secrets', () => {
    const cookies = [
      {
        name: 'c_user',
        value: 'SUPER_SECRET_USER_123',
        domain: '.facebook.com',
      },
      {
        name: 'xs',
        value: 'SUPER_SECRET_SESSION_TOKEN',
        domain: '.facebook.com',
      },
    ];

    const summary = getSanitizedCookieSummary(cookies);
    expect(summary).toEqual(['c_user (.facebook.com)', 'xs (.facebook.com)']);

    const serialized = JSON.stringify(summary);
    expect(serialized).not.toContain('SUPER_SECRET');
  });

  it('loads valid cookies from a raw JSON string', () => {
    const jsonString = JSON.stringify([
      { name: 'c_user', value: '12345', domain: '.facebook.com' },
    ]);
    const loaded = loadCookies(jsonString);
    expect(loaded.length).toBe(1);
    expect(loaded[0].name).toBe('c_user');
  });
});
