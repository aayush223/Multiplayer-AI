/**
 * @minge/shared — Application Constants
 */

/** Embedding dimension for pgvector (text-embedding-3-small) */
export const EMBEDDING_DIMENSION = 1536;

/** Default top-K for memory retrieval */
export const DEFAULT_TOP_K = 10;

/** Maximum items for batch ingestion */
export const MAX_BATCH_INGEST = 100;

/** Soft-delete recovery window in days (Terms v0.1 Section 16.3) */
export const SOFT_DELETE_RECOVERY_DAYS = 30;

/** Database schema name (Invariant 7: never public) */
export const DB_SCHEMA = 'minge';

/** CRDT room separator */
export const CRDT_ROOM_SEPARATOR = ':';

/** Build a CRDT room ID from project and document IDs */
export function buildRoomId(projectId: string, documentId: string): string {
  return `${projectId}${CRDT_ROOM_SEPARATOR}${documentId}`;
}

/** Parse a CRDT room ID into its components */
export function parseRoomId(roomId: string): { projectId: string; documentId: string } {
  const separatorIndex = roomId.indexOf(CRDT_ROOM_SEPARATOR);
  if (separatorIndex <= 0 || separatorIndex === roomId.length - 1) {
    throw new Error(`Invalid room ID format: ${roomId}`);
  }
  return {
    projectId: roomId.substring(0, separatorIndex),
    documentId: roomId.substring(separatorIndex + 1),
  };
}

/** LLM Provider identifiers */
export const LLM_PROVIDERS = {
  OPENAI: 'openai',
  GEMINI: 'gemini',
  OPENROUTER: 'openrouter',
  GROQ: 'groq',
  OLLAMA: 'ollama',
} as const;

export type LlmProvider = typeof LLM_PROVIDERS[keyof typeof LLM_PROVIDERS];
