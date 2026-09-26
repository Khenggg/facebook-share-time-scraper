import * as fs from 'fs';
import * as path from 'path';
import { chromium } from 'playwright';
import { runSinglePostScrape } from '../src/crawler/runSinglePostScrape.js';
import { loadCookies } from '../src/facebook/session/cookieValidator.js';
import {
  generateComparisonReport,
  generateComparisonDiffRows,
  formatComparisonDiffCsv,
} from '../src/comparison/compareShareSets.js';
import { PlaywrightCookie, ScrapeRunResult } from '../src/models/comparison.js';

interface CliArgs {
  targetUrl: string;
  cookiesPath?: string;
  maxShares: number;
  maxRunTimeSeconds?: number;
  timezone: string;
  headless: boolean;
  mode: 'anonymous' | 'authenticated' | 'compare';
}

function parseCliArgs(): CliArgs {
  const args = process.argv.slice(2);
  let targetUrl = 'https://www.facebook.com/share/p/19ecWwfrJY/';
  let cookiesPath =
    process.env.FACEBOOK_COOKIES_FILE ||
    process.env.FACEBOOK_COOKIES_JSON ||
    './secrets/facebook-cookies.json';
  let maxShares = 5000;
  let maxRunTimeSeconds: number | undefined = 120;
  let timezone = 'Asia/Ho_Chi_Minh';
  let headless = true;
  let mode: 'anonymous' | 'authenticated' | 'compare' = 'compare';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--url' && args[i + 1]) {
      targetUrl = args[++i];
    } else if (arg === '--cookies' && args[i + 1]) {
      cookiesPath = args[++i];
    } else if (arg === '--maxShares' && args[i + 1]) {
      maxShares = parseInt(args[++i], 10);
    } else if (arg === '--maxTime' && args[i + 1]) {
      maxRunTimeSeconds = parseInt(args[++i], 10);
    } else if (arg === '--timezone' && args[i + 1]) {
      timezone = args[++i];
    } else if (arg === '--mode' && args[i + 1]) {
      mode = args[++i] as 'anonymous' | 'authenticated' | 'compare';
    } else if (arg === '--headless' && args[i + 1]) {
      headless = args[++i] !== 'false';
    } else if (arg.startsWith('http')) {
      targetUrl = arg;
    }
  }

  return {
    targetUrl,
    cookiesPath,
    maxShares,
    maxRunTimeSeconds,
    timezone,
    headless,
    mode,
  };
}

