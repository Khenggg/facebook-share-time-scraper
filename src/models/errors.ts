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
  | 'MAX_SHARES_REACHED'
  | 'GRAPHQL_TEMPLATE_NOT_CAPTURED'
  | 'GRAPHQL_CURSOR_MISSING'
  | 'GRAPHQL_REPLAY_FAILED'
  | 'GRAPHQL_REPLAY_RETURNED_NO_DATA'
  | 'GRAPHQL_REPLAY_DUPLICATE_PAGE'
  | 'GRAPHQL_PAGINATION_LOOP_DETECTED'
  | 'COUNT_OVERRIDE_REJECTED';

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
