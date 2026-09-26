import { createHash } from 'node:crypto';
import { COMET_RESHARES_QUERY_NAME, GRAPHQL_ENDPOINT_URL } from '../constants.js';
import { ScraperError } from '../models/errors.js';

export interface GraphqlRequestTemplate {
  endpoint: string;
  body: string;
  params: Record<string, string>;
  friendlyName: string;
  docId: string | null;
  variables: Record<string, unknown>;
  capturedAt: string;
}

export interface SafeGraphqlRequestMetadata {
  friendlyName: string;
  hasDocId: boolean;
  hasLsd: boolean;
  cursorPresent: boolean;
  cursorHash: string | null;
}

/**
 * Creates a short, non-reversible SHA-256 fingerprint of a cursor string for safe diagnostic logging.
 */
export function hashCursor(cursor: string | null | undefined): string | null {
  if (!cursor || typeof cursor !== 'string') return null;
  return createHash('sha256').update(cursor).digest('hex').slice(0, 8);
}

/**
 * Returns sanitized metadata about a captured request template without logging any raw tokens or secrets.
 */
export function getSafeTemplateMetadata(template: GraphqlRequestTemplate): SafeGraphqlRequestMetadata {
  const rawCursor = template.variables?.cursor as string | undefined;
  return {
    friendlyName: template.friendlyName,
    hasDocId: Boolean(template.docId),
    hasLsd: Boolean(template.params.lsd),
    cursorPresent: Boolean(rawCursor),
    cursorHash: hashCursor(rawCursor),
  };
}

/**
 * Parses and validates raw POST form data from a captured CometResharesFeedPaginationQuery into an immutable template.
 * Throws typed ScraperError if the payload is malformed or not a valid pagination request.
 */
export function parseCapturedTemplate(
  postData: string | null | undefined,
  endpoint: string = GRAPHQL_ENDPOINT_URL
): GraphqlRequestTemplate {
  if (!postData || typeof postData !== 'string' || postData.trim() === '') {
    throw new ScraperError(
      'GRAPHQL_TEMPLATE_NOT_CAPTURED',
      'Captured GraphQL request has empty or missing POST body.'
    );
  }

  const trimmed = postData.trim();
  const searchParams = new URLSearchParams(trimmed);
  const friendlyName =
    searchParams.get('fb_api_req_friendly_name') || searchParams.get('friendly_name') || '';

  if (friendlyName !== COMET_RESHARES_QUERY_NAME) {
    throw new ScraperError(
      'GRAPHQL_TEMPLATE_NOT_CAPTURED',
      `Captured request friendly name "${friendlyName}" does not match "${COMET_RESHARES_QUERY_NAME}".`
    );
  }

  const rawVariables = searchParams.get('variables');
  if (!rawVariables) {
    throw new ScraperError(
      'GRAPHQL_TEMPLATE_NOT_CAPTURED',
      'Captured GraphQL request is missing "variables" parameter.'
    );
  }

  let variables: Record<string, unknown>;
  try {
    variables = JSON.parse(rawVariables);
    if (!variables || typeof variables !== 'object') {
      throw new Error('Variables must be a JSON object');
    }
  } catch (err) {
    throw new ScraperError(
      'GRAPHQL_TEMPLATE_NOT_CAPTURED',
      `Malformed variables JSON in captured GraphQL request: ${String(err)}`
    );
  }

  // Validate essential pagination variables
  if (!('id' in variables || 'feedbackID' in variables)) {
    throw new ScraperError(
      'GRAPHQL_TEMPLATE_NOT_CAPTURED',
      'Captured variables missing feedback identifier (id or feedbackID).'
    );
  }

  const docId = searchParams.get('doc_id') || null;
  const paramsRecord: Record<string, string> = {};
  searchParams.forEach((val, key) => {
    paramsRecord[key] = val;
  });

  return {
    endpoint,
    body: trimmed,
    params: paramsRecord,
    friendlyName,
    docId,
    variables,
    capturedAt: new Date().toISOString(),
  };
}

/**
 * Clones a captured GraphQL request template and injects a new cursor.
 * Guarantees that the original template is NOT mutated.
 *
 * @param template The captured immutable request template
 * @param nextCursor The new cursor to paginate to
 * @param countOverride Optional override for items per page
 */
export function cloneRequestWithCursor(
  template: GraphqlRequestTemplate,
  nextCursor: string,
  countOverride?: number
): { body: string; variables: Record<string, unknown> } {
  if (!nextCursor || typeof nextCursor !== 'string' || nextCursor.trim() === '') {
    throw new ScraperError(
      'GRAPHQL_CURSOR_MISSING',
      'Cannot replay pagination request without a valid nextCursor string.'
    );
  }

  // Deep clone variables
  const updatedVariables: Record<string, unknown> = {
    ...template.variables,
    cursor: nextCursor.trim(),
  };

  if (typeof countOverride === 'number' && countOverride > 0) {
    updatedVariables.count = countOverride;
  }

  // Clone URLSearchParams from original body string
  const params = new URLSearchParams(template.body);
  params.set('variables', JSON.stringify(updatedVariables));

  return {
    body: params.toString(),
    variables: updatedVariables,
  };
}
