import type { Page, Locator } from 'playwright';
import { findReshareTrigger, ReshareTriggerResult } from './findReshareTrigger.js';
import { ScraperError } from '../models/errors.js';
import { logger } from '../utils/logger.js';

/**
 * Progressively scrolls the POST container downward until the engagement section
 * (containing the reshare counter) becomes visible in DOM (Phase A).
 *
 * @param postContainer Locator of the post container identified in findPostScrollContainer
 * @param page Playwright Page
 * @param maxScrolls Maximum scroll attempts down the post content
 */
export async function scrollPostToEngagement(
  postContainer: Locator,
  page: Page,
  maxScrolls: number = 10
): Promise<ReshareTriggerResult> {
  logger.debug('[POST] Scrolling post container toward engagement section...');

  for (let step = 0; step < maxScrolls; step++) {
    // Check if trigger is already visible
    const triggerResult = await findReshareTrigger(page);
    if (triggerResult) {
      console.log('[POST] Engagement section reached');
      console.log(`[DIALOG] Reshare trigger detected:\n  "${triggerResult.triggerText}"`);
      return triggerResult;
    }

    // Scroll post container downward dynamically
    await postContainer.evaluate((rootEl: HTMLElement) => {
      const delta = 500;
      const elements = Array.from(rootEl.querySelectorAll<HTMLElement>('*'));
      let target: HTMLElement = rootEl;
      let maxDiff = rootEl.scrollHeight - rootEl.clientHeight;

      for (const cand of elements) {
        const style = window.getComputedStyle(cand);
        const isScroll = style.overflowY === 'auto' || style.overflowY === 'scroll';
        const diff = cand.scrollHeight - cand.clientHeight;
        if ((diff > 0 && cand.clientHeight > 150) || isScroll) {
          if (diff > maxDiff) {
            maxDiff = diff;
            target = cand;
          }
        }
      }

      target.scrollBy({ top: delta, behavior: 'smooth' });
    }).catch(() => {});

    await page.waitForTimeout(600);
  }

  // Final check after all scroll attempts
  const finalCheck = await findReshareTrigger(page);
  if (finalCheck) {
    console.log('[POST] Engagement section reached');
    console.log(`[DIALOG] Reshare trigger detected:\n  "${finalCheck.triggerText}"`);
    return finalCheck;
  }

  throw new ScraperError(
    'RESHARE_TRIGGER_NOT_FOUND',
    'Unable to locate reshare count trigger after scrolling post engagement section.',
    'Check if the post has any public reshares or if Facebook altered its engagement markup.'
  );
}
