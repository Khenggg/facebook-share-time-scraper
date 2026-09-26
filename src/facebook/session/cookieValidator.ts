import * as fs from 'fs';
import { PlaywrightCookie } from '../../models/comparison.js';
import { ScraperError } from '../../models/errors.js';

/**
 * Validates and normalizes an unknown value into a Playwright-compatible cookie array.
 * Strictly avoids logging sensitive cookie values.
 */
export function validateCookieArray(input: unknown): PlaywrightCookie[] {
  if (!Array.isArray(input)) {
    throw new ScraperError(
      'AUTH_COOKIES_MALFORMED',
      'Cookie payload must be a JSON array of cookie objects',
      'Provide an array of objects with "name", "value", and "domain" fields.'
    );
  }

  if (input.length === 0) {
    throw new ScraperError(
      'AUTH_COOKIES_MALFORMED',
      'Cookie array is empty. At least one authenticated Facebook cookie (such as c_user and xs) is required.'
    );
  }

  const validCookies: PlaywrightCookie[] = [];

  for (let idx = 0; idx < input.length; idx++) {
    const item = input[idx];
    if (!item || typeof item !== 'object') {
      throw new ScraperError(
        'AUTH_COOKIES_MALFORMED',
        `Cookie item at index ${idx} is not an object`
      );
    }

    const { name, value, domain, path, expires, httpOnly, secure, sameSite } = item as Record<string, unknown>;

    if (typeof name !== 'string' || name.trim() === '') {
      throw new ScraperError(
        'AUTH_COOKIES_MALFORMED',
        `Cookie at index ${idx} is missing a valid string "name"`
      );
    }

    if (typeof value !== 'string') {
      throw new ScraperError(
        'AUTH_COOKIES_MALFORMED',
        `Cookie "${name}" at index ${idx} has a non-string "value"`
      );
    }

    if (typeof domain !== 'string' || domain.trim() === '') {
      throw new ScraperError(
        'AUTH_COOKIES_MALFORMED',
        `Cookie "${name}" at index ${idx} has an invalid "domain"`
      );
    }

    // Normalize sameSite safely
    let normalizedSameSite: 'Strict' | 'Lax' | 'None' | undefined;
    if (typeof sameSite === 'string') {
      const lower = sameSite.toLowerCase();
      if (lower === 'strict') normalizedSameSite = 'Strict';
      else if (lower === 'lax') normalizedSameSite = 'Lax';
      else if (lower === 'none' || lower === 'no_restriction') normalizedSameSite = 'None';
    }

    // Normalize expires (seconds or ms)
    let normalizedExpires: number | undefined;
    if (typeof expires === 'number' && !Number.isNaN(expires) && expires > 0) {
      // If expires is in ms (greater than year 3000 in seconds), convert to seconds
      normalizedExpires = expires > 32503680000 ? Math.floor(expires / 1000) : Math.floor(expires);
    }

    validCookies.push({
      name: name.trim(),
      value: value,
      domain: domain.trim(),
      path: typeof path === 'string' && path.startsWith('/') ? path : '/',
      expires: normalizedExpires,
      httpOnly: typeof httpOnly === 'boolean' ? httpOnly : undefined,
      secure: typeof secure === 'boolean' ? secure : undefined,
      sameSite: normalizedSameSite,
    });
  }

  return validCookies;
}

/**
 * Loads Facebook cookies from either a file path or raw JSON string.
 */
export function loadCookies(filePathOrJson: string): PlaywrightCookie[] {
  let rawContent = filePathOrJson.trim();

  // If path points to an existing file, read it
  if (fs.existsSync(rawContent)) {
    try {
      rawContent = fs.readFileSync(rawContent, 'utf-8');
    } catch (err) {
      throw new ScraperError(
        'AUTH_COOKIES_MALFORMED',
        `Failed to read cookies file from path: ${(err as Error).message}`
      );
    }
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent);
  } catch (err) {
    throw new ScraperError(
      'AUTH_COOKIES_MALFORMED',
      `Cookies input is neither a valid file path nor valid JSON: ${(err as Error).message}`
    );
  }

  return validateCookieArray(parsed);
}

/**
 * Safely extracts sanitized summary of cookie names and domains without values.
 */
export function getSanitizedCookieSummary(cookies: PlaywrightCookie[]): string[] {
  return cookies.map((c) => `${c.name} (${c.domain})`);
}
