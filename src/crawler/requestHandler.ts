import type { PlaywrightCrawlingContext } from 'crawlee';
import type { Page } from 'playwright';
import { Actor } from 'apify';
import { ActorInput } from '../models/input.js';
import { ShareRecord } from '../models/shareRecord.js';
import { openPost } from '../facebook/openPost.js';
import { dismissLoginModal } from '../facebook/dismissLoginModal.js';
import { findPostScrollContainer } from '../facebook/findPostScrollContainer.js';
import { scrollPostToEngagement } from '../facebook/scrollPostToEngagement.js';
import { openResharesDialog } from '../facebook/openResharesDialog.js';
import { findReshareScrollContainer } from '../facebook/findReshareScrollContainer.js';
import { scrollReshares } from '../facebook/scrollReshares.js';
import { isFacebookGraphqlUrl, identifyGraphqlOperation } from '../graphql/identifyOperation.js';
import { parseGraphqlResponse } from '../graphql/parseGraphqlResponse.js';
import { parseReshares } from '../graphql/parseReshares.js';
import { createInitialPaginationState, updatePaginationState } from '../graphql/pagination.js';
import { DeduplicationFilter } from '../utils/deduplicate.js';
import { logger } from '../utils/logger.js';
import { DEFAULT_MAX_SCROLL_ATTEMPTS, DEFAULT_SCROLL_DELAY_MS } from '../constants.js';

/**
 * Coordinates event-driven network interception for CometResharesFeedPaginationQuery.
 */
export class ReshareNetworkInterceptor {
  private readonly pendingWaiters: Array<(rawBody: string) => void> = [];
  private readonly capturedBodies: string[] = [];

  public attach(page: Page): void {
    page.on('response', async (response) => {
      const url = response.url();
      if (!isFacebookGraphqlUrl(url)) return;

      const request = response.request();
      if (request.method() !== 'POST') return;

      const postData = request.postData();
      const opInfo = identifyGraphqlOperation(postData);

      if (!opInfo.isResharePagination) return;

      console.log('[GRAPHQL] CometResharesFeedPaginationQuery detected');

      try {
        const rawBody = await response.text();
        if (this.pendingWaiters.length > 0) {
          const resolve = this.pendingWaiters.shift()!;
          resolve(rawBody);
        } else {
          this.capturedBodies.push(rawBody);
        }
      } catch (err) {
        logger.debug(`[GRAPHQL] Could not read response text: ${String(err)}`);
      }
    });
  }

  /**
   * Bounded wait for the next captured pagination response body.
   */
  public async waitForResponse(timeoutMs: number = 7000): Promise<string | null> {
    if (this.capturedBodies.length > 0) {
      return this.capturedBodies.shift()!;
    }

    return new Promise<string | null>((resolve) => {
      const timer = setTimeout(() => {
        const idx = this.pendingWaiters.indexOf(resolveWrapper);
        if (idx !== -1) {
          this.pendingWaiters.splice(idx, 1);
        }
        resolve(null);
      }, timeoutMs);

      const resolveWrapper = (body: string) => {
        clearTimeout(timer);
        resolve(body);
      };

      this.pendingWaiters.push(resolveWrapper);
    });
  }

  public hasCapturedBodies(): boolean {
    return this.capturedBodies.length > 0;
  }
}

/**
 * Creates the Playwright request handler for scraping public Facebook reshares.
 * Operates strictly with TWO DISTINCT SCROLL PHASES:
 *   PHASE A: POST SCROLL (Login dismissal -> Post container scroll -> Engagement trigger discovery)
 *   PHASE B: RESHARE SCROLL (Reshares dialog open -> Reshares container scroll -> GraphQL capture)
 */
