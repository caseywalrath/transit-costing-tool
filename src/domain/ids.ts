import type { EntityId, EntityMetadata } from './types';
export const newId = (): EntityId => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
export const metadata = (now = new Date().toISOString()): EntityMetadata => ({ createdAt: now, updatedAt: now });
export const withUpdatedAt = <T extends EntityMetadata>(entity: T, now = new Date().toISOString()): T => ({ ...entity, updatedAt: now });
