import { Actor } from 'apify';
import { ActorInput } from './models/input.js';
import { logger } from './utils/logger.js';
import { createCrawler } from './crawler/createCrawler.js';

/**
 * Main entrypoint for Facebook Public Reshare Time Scraper Apify Actor.
 */
await Actor.main(async () => {
  const input = (await Actor.getInput<ActorInput>()) ?? { postUrls: [] };
  logger.setDebug(Boolean(input.debug));

  if (!input.postUrls || input.postUrls.length === 0) {
    logger.error('No Facebook post URLs provided in input.');
    return;
  }

  logger.dialog(`Initializing crawler for ${input.postUrls.length} post(s)...`);
  const crawler = await createCrawler(input);
  await crawler.run(input.postUrls);
  logger.done(0, 'Scraping run completed.');
});