async function run() {
  const { targetUrl, cookiesPath, maxShares, maxRunTimeSeconds, timezone, headless, mode } =
    parseCliArgs();

  console.log('================================================================');
  console.log('PHASE 2 — ANONYMOUS VS COOKIE-AUTHENTICATED COMPARISON');
  console.log('Target URL:   ', targetUrl);
  console.log('Mode:         ', mode);
  console.log('Max Shares:   ', maxShares);
  console.log('Time Limit:   ', maxRunTimeSeconds ? `${maxRunTimeSeconds}s` : 'unlimited');
  console.log('================================================================\n');

  let cookies: PlaywrightCookie[] | undefined;
  if (mode === 'authenticated' || mode === 'compare') {
    if (cookiesPath && (fs.existsSync(cookiesPath) || cookiesPath.startsWith('['))) {
      try {
        cookies = loadCookies(cookiesPath);
        console.log(`[AUTH] Successfully loaded and validated ${cookies.length} cookie(s).`);
      } catch (err) {
        console.warn(`[AUTH] Warning: Failed to load cookies: ${(err as Error).message}`);
        if (mode === 'authenticated') {
          console.error('[AUTH] Aborting: Authenticated mode requires valid cookies.');
          process.exit(1);
        }
      }
    } else {
      console.warn(
        `[AUTH] Notice: No cookies found at "${cookiesPath}". Place valid Playwright cookies array in ./secrets/facebook-cookies.json to run authenticated mode.`
      );
      if (mode === 'authenticated') {
        console.error('[AUTH] Aborting: Authenticated mode requires cookies.');
        process.exit(1);
      }
    }
  }

  const browser = await chromium.launch({
    headless,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--lang=en-US,en',
    ],
  });

  try {
    let anonResult: ScrapeRunResult | undefined;
    let authResult: ScrapeRunResult | undefined;

    // 1. Run Anonymous pass
    if (mode === 'anonymous' || mode === 'compare') {
      anonResult = await runSinglePostScrape(browser, targetUrl, 'anonymous', undefined, {
        maxSharesPerPost: maxShares,
        maxRunTimeSeconds,
        timezone,
      });
    }

    // 2. Run Authenticated pass
    if ((mode === 'authenticated' || mode === 'compare') && cookies) {
      authResult = await runSinglePostScrape(browser, targetUrl, 'authenticated', cookies, {
        maxSharesPerPost: maxShares,
        maxRunTimeSeconds,
        timezone,
      });
    }

    // 3. Generate Report & Comparison
    if (anonResult && authResult) {
      console.log('\n================================================================');
      console.log('FACEBOOK RESHARE MODE COMPARISON');
      console.log('================================================================');
      console.log(`Post: ${targetUrl}\n`);

      console.log('Anonymous:');
      console.log(`  session:         ${anonResult.sessionState.verified ? 'verified logged-out' : 'failed'}`);
      console.log(`  records:         ${anonResult.records.length}`);
      console.log(`  unique sharers:  ${anonResult.uniqueSharerCount}`);
      console.log(`  pages fetched:   ${anonResult.pagesFetched}`);
      console.log(`  stop reason:     ${anonResult.stopReason}`);
      console.log(`  duration:        ${Math.round(anonResult.durationMs / 1000)}s`);

      console.log('\nAuthenticated:');
      console.log(`  session:         ${authResult.sessionState.verified ? `verified (User ID: ${authResult.sessionState.userId})` : 'failed'}`);
      console.log(`  records:         ${authResult.records.length}`);
      console.log(`  unique sharers:  ${authResult.uniqueSharerCount}`);
      console.log(`  pages fetched:   ${authResult.pagesFetched}`);
      console.log(`  stop reason:     ${authResult.stopReason}`);
      console.log(`  duration:        ${Math.round(authResult.durationMs / 1000)}s`);

      const report = generateComparisonReport(targetUrl, anonResult, authResult);

      console.log('\nComparison:');
      console.log(`  overlap:             ${report.overlapCount}`);
      console.log(`  anonymous-only:      ${report.anonymousOnlyCount}`);
      console.log(`  authenticated-only:  ${report.authenticatedOnlyCount}`);
      console.log(`  union:               ${report.unionCount}`);
      console.log(`  Jaccard similarity:  ${(report.jaccardSimilarity * 100).toFixed(2)}%`);

      console.log('\n----------------------------------------------------------------');
      console.log('RESULT:');
      if (report.authenticatedOnlyCount > report.anonymousOnlyCount) {
        console.log(
          `Authenticated session exposed ${report.authenticatedOnlyCount} records not seen in anonymous mode (and missed ${report.anonymousOnlyCount}).`
        );
      } else if (report.anonymousOnlyCount > report.authenticatedOnlyCount) {
        console.log(
          `Anonymous session exposed ${report.anonymousOnlyCount} records not seen in authenticated mode.`
        );
      } else {
        console.log('Both sessions exposed equal counts of distinct records.');
      }

      console.log('\nIMPORTANT:');
      console.log(
        'This does not prove these records are globally accessible or private.'
      );
      console.log(
        'They are account-visible records for this specific authenticated session.'
      );
      console.log('----------------------------------------------------------------\n');

      // Save sanitized report and diff CSV in artifacts/
      const artifactsDir = path.resolve(process.cwd(), 'artifacts');
      if (!fs.existsSync(artifactsDir)) {
        fs.mkdirSync(artifactsDir, { recursive: true });
      }

      const reportPath = path.join(artifactsDir, 'comparison-report.json');
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
      console.log(`[REPORT] Sanitized JSON report saved: ${reportPath}`);

      const diffRows = generateComparisonDiffRows(anonResult.records, authResult.records);
      const csvText = formatComparisonDiffCsv(diffRows);
      const csvPath = path.join(artifactsDir, 'comparison-diff.csv');
      fs.writeFileSync(csvPath, csvText, 'utf-8');
      console.log(`[REPORT] Sanitized Diff CSV saved:    ${csvPath}`);
    } else if (anonResult) {
      console.log('\n[RUN RESULT] Anonymous scrape completed successfully:');
      console.log(`  Records:        ${anonResult.records.length}`);
      console.log(`  Unique Sharers: ${anonResult.uniqueSharerCount}`);
      console.log(`  Stop Reason:    ${anonResult.stopReason}`);
      console.log(`  Duration:       ${Math.round(anonResult.durationMs / 1000)}s`);
    } else if (authResult) {
      console.log('\n[RUN RESULT] Authenticated scrape completed successfully:');
      console.log(`  Records:        ${authResult.records.length}`);
      console.log(`  Unique Sharers: ${authResult.uniqueSharerCount}`);
      console.log(`  Stop Reason:    ${authResult.stopReason}`);
      console.log(`  Duration:       ${Math.round(authResult.durationMs / 1000)}s`);
    }
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error('\n[FATAL ERROR]', (err as Error).message);
  process.exit(1);
});
