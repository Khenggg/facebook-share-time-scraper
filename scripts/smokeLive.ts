import { chromium } from 'playwright';
import { openPost } from '../src/facebook/openPost.js';
import { dismissLoginModal } from '../src/facebook/dismissLoginModal.js';
import { findPostScrollContainer } from '../src/facebook/findPostScrollContainer.js';
import { scrollPostToEngagement } from '../src/facebook/scrollPostToEngagement.js';
import { openResharesDialog } from '../src/facebook/openResharesDialog.js';
import { findReshareScrollContainer } from '../src/facebook/findReshareScrollContainer.js';
import { scrollReshares } from '../src/facebook/scrollReshares.js';
import { ReshareNetworkInterceptor } from '../src/crawler/requestHandler.js';
import { parseGraphqlResponse } from '../src/graphql/parseGraphqlResponse.js';
import { parseReshares } from '../src/graphql/parseReshares.js';
import { DeduplicationFilter } from '../src/utils/deduplicate.js';
import { ShareRecord } from '../src/models/shareRecord.js';
import { logger } from '../src/utils/logger.js';

async function runLiveSmokeTest() {
  const isHeaded = process.argv.includes('--headed') || process.env.HEADED === 'true';
  const targetUrl =
    process.argv.find((arg) => arg.startsWith('http')) ||
    'https://www.facebook.com/TheYenOfficial/posts/pfbid02wsTeEnWsUxxZcFqHv7AYuRuaUnbPTRnVeDnuRJNvoM6k4DxZxhqK5JN2DYkVR6Npl';

  logger.setDebug(true);
  console.log('====================================================');
  console.log('FACEBOOK RESHARE SCRAPER - LIVE SMOKE TEST (PHASE 1)');
  console.log('Target URL:', targetUrl);
  console.log('Mode: Unauthenticated (Logged-Out, __user=0)');
  console.log('Browser GUI Mode:', isHeaded ? 'HEADED (Visible Window)' : 'HEADLESS');
  console.log('====================================================\n');

  const browser = await chromium.launch({
    headless: !isHeaded,
    slowMo: isHeaded ? 400 : 0, // Slow down operations in GUI mode so user can comfortably watch
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--lang=en-US,en',
    ],
  });

  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
    locale: 'en-US',
  });

  const page = await context.newPage();

  // Attach interceptor before opening reshares modal
  const interceptor = new ReshareNetworkInterceptor();
  interceptor.attach(page);

  const dedupe = new DeduplicationFilter();
  const collectedRecords: ShareRecord[] = [];
  let capturedGraphqlQueries = 0;

  try {
    // ==========================================
    // PHASE A — POST SCROLL & TRIGGER DISCOVERY
    // ==========================================
    const fs = await import('node:fs');
    fs.mkdirSync('screenshots', { recursive: true });

    console.log('[POST] Opening public Facebook post...');
    await openPost(page, targetUrl);
    await page.screenshot({ path: 'screenshots/01_post_loaded.png' });

    if (isHeaded) await page.waitForTimeout(1000);

    // Step 1: Dismiss login modal if present
    await dismissLoginModal(page);
    await page.screenshot({ path: 'screenshots/02_login_dismissed.png' });

    if (isHeaded) await page.waitForTimeout(1000);

    // Step 2: Identify post scroll container
    const { container: postContainer } = await findPostScrollContainer(page);

    // Step 3: Scroll post container down to engagement section
    const { trigger } = await scrollPostToEngagement(postContainer, page);
    await page.screenshot({ path: 'screenshots/03_engagement_section.png' });

    if (isHeaded) await page.waitForTimeout(1000);

    // ==========================================
    // PHASE B — RESHARE SCROLL & GRAPHQL CAPTURE
    // ==========================================
    // Step 4: Open "People who shared this" dialog
    const reshareDialog = await openResharesDialog(page, trigger);
    await page.screenshot({ path: 'screenshots/04_reshares_dialog.png' });

    if (isHeaded) await page.waitForTimeout(1000);

    // Step 5: Find scroll container specifically inside the reshares dialog
    const { container: reshareContainer } = await findReshareScrollContainer(reshareDialog);

    // Step 6: Scroll reshares container to trigger CometResharesFeedPaginationQuery
    const maxScrolls = 15;
    for (let attempt = 1; attempt <= maxScrolls; attempt++) {
      let rawResponse: string | null = null;
      if (interceptor.hasCapturedBodies()) {
        rawResponse = await interceptor.waitForResponse(200);
      } else {
        await scrollReshares(reshareContainer, 800);
        rawResponse = await interceptor.waitForResponse(6000);
      }

      await page.screenshot({ path: `screenshots/05_scroll_attempt_${attempt}.png` });

      if (!rawResponse) {
        console.log(`[SCROLL] No GraphQL pagination response received on scroll #${attempt}`);
        continue;
      }

      capturedGraphqlQueries += 1;
      const chunks = parseGraphqlResponse(rawResponse);
      console.log(`[GRAPHQL] Parsed ${chunks.length} response chunk`);

      for (const chunk of chunks) {
        const parsed = parseReshares(chunk, targetUrl, 'Asia/Ho_Chi_Minh');
        const unique = dedupe.filterBatch(parsed.records);

        for (const record of unique) {
          collectedRecords.push(record);
          console.log('\n[SHARE]');
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
        }
      }

      if (collectedRecords.length >= 2 || (attempt >= 5 && collectedRecords.length >= 1)) {
        console.log(`\n[POC SUCCESS] Target quota reached for Phase 1 PoC (${collectedRecords.length} records).`);
        break;
      }

      await page.waitForTimeout(isHeaded ? 2000 : 1000);
    }

    if (collectedRecords.length === 0) {
      throw new Error(
        `No ShareRecords were parsed. Captured ${capturedGraphqlQueries} CometResharesFeedPaginationQuery responses. Check if post has public shares or schema changed.`
      );
    }

    console.log('\n====================================================');
    console.log('LIVE SMOKE TEST RESULT: PASS');
    console.log(`- Captured CometResharesFeedPaginationQuery: ${capturedGraphqlQueries}`);
    console.log(`- Total valid ShareRecords extracted: ${collectedRecords.length}`);
    console.log(`- All records have sharedAtUnix > 0: ${collectedRecords.every((r) => r.sharedAtUnix > 0)}`);
    console.log('====================================================\n');

    if (isHeaded) {
      console.log('[GUI] Keeping browser open for 5 seconds so you can inspect the final view...');
      await page.waitForTimeout(5000);
    }

    await browser.close();
    process.exit(0);
  } catch (error) {
    console.error('\n====================================================');
    console.error('LIVE SMOKE TEST RESULT: FAIL');
    console.error('Reason:', error instanceof Error ? error.message : String(error));
    console.error('====================================================\n');
    await browser.close().catch(() => {});
    process.exit(1);
  }
}

runLiveSmokeTest();
