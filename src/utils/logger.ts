/**
 * Structured, sanitized logger for crawler operations.
 * Enforces zero-credential logging (strips cookies, auth tokens, lsd parameters).
 */

export class ScraperLogger {
  private debugMode: boolean;

  constructor(debugMode: boolean = false) {
    this.debugMode = debugMode;
  }

  public setDebug(enabled: boolean): void {
    this.debugMode = enabled;
  }

  private sanitize(message: string): string {
    // Redact cookies, tokens, lsd parameters if accidentally passed
    return message
      .replace(/(cookie|authorization|lsd|fb_dtsg|jazoest)=[^&;\s]+/gi, '$1=[REDACTED]')
      .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED]');
  }

  public post(url: string, message: string): void {
    console.log(`[POST] ${this.sanitize(url)} - ${this.sanitize(message)}`);
  }

  public dialog(message: string): void {
    console.log(`[DIALOG] ${this.sanitize(message)}`);
  }

  public graphql(message: string): void {
    console.log(`[GRAPHQL] ${this.sanitize(message)}`);
  }

  public page(details: { edges: number; newRecords: number; duplicates: number; hasNextPage: boolean }): void {
    console.log(
      `[PAGE] received ${details.edges} edges | new records: ${details.newRecords} | duplicates: ${details.duplicates} | hasNextPage: ${details.hasNextPage}`
    );
  }

  public scroll(attempt: number, maxAttempts: number): void {
    console.log(`[SCROLL] attempt ${attempt} / ${maxAttempts}`);
  }

  public done(totalRecords: number, message: string): void {
    console.log(`[DONE] ${totalRecords} public reshares collected - ${this.sanitize(message)}`);
  }

  public debug(message: string): void {
    if (this.debugMode) {
      console.log(`[DEBUG] ${this.sanitize(message)}`);
    }
  }

  public error(error: unknown, context?: string): void {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[ERROR]${context ? ` [${context}]` : ''} ${this.sanitize(errorMsg)}`);
  }
}

export const logger = new ScraperLogger(false);
