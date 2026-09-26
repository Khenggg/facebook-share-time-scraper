import type { Page } from 'playwright';
import { RESHARE_SELECTORS } from './selectors.js';
import { logger } from '../utils/logger.js';

/**
 * Navigates to a public Facebook post URL in a clean logged-out context
 * and dismisses standard non-intrusive cookie/consent banners.
 */
export async function openPost(page: Page, postUrl: string): Promise<void> {
  logger.post(postUrl, 'Navigating to public post...');

  await page.goto(postUrl, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });

  // Attempt to dismiss common consent banners if present
  for (const selector of RESHARE_SELECTORS.dismissableOverlays) {
    try {
      const button = page.locator(selector).first();
      if (await button.isVisible({ timeout: 1500 })) {
        logger.debug(`Dismissing overlay matching selector: ${selector}`);
        await button.click({ timeout: 1000 });
      }
    } catch {
      // Non-blocking: overlay not found or not clickable
    }
  }
}
