import type { EntityId, EntityMetadata } from './types';
const randomId = (): EntityId => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
let injectedGenerator: (() => EntityId) | undefined;
/** A new entity identifier. Production code gets a random UUID; a test can replace the source with `setIdGenerator`. */
export const newId = (): EntityId => injectedGenerator ? injectedGenerator() : randomId();
/** Replaces the identifier source (for tests) and returns a function that restores the previous one, so replacements nest. */
export function setIdGenerator(generator: () => EntityId): () => void {
  const previous = injectedGenerator;
  injectedGenerator = generator;
  return () => { injectedGenerator = previous; };
}
export const metadata = (now = new Date().toISOString()): EntityMetadata => ({ createdAt: now, updatedAt: now });
export const withUpdatedAt = <T extends EntityMetadata>(entity: T, now = new Date().toISOString()): T => ({ ...entity, updatedAt: now });
