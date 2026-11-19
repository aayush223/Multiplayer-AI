/**
 * @minge/shared — Memory Domain Types
 * Invariant 1: project_id is mandatory (fail-closed if missing).
 * Invariant 2: Append-only — updates create new versions via superseded_by_id.
 */

export type MemoryType =
  | 'fact'
  | 'code_snippet'
  | 'decision'
  | 'document'
  | 'conversation_turn'
  | 'custom';

export interface Memory {
  id: string;
  project_id: string;
  type: MemoryType;
  content: string;
  embedding: number[] | null;
  metadata: Record<string, unknown>;
  source_uri: string | null;
  version: number;
  superseded_by_id: string | null;
  ingested_by_user_id: string;
  created_at: Date;
  deleted_at: Date | null;
}

export interface MemoryCreateInput {
  project_id: string;
  type: MemoryType;
  content: string;
  metadata?: Record<string, unknown>;
  source_uri?: string;
  ingested_by_user_id: string;
}

export interface MemorySearchInput {
  project_id: string;
  query_embedding: number[];
  top_k?: number;
  type_filter?: MemoryType;
}

export interface MemorySupersedInput {
  original_id: string;
  project_id: string;
  content: string;
  metadata?: Record<string, unknown>;
  ingested_by_user_id: string;
}
