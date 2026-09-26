import type { Page, Locator } from 'playwright';
import { RESHARE_SELECTORS } from './selectors.js';
import { ScraperError } from '../models/errors.js';
import { logger } from '../utils/logger.js';

/**
 * Finds and clicks the reshares count trigger on a public Facebook post to open the reshares modal.
 */
export async function openResharesDialog(page: Page): Promise<Locator> {
  logger.dialog('Attempting to locate reshare counter trigger...');

  let triggerFound: Locator | null = null;

  for (const selector of RESHARE_SELECTORS.shareCountTriggers) {
    try {
      const candidate = page.locator(selector).first();
      if (await candidate.isVisible({ timeout: 2000 })) {
        triggerFound = candidate;
        break;
      }
    } catch {
      // Continue to next selector candidate
    }
  }

  if (!triggerFound) {
    throw new ScraperError(
      'RESHARE_TRIGGER_NOT_FOUND',
      'Could not find clickable reshares counter on the post.',
      'Check if the post has public reshares or if Facebook updated its share count markup.'
    );
  }

  logger.dialog('Reshare trigger found. Clicking to open dialog...');
  await triggerFound.click();

  // Wait for dialog to appear
  const dialog = page.locator(RESHARE_SELECTORS.dialog.roleDialog).first();
  try {
    await dialog.waitFor({ state: 'visible', timeout: 8000 });
  } catch {
    throw new ScraperError(
      'RESHARE_DIALOG_NOT_OPENED',
      'Reshares modal did not appear after clicking the share count trigger.',
      'A blocking overlay or unexpected page redirection might have intercepted the click.'
    );
  }

  logger.dialog('Reshares modal dialog confirmed visible.');
  return dialog;
}
