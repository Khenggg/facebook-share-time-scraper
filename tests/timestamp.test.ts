import { describe, it, expect } from 'vitest';
import { formatUnixToIso, formatUnixToLocal } from '../src/utils/timestamp.js';

describe('Timestamp Utilities', () => {
  const sampleUnix = 1785512929;

  it('formats unix timestamp to standard ISO-8601 UTC string', () => {
    const iso = formatUnixToIso(sampleUnix);
    expect(iso).toBe('2026-07-31T15:48:49.000Z');
  });

  it('throws error on invalid unix timestamp', () => {
    expect(() => formatUnixToIso(0)).toThrow('Invalid unix timestamp');
    expect(() => formatUnixToIso(-100)).toThrow('Invalid unix timestamp');
    expect(() => formatUnixToIso(NaN)).toThrow('Invalid unix timestamp');
  });

  it('formats unix timestamp to target local timezone', () => {
    const localVn = formatUnixToLocal(sampleUnix, 'Asia/Ho_Chi_Minh');
    // Asia/Ho_Chi_Minh is UTC+7 -> 15:48:49 UTC becomes 22:48:49
    expect(localVn).toContain('22:48:49');

    const localUtc = formatUnixToLocal(sampleUnix, 'UTC');
    expect(localUtc).toContain('15:48:49');
  });

  it('gracefully falls back when invalid timezone is passed', () => {
    const fallback = formatUnixToLocal(sampleUnix, 'Invalid/Timezone_Name');
    expect(typeof fallback).toBe('string');
    expect(fallback.length).toBeGreaterThan(0);
  });
});
