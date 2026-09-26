/**
 * Standard typed error codes for the Facebook Public Reshare Time Scraper.
 */
export type ScraperErrorCode =
  | 'POST_NOT_PUBLIC'
  | 'POST_NOT_FOUND'
  | 'RESHARE_TRIGGER_NOT_FOUND'
  | 'RESHARE_DIALOG_NOT_OPENED'
  | 'GRAPHQL_RESPONSE_NOT_FOUND'
  | 'FACEBOOK_SCHEMA_CHANGED'
  | 'PAGINATION_STALLED'
  | 'RATE_LIMITED'
  | 'FACEBOOK_BLOCKED'
  | 'MAX_SHARES_REACHED';

/**
 * Domain-specific custom error class.
 */
export class ScraperError extends Error {
  public readonly code: ScraperErrorCode;
  public readonly actionableDetails?: string;

  constructor(code: ScraperErrorCode, message: string, actionableDetails?: string) {
    super(`[${code}] ${message}${actionableDetails ? ` - Recommendation: ${actionableDetails}` : ''}`);
    this.name = 'ScraperError';
    this.code = code;
    this.actionableDetails = actionableDetails;
  }
}
