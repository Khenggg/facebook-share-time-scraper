import type { PlaywrightCrawlingContext } from 'crawlee';
import type { Page, Request as PlaywrightRequest } from 'playwright';
import { Actor } from 'apify';
import { ActorInput } from '../models/input.js';
import { ShareRecord } from '../models/shareRecord.js';
import { ScraperError } from '../models/errors.js';
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
import {
  parseCapturedTemplate,
  getSafeTemplateMetadata,
  hashCursor,
} from '../graphql/captureRequestTemplate.js';
import {
  replayPaginationRequest,
  CursorLoopDetector,
} from '../graphql/replayPagination.js';
import { DeduplicationFilter } from '../utils/deduplicate.js';
import { logger } from '../utils/logger.js';
import {
  DEFAULT_MAX_SCROLL_ATTEMPTS,
  DEFAULT_SCROLL_DELAY_MS,
  COMET_RESHARES_QUERY_NAME,
  COMET_RESHARES_DIALOG_QUERY_NAME,
} from '../constants.js';

/**
 * Captured HTTP payload pair for pagination queries.
 */
export interface CapturedPaginationPair {
  postData: string;
  responseBody: string;
}

/**
 * Coordinates event-driven network interception for Facebook Reshares GraphQL queries:
 * - CometResharesDialogQuery: Initial modal mount responses
 * - CometResharesFeedPaginationQuery: Subsequent pagination requests & responses
 */
export class ReshareNetworkInterceptor {
  private readonly pendingWaiters: Array<(pair: CapturedPaginationPair) => void> = [];
  private readonly capturedPaginationPairs: CapturedPaginationPair[] = [];
  private readonly capturedDialogBodies: string[] = [];
  private readonly observedOperationNames = new Set<string>();
  private readonly requestPostDataMap = new Map<PlaywrightRequest, string>();

  public attach(page: Page): void {
    page.on('request', (req) => {
      if (isFacebookGraphqlUrl(req.url()) && req.method() === 'POST') {
        const data = req.postData();
        if (data) {
          this.requestPostDataMap.set(req, data);
        }
      }
    });

    page.on('response', async (response) => {
      const url = response.url();
      if (!isFacebookGraphqlUrl(url)) return;

      const request = response.request();
      if (request.method() !== 'POST') return;

      const postData = this.requestPostDataMap.get(request) || request.postData() || '';
      const opInfo = identifyGraphqlOperation(postData);

      if (opInfo.friendlyName) {
        this.observedOperationNames.add(opInfo.friendlyName);
      }

      // 1. Capture initial modal dialog query
      if (opInfo.friendlyName === COMET_RESHARES_DIALOG_QUERY_NAME) {
        try {
          const rawBody = await response.text();
          this.capturedDialogBodies.push(rawBody);
        } catch (err) {
          logger.debug(`[GRAPHQL] Could not read dialog response text: ${String(err)}`);
        }
        return;
      }

      // 2. Capture pagination query (CometResharesFeedPaginationQuery)
      if (opInfo.isResharePagination || opInfo.friendlyName === COMET_RESHARES_QUERY_NAME) {
        console.log('[GRAPHQL] CometResharesFeedPaginationQuery detected');
        try {
          const responseBody = await response.text();
          const pair: CapturedPaginationPair = { postData, responseBody };

          if (this.pendingWaiters.length > 0) {
            const resolve = this.pendingWaiters.shift()!;
            resolve(pair);
          } else {
            this.capturedPaginationPairs.push(pair);
          }
        } catch (err) {
          logger.debug(`[GRAPHQL] Could not read pagination response text: ${String(err)}`);
        }
      }
    });
  }

  public getCapturedDialogBodies(): string[] {
    return [...this.capturedDialogBodies];
  }

  public getObservedOperationNames(): string[] {
    return Array.from(this.observedOperationNames);
  }

