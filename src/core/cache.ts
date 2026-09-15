import type { CacheKeyInput } from './types.js';

const encoder = new TextEncoder();

export async function cacheKey(input: CacheKeyInput): Promise<string> {
  const bytes = encoder.encode(JSON.stringify(input));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
}
