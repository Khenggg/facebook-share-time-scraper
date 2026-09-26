import type { Page, Locator } from 'playwright';
import { RESHARE_SELECTORS } from './selectors.js';
import { logger } from '../utils/logger.js';

export interface ReshareTriggerResult {
  trigger: Locator;
  triggerText: string;
}

/**
 * Searches for the reshare count trigger on the post page (e.g. "350 shares", "12 lượt chia sẻ").
 * Explicitly rejects the Share ACTION button (e.g. plain "Share" or "Chia sẻ" without count).
 */
export async function findReshareTrigger(page: Page): Promise<ReshareTriggerResult | null> {
  for (const selector of RESHARE_SELECTORS.shareCountTriggers) {
    try {
      const candidates = page.locator(selector);
      const count = await candidates.count();

      for (let i = 0; i < count; i++) {
        const candidate = candidates.nth(i);
        if (await candidate.isVisible()) {
          const text = (await candidate.textContent())?.trim() ?? '';
          const lower = text.toLowerCase();

          // Reject action button strings
          if (lower === 'share' || lower === 'chia sẻ' || lower === '') {
            continue;
          }

          // Must contain digits or share keywords
          const hasDigits = /\d/.test(text);
          const hasShareWord = lower.includes('share') || lower.includes('chia sẻ');

          if (hasDigits || hasShareWord) {
            logger.debug(`[DIALOG] Reshare trigger candidate matched: "${text}"`);
            return {
              trigger: candidate,
              triggerText: text,
            };
          }
        }
      }
    } catch {
      // Continue trying next selector
    }
  }

  return null;
}
