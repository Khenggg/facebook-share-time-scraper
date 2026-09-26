import type { Browser, BrowserContext } from 'playwright';
import { PlaywrightCookie } from '../../models/comparison.js';

/**
 * Creates an isolated browser context and injects validated Facebook cookies.
 * Strictly guarantees independent lifecycle from any anonymous context.
 */
export async function createAuthenticatedContext(
  browser: Browser,
  cookies: PlaywrightCookie[]
): Promise<BrowserContext> {
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
    locale: 'en-US',
  });

  await context.addCookies(cookies);

  return context;
}
