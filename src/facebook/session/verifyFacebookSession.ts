import type { BrowserContext, Page } from 'playwright';
import { FacebookSessionState } from '../../models/comparison.js';
import { ScraperError } from '../../models/errors.js';
import { logger } from '../../utils/logger.js';

/**
 * Mask user ID so only the last 4 characters are visible (e.g., "****1234").
 */
export function maskUserId(rawId: string): string {
  const trimmed = rawId.trim();
  if (trimmed.length <= 4) return '****' + trimmed;
  return '****' + trimmed.slice(-4);
}

/**
 * Verifies whether a browser context has a valid unauthenticated or authenticated session.
 * For authenticated sessions, validates that c_user cookie is present and session is active.
 * Throws AUTH_SESSION_INVALID if an authenticated session cannot be verified.
 */
export async function verifyFacebookSession(
  context: BrowserContext,
  mode: 'anonymous' | 'authenticated',
  page?: Page
): Promise<FacebookSessionState> {
  const cookies = await context.cookies(['https://www.facebook.com']);
  const cUserCookie = cookies.find((c) => c.name === 'c_user');

  if (mode === 'anonymous') {
    if (cUserCookie && cUserCookie.value) {
      throw new ScraperError(
        'FACEBOOK_BLOCKED',
        'Anonymous session unexpectedly contains a c_user cookie. Session isolation compromised.'
      );
    }

    return {
      mode: 'anonymous',
      verified: true,
      userId: null,
      evidence: ['No c_user cookie present', 'Pure unauthenticated __user=0 baseline'],
    };
  }

  // Authenticated Mode Validation
  const evidence: string[] = [];

  if (!cUserCookie || !cUserCookie.value) {
    throw new ScraperError(
      'AUTH_SESSION_INVALID',
      'Authenticated session verification failed: "c_user" cookie is missing or empty',
      'Ensure the provided Facebook cookies contain a valid, active session with "c_user" and "xs".'
    );
  }

  const maskedId = maskUserId(cUserCookie.value);
  evidence.push(`Active "c_user" cookie present (account ID: ${maskedId})`);

  const xsCookie = cookies.find((c) => c.name === 'xs');
  if (!xsCookie || !xsCookie.value) {
    throw new ScraperError(
      'AUTH_SESSION_INVALID',
      'Authenticated session verification failed: "xs" session token cookie is missing',
      'Facebook authenticated sessions require both "c_user" and "xs" cookies.'
    );
  }
  evidence.push('Session token cookie "xs" present');

  // If a page instance is provided, perform live page health check
  if (page) {
    try {
      await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 25000 });
      const currentUrl = page.url();

      if (currentUrl.includes('/checkpoint/') || currentUrl.includes('/login/checkpoint')) {
        throw new ScraperError(
          'AUTH_SESSION_INVALID',
          'Facebook triggered a checkpoint verification challenge for this session',
          'The account session has been flagged or requires manual verification.'
        );
      }

      if (currentUrl.includes('/login') && !currentUrl.includes('/home')) {
        throw new ScraperError(
          'AUTH_SESSION_INVALID',
          'Facebook redirected authenticated session back to the login page',
          'The provided cookies appear to be expired or invalidated by Facebook.'
        );
      }

      evidence.push('Successfully navigated to Facebook feed without redirect to login/checkpoint');
    } catch (navErr) {
      if (navErr instanceof ScraperError) throw navErr;
      logger.debug(`[SESSION] Optional homepage check skipped or timed out: ${(navErr as Error).message}`);
    }
  }

  console.log(`[SESSION] Authenticated Facebook session verified (account ID: ${maskedId}).`);

  return {
    mode: 'authenticated',
    verified: true,
    userId: maskedId,
    evidence,
  };
}
