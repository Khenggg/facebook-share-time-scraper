import type { Browser, BrowserContext } from 'playwright';

/**
 * Creates an isolated, clean unauthenticated browser context for Anonymous mode.
 * Strictly guarantees no persistent storageState or pre-existing Facebook cookies.
 */
export async function createAnonymousContext(browser: Browser): Promise<BrowserContext> {
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
    locale: 'en-US',
  });

  return context;
}
