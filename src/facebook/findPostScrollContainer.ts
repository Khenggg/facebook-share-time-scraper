import type { Page, Locator } from 'playwright';
import { RESHARE_SELECTORS } from './selectors.js';
import { logger } from '../utils/logger.js';

export interface PostScrollContainerResult {
  container: Locator;
  isDialog: boolean;
  clientHeight: number;
  scrollHeight: number;
}

/**
 * Identifies the scrollable container for the post content (Phase A).
 * Facebook often renders the post inside a post-detail dialog/overlay after login dismissal.
 */
export async function findPostScrollContainer(page: Page): Promise<PostScrollContainerResult> {
  const dialogCandidate = page.locator(RESHARE_SELECTORS.postDetail.dialogContainer).first();
  const isDialogVisible = await dialogCandidate.isVisible({ timeout: 2000 }).catch(() => false);

  if (isDialogVisible) {
    console.log('[POST] Post dialog detected');

    // Measure the scrollable inner container inside the post dialog
    const metrics = await dialogCandidate.evaluate((dialogEl: HTMLElement) => {
      const allElements = Array.from(dialogEl.querySelectorAll<HTMLElement>('*'));
      const scrollables = allElements.filter((el) => {
        const style = window.getComputedStyle(el);
        const hasScrollStyle = style.overflowY === 'auto' || style.overflowY === 'scroll';
        return (el.scrollHeight > el.clientHeight && el.clientHeight > 150) || (hasScrollStyle && el.clientHeight > 150);
      });

      let target = scrollables[0] || dialogEl;
      let maxDiff = -1;
      for (const el of scrollables) {
        const diff = el.scrollHeight - el.clientHeight;
        if (diff > maxDiff) {
          maxDiff = diff;
          target = el;
        }
      }

      return {
        clientHeight: target.clientHeight,
        scrollHeight: target.scrollHeight,
      };
    });

    console.log(`[POST] Post scroll container:\n  clientHeight=${metrics.clientHeight}\n  scrollHeight=${metrics.scrollHeight}`);

    return {
      container: dialogCandidate,
      isDialog: true,
      clientHeight: metrics.clientHeight,
      scrollHeight: metrics.scrollHeight,
    };
  }

  // Fallback: Post is rendered in standard main layout
  logger.debug('[POST] Post rendered in standard main view.');
  const mainLocator = page.locator('div[role="main"]').first();
  const isMainVisible = await mainLocator.isVisible().catch(() => false);

  const targetLocator = isMainVisible ? mainLocator : page.locator('body');
  const metrics = await targetLocator.evaluate((el: HTMLElement) => ({
    clientHeight: el.clientHeight || window.innerHeight,
    scrollHeight: el.scrollHeight || document.body.scrollHeight,
  }));

  console.log(`[POST] Post scroll container:\n  clientHeight=${metrics.clientHeight}\n  scrollHeight=${metrics.scrollHeight}`);

  return {
    container: targetLocator,
    isDialog: false,
    clientHeight: metrics.clientHeight,
    scrollHeight: metrics.scrollHeight,
  };
}
