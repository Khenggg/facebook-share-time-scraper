/**
 * Input configuration for Facebook Public Reshare Time Scraper.
 */
export interface ActorInput {
  /**
   * List of public Facebook post URLs to scrape.
   */
  postUrls: string[];

  /**
   * Maximum number of public reshares to scrape per post.
   * Default: 1000
   */
  maxSharesPerPost?: number;

  /**
   * Safety threshold on the maximum scroll actions per post.
   * Default: 1000
   */
  maxScrollAttempts?: number;

  /**
   * Delay in milliseconds between scroll actions.
   * Default: 1000
   */
  scrollDelayMs?: number;

  /**
   * IANA timezone string for formatting localized timestamps.
   * Default: "Asia/Ho_Chi_Minh"
   */
  timezone?: string;

  /**
   * Toggle verbose diagnostic logging.
   * Default: false
   */
  debug?: boolean;

  /**
   * Optional Apify proxy configuration.
   */
  proxyConfiguration?: Record<string, unknown>;

  /**
   * Run browser in headless mode.
   * Default: true
   */
  headless?: boolean;
}

