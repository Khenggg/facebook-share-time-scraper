import type { PlaywrightCrawlingContext } from 'crawlee';
import { ActorInput } from '../models/input.js';
import { logger } from '../utils/logger.js';

/**
 * Handles crawling lifecycle for each Facebook public post.
 * To be implemented in Phase 3 & 4.
 */
export async function createRequestHandler(input: ActorInput) {
  return async (context: PlaywrightCrawlingContext) => {
    const { request, page } = context;
    logger.post(request.url, 'Starting request handler...');
    // Orchestration logic will be implemented in subsequent phases
  };
}
