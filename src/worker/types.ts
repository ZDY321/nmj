import type {
  AiScheduleDraftResponse
} from "../shared/types";


export type Env = {
  DB: D1Database;
  ASSETS: Fetcher;
  ADMIN_API_TOKEN?: string;
};

export type RegisterRequest = {
  username: string;
  passwordVerifier: string;
  passwordSalt: string;
  encryptedDataKeyByPassword: string;
  encryptedDataKeyByRecovery: string;
  encryptedPayload?: string;
};

export type LoginRequest = {
  username: string;
  passwordVerifier: string;
};

export type EncryptedDocumentRequest = {
  encryptedPayload: string;
  expectedUpdatedAt?: string | null;
  force?: boolean;
};

export type PublicSettings = {
  registrationEnabled: boolean;
};

export type FeedbackRequest = {
  title?: unknown;
  content?: unknown;
};

export type FeedbackUpdateRequest = {
  status?: unknown;
  adminNote?: unknown;
};

export type AiProviderRow = {
  id: string;
  name: string;
  provider: string;
  base_url: string;
  model: string;
  api_key: string;
  enabled: number;
  is_default: number;
  daily_limit: number;
  max_output_tokens: number;
  temperature: number;
  created_at: string;
  updated_at: string;
  last_tested_at: string | null;
  last_error: string | null;
  last_latency_ms?: number | null;
};

export type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
    delta?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
    text?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  error?: {
    message?: string;
  };
};

export type AiCallResult = {
  text: string;
  draft: unknown;
  usage?: AiScheduleDraftResponse["usage"];
};

export type UserRow = {
  id: string;
  username: string;
  password_verifier: string;
  password_salt: string;
  encrypted_data_key_by_password: string;
  encrypted_data_key_by_recovery: string;
  role: string;
  status: string;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
  delete_requested_at: string | null;
  delete_requested_by: string | null;
  delete_notice_count: number | null;
  delete_second_confirmed_at: string | null;
  delete_scheduled_at: string | null;
  delete_cancelled_at: string | null;
  delete_reason: string | null;
  deleted_at: string | null;
};

export type AuthContext = {
  tokenHash: string;
  user: UserRow;
};

export type FeedbackRow = {
  id: string;
  user_id: string | null;
  username: string;
  title: string;
  content: string;
  status: string;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
  handled_at: string | null;
  handled_by: string | null;
};

export type AdminUserNoteRow = {
  id: string;
  user_id: string;
  name: string;
  content: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

export type AdminUserNoteRequest = { name?: unknown; content?: unknown };
