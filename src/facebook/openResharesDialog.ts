import type { Page, Locator } from 'playwright';
import { RESHARE_SELECTORS } from './selectors.js';
import { findReshareTrigger } from './findReshareTrigger.js';
import { ScraperError } from '../models/errors.js';
import { logger } from '../utils/logger.js';

/**
 * Clicks the identified reshare trigger to open the "People who shared this" dialog (Phase B).
 *
 * @param page Playwright Page
 * @param trigger Optional pre-located trigger. If omitted, attempts to find it.
 * @returns Locator of the opened reshares modal dialog.
 */
export async function openResharesDialog(page: Page, trigger?: Locator): Promise<Locator> {
  let targetTrigger = trigger;

  if (!targetTrigger) {
    const found = await findReshareTrigger(page);
    if (!found) {
      throw new ScraperError(
        'RESHARE_TRIGGER_NOT_FOUND',
        'Could not find clickable reshares counter on the post.',
        'Check if the post has public reshares or if Facebook updated its share count markup.'
      );
    }
    targetTrigger = found.trigger;
  }

  // Scroll trigger element into view and click
  await targetTrigger.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(400);

  logger.debug('[DIALOG] Clicking reshare trigger to open modal...');
  await targetTrigger.click({ timeout: 5000 });

  // Locate the reshares dialog
  // If multiple dialogs exist (e.g. post dialog + reshares dialog), select the top/most recent one
  const reshareDialogLocator = page.locator(RESHARE_SELECTORS.reshareDialog.roleDialog).last();

  try {
    await reshareDialogLocator.waitFor({ state: 'visible', timeout: 10000 });
  } catch {
    throw new ScraperError(
      'RESHARE_DIALOG_NOT_OPENED',
      'Reshares modal did not appear after clicking the share count trigger.',
      'A blocking overlay or unexpected page redirection might have intercepted the click.'
    );
  }

  console.log('[DIALOG] People who shared this opened');
  return reshareDialogLocator;
}
