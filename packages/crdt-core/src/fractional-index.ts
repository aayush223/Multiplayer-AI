/**
 * Fractional Indexing with Deterministic Client Tie-Breaking (Invariant 4)
 *
 * Uses ASCII-ordered Base-62 digits ("0".."9", "A".."Z", "a".."z").
 * Every generated sortKey ends with a non-zero Base-61 clientId tie-breaker so:
 *  1. Two clients inserting concurrently at the exact same (prev, next) produce
 *     distinct, deterministically ordered keys strictly between prev and next.
 *  2. No generated key ever ends in '0', guaranteeing a midpoint always exists
 *     between any two distinct keys a < b.
 */

const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const BASE = DIGITS.length; // 62
const NON_ZERO_DIGITS = DIGITS.slice(1); // 61 chars ('1'..'z')

const DIGIT_INDEX = new Map<string, number>();
for (let i = 0; i < DIGITS.length; i++) {
  DIGIT_INDEX.set(DIGITS[i], i);
}

/** Deterministic code-point string comparison (locale-independent). */
export function compareCodePoints(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function getDigitIndex(key: string, pos: number): number {
  const idx = DIGIT_INDEX.get(key[pos]);
  if (idx === undefined) {
    throw new Error(`Invalid fractional index character "${key[pos]}" in key "${key}"`);
  }
  return idx;
}

/** Encode a numeric or string clientId into a short non-empty Base-61 string (never contains '0'). */
export function encodeClientTieBreaker(clientId: number | string): string {
  let value: number;
  if (typeof clientId === 'number' && Number.isFinite(clientId)) {
    value = Math.abs(Math.trunc(clientId));
  } else {
    // Deterministic 32-bit FNV-1a hash for string IDs
    let hash = 0x811c9dc5;
    const str = String(clientId);
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    value = hash;
  }

  const base = NON_ZERO_DIGITS.length;
  let out = '';
  do {
    out = NON_ZERO_DIGITS[value % base] + out;
    value = Math.floor(value / base);
  } while (value > 0);
  return out;
}

/** Compute a base midpoint strictly between prev (or -inf) and next (or +inf). */
export function midpoint(prev: string | null, next: string | null): string {
  const a = prev ?? '';
  let b = next;

  if (a.length > 0 && a[a.length - 1] === '0') {
    throw new Error(`Invalid fractional index "${a}": cannot end with '0'`);
  }
  if (b !== null) {
    if (b.length === 0 || b[b.length - 1] === '0') {
      throw new Error(`Invalid fractional index "${b}": cannot be empty or end with '0'`);
    }
    if (a.length > 0 && compareCodePoints(a, b) >= 0) {
      throw new Error(`Invalid sortKey bounds: prev ("${a}") must be strictly less than next ("${b}")`);
    }
  }

  let prefix = '';
  let i = 0;
  while (true) {
    const digitA = i < a.length ? getDigitIndex(a, i) : 0;
    const digitB = b !== null && i < b.length ? getDigitIndex(b, i) : BASE;

    if (digitB - digitA > 1) {
      const mid = Math.floor((digitA + digitB) / 2);
      return prefix + DIGITS[mid];
    }

    prefix += DIGITS[digitA];
    if (digitB - digitA === 1) {
      // Once prefix chooses digitA < digitB, any extension is guaranteed < b.
      b = null;
    }
    i++;
  }
}

/**
 * Generate a sortKey strictly between prevSortKey and nextSortKey with a
 * deterministic clientId tie-breaker suffix.
 */
export function generateSortKeyBetween(
  prevSortKey: string | null,
  nextSortKey: string | null,
  clientId: number | string
): string {
  const base = midpoint(prevSortKey, nextSortKey);
  return `${base}${encodeClientTieBreaker(clientId)}`;
}
