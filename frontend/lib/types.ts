// TypeScript shapes mirroring the FastAPI inbox/email payloads.

export type Classification =
  | "urgent"
  | "important"
  | "newsletter"
  | "promotion"
  | "transactional"
  | "spam"
  | "other";

export interface AiBlock {
  language: string | null;
  classification: Classification | null;
  confidence: number | null;
  summary: string | null;
  summary_locale: string | null;
  suggested_action: string | null;
  provider: string | null;
}

export interface EmailListItem {
  id: number;
  account_id: number;
  thread_id: number | null;
  from_name: string | null;
  from_email: string;
  subject: string | null;
  snippet: string | null;
  received_at: string; // ISO 8601
  is_unread: boolean;
  is_starred: boolean;
  has_attachments: boolean;
  ai: AiBlock | null;
}

export interface InboxResponse {
  emails: EmailListItem[];
  next_cursor: string | null;
}

export interface ThreadMessage {
  id: number;
  from_name: string | null;
  from_email: string;
  received_at: string;
  body_text: string | null;
  body_html: string | null;
}

export interface DraftBlock {
  id: number;
  body: string;
  language: string;
  provider_used: string;
  instructions: string | null;
  created_at: string;
}

export interface EmailDetail extends EmailListItem {
  to: { name?: string; email: string }[];
  cc: { name?: string; email: string }[] | null;
  body_text: string | null;
  body_html: string | null;
  drafts: DraftBlock[];
  thread_messages: ThreadMessage[];
}
