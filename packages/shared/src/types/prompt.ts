/**
 * @minge/shared — Prompt Package Domain Types
 * Invariant 2: Prompts are immutable versioned packages with grounded memory IDs,
 *              model config, and outputs. Never a raw string.
 */

export interface ModelConfig {
  model: string;
  temperature: number;
  top_p: number;
  max_tokens: number;
}

export interface PromptPackage {
  id: string;
  project_id: string;
  name: string;
  branch: string;
  version: number;
  parent_id: string | null;
  system_prompt: string;
  user_template: string;
  grounded_memory_ids: string[];
  model_config: ModelConfig;
  latest_output: string | null;
  status: 'draft' | 'active' | 'merged' | 'archived';
  created_by_user_id: string;
  superseded_by_id: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export interface PromptCreateInput {
  project_id: string;
  name: string;
  branch?: string;
  parent_id?: string;
  system_prompt: string;
  user_template: string;
  grounded_memory_ids?: string[];
  model_config: ModelConfig;
  created_by_user_id: string;
}

export interface PromptUpdateInput {
  id: string;
  project_id: string;
  system_prompt?: string;
  user_template?: string;
  grounded_memory_ids?: string[];
  model_config?: ModelConfig;
  latest_output?: string;
  status?: 'draft' | 'active' | 'merged' | 'archived';
  created_by_user_id: string;
}
