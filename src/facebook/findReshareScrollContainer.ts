import type { Locator } from 'playwright';

export interface ReshareScrollContainerResult {
  container: Locator;
  clientHeight: number;
  scrollHeight: number;
}

/**
 * Discovers and measures the active scrollable container within the "People who shared this" dialog (Phase B).
 * Returns the dialog locator as the resilient parent container so subsequent scroll operations
 * are immune to React DOM reconciliation and re-rendering of internal elements.
 */
export async function findReshareScrollContainer(dialog: Locator): Promise<ReshareScrollContainerResult> {
  const metrics = await dialog.evaluate((dialogEl: HTMLElement) => {
    const elements = Array.from(dialogEl.querySelectorAll<HTMLElement>('*'));

    const candidates = elements.filter((el) => {
      const style = window.getComputedStyle(el);
      const isScrollStyle =
        style.overflowY === 'auto' ||
        style.overflowY === 'scroll' ||
        style.overflow === 'auto' ||
        style.overflow === 'scroll';
      const hasOverflowHeight = el.scrollHeight > el.clientHeight && el.clientHeight > 100;
      return hasOverflowHeight || (isScrollStyle && el.clientHeight > 100);
    });

    let best = candidates[0] || dialogEl;
    let maxDiff = -1;

    for (const cand of candidates) {
      const diff = cand.scrollHeight - cand.clientHeight;
      if (cand.getAttribute('role') === 'feed') {
        best = cand;
        break;
      }
      if (diff > maxDiff) {
        maxDiff = diff;
        best = cand;
      }
    }

    return {
      clientHeight: best.clientHeight,
      scrollHeight: best.scrollHeight,
    };
  });

  console.log(
    `[DIALOG] Reshare scroll container:\n  clientHeight=${metrics.clientHeight}\n  scrollHeight=${metrics.scrollHeight}`
  );

  return {
    container: dialog,
    clientHeight: metrics.clientHeight,
    scrollHeight: metrics.scrollHeight,
  };
}

/**
 * Backward compatibility alias.
 */
export const findScrollableDialog = findReshareScrollContainer;
