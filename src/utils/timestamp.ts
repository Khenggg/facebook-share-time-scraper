/**
 * Timestamp formatting and timezone conversion utilities.
 */

/**
 * Formats a Unix timestamp (in seconds) to an ISO-8601 UTC string.
 * @param unixSeconds Timestamp in seconds
 */
export function formatUnixToIso(unixSeconds: number): string {
  if (typeof unixSeconds !== 'number' || isNaN(unixSeconds) || unixSeconds <= 0) {
    throw new Error(`Invalid unix timestamp: ${unixSeconds}`);
  }
  return new Date(unixSeconds * 1000).toISOString();
}

/**
 * Formats a Unix timestamp (in seconds) to a human-readable local time string using a specified IANA timezone.
 * @param unixSeconds Timestamp in seconds
 * @param timezone IANA timezone string (e.g. 'Asia/Ho_Chi_Minh', 'UTC')
 */
export function formatUnixToLocal(unixSeconds: number, timezone: string = 'Asia/Ho_Chi_Minh'): string {
  try {
    const date = new Date(unixSeconds * 1000);
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZoneName: 'short',
    });
    // Formats into YYYY-MM-DD, HH:MM:SS TZ
    return formatter.format(date);
  } catch {
    // Fallback if timezone is invalid
    return new Date(unixSeconds * 1000).toUTCString();
  }
}
