import type { Locator } from 'playwright';

/**
 * Discovers the active scrollable container within the reshares modal dialog.
 * Facebook wraps the feed items inside an inner scrollable div.
 */
export async function findScrollableDialog(dialog: Locator): Promise<Locator> {
  // Evaluates internal elements to locate the container with scrollHeight > clientHeight or overflow-y: auto/scroll
  const scrollableElement = dialog.locator('div[style*="overflow-y: auto"], div[style*="overflow-y: scroll"], div[role="feed"]').first();

  try {
    if (await scrollableElement.isVisible({ timeout: 2000 })) {
      return scrollableElement;
    }
  } catch {
    // Fall back to dialog itself
  }

  return dialog;
}
