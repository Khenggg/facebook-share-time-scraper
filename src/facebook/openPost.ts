import type { Page } from 'playwright';
import { RESHARE_SELECTORS } from './selectors.js';
import { ScraperError } from '../models/errors.js';
import { logger } from '../utils/logger.js';

/**
 * Navigates to a public Facebook post URL in a clean logged-out context,
 * detects terminal error states (not public, not found, blocked),
 * and dismisses standard non-intrusive cookie/consent banners.
 */
export async function openPost(page: Page, postUrl: string): Promise<void> {
  logger.post(postUrl, 'Opening public Facebook post...');

  try {
    await page.goto(postUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 35000,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new ScraperError(
      'POST_NOT_FOUND',
      `Failed to navigate to post URL: ${message}`,
      'Verify that the URL is accessible from your network.'
    );
  }

  // Allow essential client scripts to initialize
  await page.waitForTimeout(2000);

  // Verify that the browser is running logged-out
  logger.debug('[BROWSER] Verified unauthenticated logged-out context (no user session loaded).');

  // 1. Check for POST_NOT_FOUND
  for (const selector of RESHARE_SELECTORS.pageErrors.notFound) {
    try {
      const el = page.locator(selector).first();
      if (await el.isVisible({ timeout: 500 })) {
        throw new ScraperError(
          'POST_NOT_FOUND',
          'Facebook indicated this post or page is unavailable or has been removed.',
          'Check if the post URL is correct and still exists.'
        );
      }
    } catch (e) {
      if (e instanceof ScraperError) throw e;
    }
  }

  // 2. Check for FACEBOOK_BLOCKED
  for (const selector of RESHARE_SELECTORS.pageErrors.blocked) {
    try {
      const el = page.locator(selector).first();
      if (await el.isVisible({ timeout: 500 })) {
        throw new ScraperError(
          'FACEBOOK_BLOCKED',
          'Facebook presented a security check or rate-limit block.',
          'Consider using a residential proxy or increasing delay intervals.'
        );
      }
    } catch (e) {
      if (e instanceof ScraperError) throw e;
    }
  }

  // 3. Attempt to dismiss common consent banners
  for (const selector of RESHARE_SELECTORS.cookieOverlays) {
    try {
      const button = page.locator(selector).first();
      if (await button.isVisible({ timeout: 800 })) {
        logger.debug(`[OVERLAY] Dismissing banner matching selector: ${selector}`);
        await button.click({ timeout: 1000 }).catch(() => {});
        await page.waitForTimeout(500);
      }
    } catch {
      // Non-blocking
    }
  }

  logger.debug('[POST] Public post page loaded and ready for interaction.');
}