  /**
   * Bounded wait for the next captured pagination request/response pair.
   */
  public async waitForPagination(timeoutMs: number = 7000): Promise<CapturedPaginationPair | null> {
    if (this.capturedPaginationPairs.length > 0) {
      return this.capturedPaginationPairs.shift()!;
    }

    return new Promise<CapturedPaginationPair | null>((resolve) => {
      const timer = setTimeout(() => {
        const idx = this.pendingWaiters.indexOf(resolveWrapper);
        if (idx !== -1) {
          this.pendingWaiters.splice(idx, 1);
        }
        resolve(null);
      }, timeoutMs);

      const resolveWrapper = (pair: CapturedPaginationPair) => {
        clearTimeout(timer);
        resolve(pair);
      };

      this.pendingWaiters.push(resolveWrapper);
    });
  }

  /**
   * Legacy compatibility method for waiting for raw response body.
   */
  public async waitForResponse(timeoutMs: number = 7000): Promise<string | null> {
    const pair = await this.waitForPagination(timeoutMs);
    return pair?.responseBody ?? null;
  }

  public hasCapturedBodies(): boolean {
    return this.capturedPaginationPairs.length > 0;
  }

  public hasCapturedPagination(): boolean {
    return this.capturedPaginationPairs.length > 0;
  }
}

/**
 * Creates the Playwright request handler for scraping public Facebook reshares.
 * Supports:
 *   - "AUTO" (Default): Hybrid Direct GraphQL Replay with automatic UI-scroll fallback.
 *   - "HYBRID": Fast direct cursor replay without UI scrolling.
 *   - "UI_SCROLL": Traditional browser-driven UI scroll per page.
 */
