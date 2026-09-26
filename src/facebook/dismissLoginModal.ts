import type { Page } from 'playwright';
import { RESHARE_SELECTORS } from './selectors.js';
import { logger } from '../utils/logger.js';

/**
 * Detects and dismisses the unauthenticated login modal that Facebook displays over public posts.
 * This modal is an expected obstacle in logged-out mode and does NOT indicate that the scraper is blocked.
 *
 * @param page Playwright Page
 * @returns true if a login modal was detected and dismissed, false otherwise.
 */
export async function dismissLoginModal(page: Page): Promise<boolean> {
  // 1. First dismiss any generic cookie consent banner that might cover the modal
  for (const selector of RESHARE_SELECTORS.cookieOverlays) {
    try {
      const btn = page.locator(selector).first();
      if (await btn.isVisible({ timeout: 500 })) {
        await btn.click({ timeout: 800 }).catch(() => {});
        await page.waitForTimeout(300);
      }
    } catch {
      // Non-blocking
    }
  }

  // 2. Check for login modal presence
  let modalFound = false;
  for (const modalSelector of RESHARE_SELECTORS.authGate.modal) {
    try {
      const modal = page.locator(modalSelector).first();
      if (await modal.isVisible({ timeout: 1500 })) {
        modalFound = true;
        break;
      }
    } catch {
      // Continue check
    }
  }

  if (!modalFound) {
    logger.debug('[AUTH_GATE] No login modal detected (post loaded directly).');
    return false;
  }

  console.log('[AUTH_GATE] Login modal detected');

  // 3. Attempt to close the login modal via its close button
  let dismissed = false;
  for (const closeSelector of RESHARE_SELECTORS.authGate.closeButton) {
    try {
      const closeBtn = page.locator(closeSelector).first();
      if (await closeBtn.isVisible({ timeout: 800 })) {
        await closeBtn.click({ timeout: 1500 });
        dismissed = true;
        break;
      }
    } catch {
      // Try next close button selector
    }
  }

  // Fallback: press Escape key if close button was not clicked
  if (!dismissed) {
    try {
      await page.keyboard.press('Escape');
      dismissed = true;
    } catch {
      // Non-blocking
    }
  }

  await page.waitForTimeout(1000);
  console.log('[AUTH_GATE] Login modal dismissed');
  return dismissed;
}
