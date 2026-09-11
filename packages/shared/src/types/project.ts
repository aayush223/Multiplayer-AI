/**
 * @minge/shared — Project Domain Types
 * Invariant 1: Every entity carries a mandatory project_id for memory isolation.
 */

export interface Project {
  id: string;
  name: string;
  slug: string;
  account_type: 'individual' | 'team' | 'enterprise';
  api_key_hash: string | null;
  settings: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface ProjectCreateInput {
  name: string;
  slug: string;
  account_type?: 'individual' | 'team' | 'enterprise';
}
