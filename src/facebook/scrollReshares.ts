import type { Locator } from 'playwright';

/**
 * Executes a targeted scroll down on the reshares dialog container to trigger lazy loading.
 * Dynamically resolves the internal scrollable container inside the dialog to withstand
 * React DOM reconciliations and re-renders when new items arrive.
 */
export async function scrollReshares(
  dialogOrContainer: Locator,
  deltaY: number = 800
): Promise<{ previousTop: number; newTop: number }> {
  return await dialogOrContainer.evaluate((rootEl: HTMLElement, delta: number) => {
    // Check candidate scrollable children
    const elements = Array.from(rootEl.querySelectorAll<HTMLElement>('*'));
    let target: HTMLElement = rootEl;
    let maxDiff = rootEl.scrollHeight - rootEl.clientHeight;

    for (const cand of elements) {
      if (cand.getAttribute('role') === 'feed') {
        target = cand;
        break;
      }
      const style = window.getComputedStyle(cand);
      const isScroll =
        style.overflowY === 'auto' ||
        style.overflowY === 'scroll' ||
        style.overflow === 'auto' ||
        style.overflow === 'scroll';
      const diff = cand.scrollHeight - cand.clientHeight;
      if ((diff > 0 && cand.clientHeight > 100) || isScroll) {
        if (diff > maxDiff) {
          maxDiff = diff;
          target = cand;
        }
      }
    }

    const previousTop = target.scrollTop;
    target.scrollBy({ top: delta, behavior: 'smooth' });
    target.dispatchEvent(new Event('scroll', { bubbles: true }));

    return {
      previousTop,
      newTop: target.scrollTop,
    };
  }, deltaY);
}
