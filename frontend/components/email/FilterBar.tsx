"use client";

import type { Classification } from "@/lib/types";

/**
 * The "filter" state lives at the page level. The literal pill bar that
 * once sat above the email list is gone (auto-routing into Inbox / AI
 * buckets handles that job); this module now exists only to share the
 * `Filter` type with the sidebar and the page.
 */
export type Filter =
  | "inbox"
  | "sent"
  | "trash"
  | "urgent"
  | "important"
  | "newsletter"
  | "promotion"
  | "transactional"
  | "spam"
  | "other";

export const ACTION_REQUIRED: Classification[] = ["urgent", "important"];
