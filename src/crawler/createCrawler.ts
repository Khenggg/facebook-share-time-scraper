import { PlaywrightCrawler } from 'crawlee';
import { ActorInput } from '../models/input.js';
import { createRequestHandler } from './requestHandler.js';

/**
 * Factory for creating an unauthenticated PlaywrightCrawler instance.
 */
export async function createCrawler(input: ActorInput): Promise<PlaywrightCrawler> {
  const requestHandler = await createRequestHandler(input);

  return new PlaywrightCrawler({
    requestHandler,
    headless: true,
    maxRequestsPerCrawl: input.postUrls.length,
    launchContext: {
      launchOptions: {
        args: [
          '--disable-blink-features=AutomationControlled',
          '--no-sandbox',
          '--disable-setuid-sandbox',
        ],
      },
    },
  });
}
