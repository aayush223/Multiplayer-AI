/**
 * @minge/shared — CRDT Persistence Types
 * Invariant 3: Rooms scoped as ${project_id}:${document_id}, binary snapshots in Postgres.
 */

export interface CrdtSnapshot {
  id: string;
  room_id: string;
  project_id: string;
  document_id: string;
  state_vector: Buffer;
  snapshot_data: Buffer;
  created_at: Date;
}

export interface CrdtUpdate {
  id: string;
  room_id: string;
  project_id: string;
  document_id: string;
  update_data: Buffer;
  client_id: string;
  created_at: Date;
}

export interface ProxyAuditLog {
  id: string;
  project_id: string;
  user_id: string;
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  latency_ms: number;
  status_code: number;
  created_at: Date;
}
