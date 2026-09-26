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
    // Find scrollable container child element
    const elements = Array.from(rootEl.querySelectorAll<HTMLElement>('*'));
    let target: HTMLElement = rootEl;
    let maxDiff = -1;

    for (const cand of elements) {
      const style = window.getComputedStyle(cand);
      const isScroll =
        style.overflowY === 'auto' ||
        style.overflowY === 'scroll' ||
        style.overflow === 'auto' ||
        style.overflow === 'scroll';
      const diff = cand.scrollHeight - cand.clientHeight;
      if (isScroll && cand.clientHeight > 100) {
        if (diff > maxDiff) {
          maxDiff = diff;
          target = cand;
        }
      }
    }

    const previousTop = target.scrollTop;
    // Scroll directly to bottom to ensure bottom threshold is crossed
    target.scrollTop = target.scrollHeight;
    target.scrollBy({ top: delta, behavior: 'instant' as ScrollBehavior });
    target.dispatchEvent(new Event('scroll', { bubbles: true }));

    return {
      previousTop,
      newTop: target.scrollTop,
    };
  }, deltaY);
}
