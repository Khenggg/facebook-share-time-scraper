import type { Locator } from 'playwright';

/**
 * Executes a targeted scroll down on the reshares dialog container to trigger lazy loading.
 */
export async function scrollReshares(container: Locator, deltaY: number = 800): Promise<void> {
  await container.evaluate((el: HTMLElement, delta: number) => {
    el.scrollBy({ top: delta, behavior: 'smooth' });
  }, deltaY);
}