export async function createRequestHandler(input: ActorInput) {
  const maxShares = input.maxSharesPerPost ?? 1000;
  const maxScrolls = input.maxScrollAttempts ?? DEFAULT_MAX_SCROLL_ATTEMPTS;
  const scrollDelay = input.scrollDelayMs ?? DEFAULT_SCROLL_DELAY_MS;
  const timezone = input.timezone ?? 'Asia/Ho_Chi_Minh';

  return async (context: PlaywrightCrawlingContext) => {
    const { request, page } = context;
    const postUrl = request.url;
    logger.post(postUrl, 'Opening public Facebook post...');

    // ==========================================
    // PHASE A — POST SCROLL & TRIGGER DISCOVERY
    // ==========================================

    // 1. Navigate to public post
    await openPost(page, postUrl);

    // 2. Dismiss unauthenticated Login Modal (Auth Gate) if present
    await dismissLoginModal(page);

    // 3. Identify Post Detail Container
    const { container: postContainer } = await findPostScrollContainer(page);

    // 4. Scroll Post Container downward to reveal Engagement Section and locate Reshare Trigger
    const { trigger } = await scrollPostToEngagement(postContainer, page);

    // ==========================================
    // PHASE B — RESHARE SCROLL & GRAPHQL CAPTURE
    // ==========================================

    // 5. Attach GraphQL Network Interceptor before opening reshares modal
    const interceptor = new ReshareNetworkInterceptor();
    interceptor.attach(page);

    // 6. Click reshare trigger to open "People who shared this" dialog
    const reshareDialog = await openResharesDialog(page, trigger);

    // 7. Locate the inner scrollable container for the reshares feed
    const { container: reshareContainer } = await findReshareScrollContainer(reshareDialog);

    // 8. Initialize tracking state
    const dedupeFilter = new DeduplicationFilter();
    let paginationState = createInitialPaginationState();
    const collectedRecords: ShareRecord[] = [];

    for (let attempt = 1; attempt <= maxScrolls; attempt++) {
      logger.scroll(attempt, maxScrolls);

      // Check if response was captured on initial modal mount, otherwise scroll reshare container
      let rawResponse: string | null = null;
      if (interceptor.hasCapturedBodies()) {
        rawResponse = await interceptor.waitForResponse(200);
      } else {
        await scrollReshares(reshareContainer, 800);
        rawResponse = await interceptor.waitForResponse(scrollDelay + 6000);
      }

      if (!rawResponse) {
        logger.debug(`[SCROLL] No pagination response received within timeout on scroll #${attempt}`);
        paginationState = updatePaginationState(paginationState, undefined, 0, maxShares, maxScrolls);
        if (paginationState.isTerminated) {
          logger.dialog(`Termination condition reached: ${paginationState.terminationReason}`);
          break;
        }
        continue;
      }

      // 9. Deserialize raw response
      const payloadChunks = parseGraphqlResponse(rawResponse);
      console.log(`[GRAPHQL] Parsed ${payloadChunks.length} response chunk`);

      for (const chunk of payloadChunks) {
        const parsed = parseReshares(chunk, postUrl, timezone);
        if (parsed.records.length === 0) continue;

        const uniqueRecords = dedupeFilter.filterBatch(parsed.records);

        for (const record of uniqueRecords) {
          collectedRecords.push(record);

          // Log formatted share record as requested
          console.log('[SHARE]');
          console.log(
            JSON.stringify(
              {
                sharerName: record.sharerName,
                sharedAtUnix: record.sharedAtUnix,
                sharedAtIso: record.sharedAtIso,
                sharePostId: record.sharePostId,
                shareUrl: record.shareUrl,
              },
              null,
              2
            )
          );

          // Push to Apify Dataset
          await Actor.pushData(record).catch(() => {});
        }

        logger.page({
          edges: parsed.records.length,
          newRecords: uniqueRecords.length,
          duplicates: parsed.records.length - uniqueRecords.length,
          hasNextPage: Boolean(parsed.pageInfo?.has_next_page),
        });

        paginationState = updatePaginationState(
          paginationState,
          parsed.pageInfo,
          uniqueRecords.length,
          maxShares,
          maxScrolls
        );
      }

      if (paginationState.isTerminated) {
        logger.dialog(`Termination condition met: ${paginationState.terminationReason}`);
        break;
      }

      await page.waitForTimeout(scrollDelay);
    }

    logger.done(collectedRecords.length, `Completed scraping for post: ${postUrl}`);
  };
}
