/**
 * Review tokens for destructive commands (review issues I-027, 4-011, 4-012).
 *
 * A review shows the planner what a deletion would remove. Its token is a fingerprint of every stored record that the deletion
 * would delete or change. The command that follows the review reads the same records again, recomputes the fingerprint, and
 * refuses to run when it differs, so nothing is removed that the planner did not see. The token is an optimistic-concurrency
 * check, not a security feature.
 */

type RecordSet = readonly { id: string }[] | { id: string } | undefined;

/** A short, stable fingerprint of the given record sets. Arrays are ordered by id, so the order a repository returns rows in does not matter. */
export function fingerprint(sets: Record<string, RecordSet>): string {
  const ordered: Record<string, unknown> = {};
  for (const key of Object.keys(sets).sort()) {
    const value = sets[key];
    ordered[key] = Array.isArray(value) ? [...value].sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)) : value ?? null;
  }
  const text = JSON.stringify(ordered);
  // cyrb53: a fast 53-bit string hash. The length is part of the token as a second check.
  let high = 0xdeadbeef;
  let low = 0x41c6ce57;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    high = Math.imul(high ^ code, 2654435761);
    low = Math.imul(low ^ code, 1597334677);
  }
  high = Math.imul(high ^ (high >>> 16), 2246822507) ^ Math.imul(low ^ (low >>> 13), 3266489909);
  low = Math.imul(low ^ (low >>> 16), 2246822507) ^ Math.imul(high ^ (high >>> 13), 3266489909);
  return `${text.length.toString(36)}-${(4294967296 * (2097151 & low) + (high >>> 0)).toString(36)}`;
}

/** A deletion was asked for with a review token that does not match the stored data: nothing was changed. */
export class DeletionReviewStaleError extends Error {
  constructor(subject: string) {
    super(`The ${subject} deletion review is out of date. Review the impact again.`);
    this.name = 'DeletionReviewStaleError';
  }
}

/** Rejects a missing token and a token that no longer matches the data. `subject` reads in the message, for example "route". */
export function assertReviewCurrent(subject: string, supplied: string | undefined, current: string): void {
  if (!supplied || supplied !== current) throw new DeletionReviewStaleError(subject);
}
