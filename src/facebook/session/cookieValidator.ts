import * as fs from 'fs';
import { PlaywrightCookie } from '../../models/comparison.js';
import { ScraperError } from '../../models/errors.js';

/**
 * Validates and normalizes an unknown value into a Playwright-compatible cookie array.
 * Supports:
 *   - Direct array of cookie objects: [{ name, value, domain, ... }]
 *   - Object wrapper with "cookies" array (e.g. Cookie-Editor, EditThisCookie, storageState): { url, cookies: [...] }
 * Strictly avoids logging sensitive cookie values.
 */
export function validateCookieArray(input: unknown): PlaywrightCookie[] {
  let cookieItems: unknown = input;

  if (input && typeof input === 'object' && !Array.isArray(input)) {
    const obj = input as Record<string, unknown>;
    if (Array.isArray(obj.cookies)) {
      cookieItems = obj.cookies;
    }
  }

  if (!Array.isArray(cookieItems)) {
    throw new ScraperError(
      'AUTH_COOKIES_MALFORMED',
      'Cookie payload must be a JSON array of cookie objects or an object containing a "cookies" array',
      'Provide an array of objects with "name", "value", and "domain" fields.'
    );
  }

  if (cookieItems.length === 0) {
    throw new ScraperError(
      'AUTH_COOKIES_MALFORMED',
      'Cookie array is empty. At least one authenticated Facebook cookie (such as c_user and xs) is required.'
    );
  }

  const validCookies: PlaywrightCookie[] = [];

  for (let idx = 0; idx < cookieItems.length; idx++) {
    const item = cookieItems[idx];
    if (!item || typeof item !== 'object') {
      throw new ScraperError(
        'AUTH_COOKIES_MALFORMED',
        `Cookie item at index ${idx} is not an object`
      );
    }

    const {
      name,
      value,
      domain,
      path,
      expires,
      expirationDate,
      httpOnly,
      secure,
      sameSite,
    } = item as Record<string, unknown>;

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
      // "unspecified" or other unrecognized values default to undefined (Playwright standard)
    }

    // Normalize expires (seconds or ms) — support both Playwright "expires" and Chrome "expirationDate"
    const rawExpires = expires ?? expirationDate;
    let normalizedExpires: number | undefined;
    if (typeof rawExpires === 'number' && !Number.isNaN(rawExpires) && rawExpires > 0) {
      normalizedExpires = rawExpires > 32503680000 ? Math.floor(rawExpires / 1000) : Math.floor(rawExpires);
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
  let targetPath = filePathOrJson.trim();

  // If specified file does not exist, check fallback locations in secrets/
  if (!fs.existsSync(targetPath)) {
    if (targetPath.includes('facebook-cookies.json') && fs.existsSync('./secrets/facebook-cookies.example.json')) {
      targetPath = './secrets/facebook-cookies.example.json';
    }
  }

  let rawContent = targetPath;
  if (fs.existsSync(targetPath)) {
    try {
      rawContent = fs.readFileSync(targetPath, 'utf-8');
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
