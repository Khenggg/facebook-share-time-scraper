import { Actor } from 'apify';
import { ActorInput } from './models/input.js';
import { logger } from './utils/logger.js';
import { createCrawler } from './crawler/createCrawler.js';

/**
 * Main entrypoint for Facebook Public Reshare Time Scraper Apify Actor.
 */
await Actor.main(async () => {
  const startTime = new Date();
  const input = (await Actor.getInput<ActorInput>()) ?? { postUrls: [] };
  logger.setDebug(Boolean(input.debug));

  if (!input.postUrls || !Array.isArray(input.postUrls) || input.postUrls.length === 0) {
    logger.error('No valid Facebook post URLs provided in input. Please specify at least one URL in "postUrls".');
    await Actor.setValue('OUTPUT_STATISTICS', {
      status: 'FAILED',
      reason: 'MISSING_POST_URLS',
      totalPosts: 0,
      scrapedAt: new Date().toISOString(),
    });
    return;
  }

  logger.dialog(`Initializing crawler for ${input.postUrls.length} post(s)...`);

  const isHeadless = input.headless ?? true;
  const crawler = await createCrawler(input, isHeadless);
  await crawler.run(input.postUrls);

  const dataset = await Actor.openDataset();
  const datasetInfo = await dataset.getInfo();
  const totalItemCount = datasetInfo?.itemCount ?? 0;

  const finishedTime = new Date();
  const durationSeconds = Math.round((finishedTime.getTime() - startTime.getTime()) / 1000);

  const runStats = {
    status: 'SUCCESS',
    totalPostsTargeted: input.postUrls.length,
    totalShareRecordsExtracted: totalItemCount,
    startedAt: startTime.toISOString(),
    finishedAt: finishedTime.toISOString(),
    durationSeconds,
  };

  await Actor.setValue('OUTPUT_STATISTICS', runStats);

  logger.done(
    totalItemCount,
    `All ${input.postUrls.length} post(s) processed in ${durationSeconds}s. Dataset populated.`
  );
});