export async function createRequestHandler(input: ActorInput) {
  const maxShares = input.maxSharesPerPost ?? 1000;
  const maxScrolls = input.maxScrollAttempts ?? DEFAULT_MAX_SCROLL_ATTEMPTS;
  const scrollDelay = input.scrollDelayMs ?? DEFAULT_SCROLL_DELAY_MS;
  const timezone = input.timezone ?? 'Asia/Ho_Chi_Minh';
  const paginationMode = input.paginationMode ?? 'AUTO';
  const maxRunTimeSeconds = input.maxRunTimeSeconds;

  return async (context: PlaywrightCrawlingContext) => {
    const { request, page } = context;
    const postUrl = request.url;
    const startTimeMs = Date.now();

    const isTimeLimitReached = (): boolean => {
      if (maxRunTimeSeconds && (Date.now() - startTimeMs) >= maxRunTimeSeconds * 1000) {
        logger.dialog(`[TIME_LIMIT] Reached maxRunTimeSeconds limit (${maxRunTimeSeconds}s). Gracefully stopping...`);
        return true;
      }
      return false;
    };

    logger.post(postUrl, `Opening public Facebook post (mode: ${paginationMode}${maxRunTimeSeconds ? `, timeout: ${maxRunTimeSeconds}s` : ''})...`);

    try {
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
      // PHASE B — RESHARE MODAL & INITIAL SETUP
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
      const collectedRecords: ShareRecord[] = [];

      const emitRecord = async (record: ShareRecord) => {
        collectedRecords.push(record);
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
        await Actor.pushData(record).catch(() => {});
      };

      // Allow initial modal render to dispatch CometResharesDialogQuery
      await page.waitForTimeout(1500);

      // Parse initial modal dialog responses if captured
      const initialDialogBodies = interceptor.getCapturedDialogBodies();
      for (const dialogBody of initialDialogBodies) {
        const chunks = parseGraphqlResponse(dialogBody);
        for (const chunk of chunks) {
          const parsed = parseReshares(chunk, postUrl, timezone);
          const unique = dedupeFilter.filterBatch(parsed.records);
          for (const record of unique) {
            await emitRecord(record);
            if (collectedRecords.length >= maxShares) break;
          }
          if (collectedRecords.length >= maxShares) break;
        }
        if (collectedRecords.length >= maxShares) break;
      }

      if (collectedRecords.length >= maxShares) {
        logger.done(collectedRecords.length, `Quota reached immediately from initial modal: ${postUrl}`);
        return;
      }

      // Reusable UI Scroll loop (used directly in UI_SCROLL mode or as AUTO fallback)
      const runUiScrollFallback = async (startAttempt: number) => {
        logger.dialog(`[UI_SCROLL] Executing UI scroll loop (attempts ${startAttempt} to ${maxScrolls})...`);
        let paginationState = createInitialPaginationState();

        for (let attempt = startAttempt; attempt <= maxScrolls; attempt++) {
          if (collectedRecords.length >= maxShares || isTimeLimitReached()) break;
          logger.scroll(attempt, maxScrolls);

          let rawResponse: string | null = null;
          if (interceptor.hasCapturedPagination()) {
            const pair = await interceptor.waitForPagination(200);
            rawResponse = pair?.responseBody ?? null;
          } else {
            await scrollReshares(reshareContainer, 800);
            await page.keyboard.press('PageDown').catch(() => {});
            const pair = await interceptor.waitForPagination(scrollDelay + 6000);
            rawResponse = pair?.responseBody ?? null;
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

          const payloadChunks = parseGraphqlResponse(rawResponse);
          for (const chunk of payloadChunks) {
            const parsed = parseReshares(chunk, postUrl, timezone);
            if (parsed.records.length === 0) continue;

            const uniqueRecords = dedupeFilter.filterBatch(parsed.records);
            for (const record of uniqueRecords) {
              await emitRecord(record);
              if (collectedRecords.length >= maxShares || isTimeLimitReached()) break;
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

            if (isTimeLimitReached()) break;
          }

          if (paginationState.isTerminated || collectedRecords.length >= maxShares || isTimeLimitReached()) {
            break;
          }

          await page.waitForTimeout(scrollDelay);
        }
      };

      // ==========================================
      // PHASE C — PAGINATION EXECUTION
      // ==========================================

      if (paginationMode === 'UI_SCROLL') {
        await runUiScrollFallback(1);
      } else {
        // HYBRID or AUTO mode
        logger.dialog('[HYBRID] Triggering initial UI scroll to capture GraphQL pagination template...');
        await scrollReshares(reshareContainer, 800);
        await page.keyboard.press('PageDown').catch(() => {});

        let initialPair = await interceptor.waitForPagination(
          interceptor.hasCapturedPagination() ? 500 : scrollDelay + 6000
        );

        if (!initialPair) {
          // Retry one more scroll in case timing was tight
          await scrollReshares(reshareContainer, 800);
          await page.keyboard.press('PageDown').catch(() => {});
          initialPair = await interceptor.waitForPagination(scrollDelay + 4000);
        }

        if (!initialPair) {
          if (paginationMode === 'AUTO') {
            logger.dialog('[HYBRID] Initial pagination query not detected via UI scroll. Falling back to UI_SCROLL mode.');
            await runUiScrollFallback(1);
          } else {
            throw new ScraperError(
              'GRAPHQL_TEMPLATE_NOT_CAPTURED',
              'Failed to capture CometResharesFeedPaginationQuery template after UI scroll',
              'Ensure post has enough reshares to trigger pagination or switch to paginationMode="UI_SCROLL"'
            );
          }
        } else {
          // Parse captured template
          const template = parseCapturedTemplate(initialPair.postData);
          const safeMeta = getSafeTemplateMetadata(template);
          logger.dialog(
            `[HYBRID] Captured pagination template: ${safeMeta.friendlyName} (doc_id: ${safeMeta.hasDocId}, cursorHash: ${safeMeta.cursorHash})`
          );

          // Parse Page 1 response
          const initialChunks = parseGraphqlResponse(initialPair.responseBody);
          let initialPageInfo: { has_next_page?: boolean; end_cursor?: string | null } | undefined;

          for (const chunk of initialChunks) {
            const parsed = parseReshares(chunk, postUrl, timezone);
            const unique = dedupeFilter.filterBatch(parsed.records);
            for (const record of unique) {
              await emitRecord(record);
              if (collectedRecords.length >= maxShares) break;
            }
            if (parsed.pageInfo) {
              initialPageInfo = parsed.pageInfo;
            }
            if (collectedRecords.length >= maxShares) break;
          }

          // Check if more pages exist
          let hasNextPage = Boolean(initialPageInfo?.has_next_page);
          let currentCursor = initialPageInfo?.end_cursor ?? null;

          if (hasNextPage && currentCursor && collectedRecords.length < maxShares) {
            const cursorLoopDetector = new CursorLoopDetector();
            if (template.variables.cursor && typeof template.variables.cursor === 'string') {
              cursorLoopDetector.register(template.variables.cursor);
            }
            cursorLoopDetector.register(currentCursor);

            let directIteration = 1;
            let consecutiveStalls = 0;

            while (
              hasNextPage &&
              currentCursor &&
              collectedRecords.length < maxShares &&
              directIteration < maxScrolls &&
              !isTimeLimitReached()
            ) {
              directIteration++;
              logger.dialog(
                `[HYBRID] Direct replay page #${directIteration} (cursor: ${hashCursor(currentCursor)})`
              );

              let replayedRawResponse: string;
              try {
                replayedRawResponse = await replayPaginationRequest(page, template, currentCursor);
              } catch (replayErr) {
                if (paginationMode === 'AUTO') {
                  logger.dialog(
                    `[HYBRID] Direct replay failed: ${(replayErr as Error).message}. Falling back to UI_SCROLL mode.`
                  );
                  await runUiScrollFallback(directIteration);
                  break;
                } else {
                  throw replayErr;
                }
              }

              const chunks = parseGraphqlResponse(replayedRawResponse);
              const replayedRecords: ShareRecord[] = [];
              let loopPageInfo: { has_next_page?: boolean; end_cursor?: string | null } | undefined;

              for (const chunk of chunks) {
                const parsed = parseReshares(chunk, postUrl, timezone);
                replayedRecords.push(...parsed.records);
                if (parsed.pageInfo) {
                  loopPageInfo = parsed.pageInfo;
                }
              }

              const uniqueRecords = dedupeFilter.filterBatch(replayedRecords);
              for (const record of uniqueRecords) {
                await emitRecord(record);
                if (collectedRecords.length >= maxShares || isTimeLimitReached()) break;
              }

              logger.page({
                edges: replayedRecords.length,
                newRecords: uniqueRecords.length,
                duplicates: replayedRecords.length - uniqueRecords.length,
                hasNextPage: Boolean(loopPageInfo?.has_next_page),
              });

              if (uniqueRecords.length === 0) {
                consecutiveStalls++;
                if (consecutiveStalls >= 3) {
                  logger.dialog('[HYBRID] Stalled: 3 consecutive direct replay requests returned 0 new records.');
                  break;
                }
              } else {
                consecutiveStalls = 0;
              }

              hasNextPage = Boolean(loopPageInfo?.has_next_page);
              currentCursor = loopPageInfo?.end_cursor ?? null;

              if (hasNextPage && currentCursor) {
                try {
                  cursorLoopDetector.register(currentCursor);
                } catch (loopErr) {
                  logger.dialog(`[HYBRID] Pagination loop detected: ${(loopErr as Error).message}`);
                  break;
                }
              }
            }
          }
        }
      }

      logger.done(collectedRecords.length, `Completed scraping for post: ${postUrl}`);
    } catch (err) {
      if (err instanceof ScraperError) {
        logger.error(`[${err.code}] ${err.message}`);
      } else {
        logger.error(err, `Error occurred while crawling post: ${postUrl}`);
      }
    }
  };
}
