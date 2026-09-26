import { PlaywrightCrawler } from 'crawlee';
import { Actor } from 'apify';
import { ActorInput } from '../models/input.js';
import { createRequestHandler } from './requestHandler.js';

/**
 * Factory for creating an unauthenticated PlaywrightCrawler instance.
 * Enforces strictly logged-out, clean browser sessions.
 */
export async function createCrawler(input: ActorInput, isHeadless: boolean = true): Promise<PlaywrightCrawler> {
  const requestHandler = await createRequestHandler(input);

  // Initialize optional Apify Proxy
  const proxyConfiguration = input.proxyConfiguration
    ? await Actor.createProxyConfiguration(input.proxyConfiguration)
    : undefined;

  return new PlaywrightCrawler({
    requestHandler,
    headless: isHeadless,
    proxyConfiguration,
    maxRequestsPerCrawl: input.postUrls.length,
    navigationTimeoutSecs: 45,
    requestHandlerTimeoutSecs: 600,
    maxRequestRetries: 1,
    launchContext: {
      launchOptions: {
        headless: isHeadless,
        args: [
          '--disable-blink-features=AutomationControlled',
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--lang=en-US,en',
        ],
      },
    },
    browserPoolOptions: {
      useFingerprints: false, // Maintain deterministic unauthenticated baseline
    },
  });
}
