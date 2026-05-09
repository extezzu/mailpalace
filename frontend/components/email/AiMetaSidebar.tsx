import { Sparkles } from "lucide-react";
import type { EmailListItem } from "@/lib/types";
import { ClassificationBadge } from "./ClassificationBadge";
import { LanguageFlag } from "./LanguageFlag";
import { formatRelativeTime } from "@/lib/utils";

interface Props {
  email: EmailListItem;
}

export function AiMetaSidebar({ email }: Props) {
  const ai = email.ai;
  if (!ai) {
    return (
      <aside className="hidden xl:flex w-[220px] shrink-0 flex-col gap-4 border-l border-border bg-bg px-4 py-5 text-text-secondary">
        <div className="text-caption font-mono uppercase tracking-wider text-text-tertiary">
          AI metadata
        </div>
        <p className="text-small">No AI data — triage pending.</p>
      </aside>
    );
  }

  return (
    <aside className="hidden xl:flex w-[220px] shrink-0 flex-col gap-5 border-l border-border bg-bg px-4 py-5">
      <div className="flex items-center gap-1.5 text-caption font-mono uppercase tracking-wider text-text-tertiary">
        <Sparkles className="h-3 w-3" /> Summary
      </div>
      <p className="text-body text-ai-meta">{ai.summary_ru ?? "—"}</p>

      <div className="space-y-2 border-t border-border pt-4">
        <div className="text-caption font-mono uppercase tracking-wider text-text-tertiary">
          Classification
        </div>
        <div className="flex items-center gap-2">
          <ClassificationBadge category={ai.classification} size="md" />
          {ai.confidence !== null && (
            <span className="font-mono text-caption text-text-secondary">
              {(ai.confidence * 100).toFixed(0)}%
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-small text-text-secondary">
          <span>Language</span>
          <LanguageFlag lang={ai.language} hideFor="" />
          <span className="font-mono">{ai.language ?? "—"}</span>
        </div>
      </div>

      <div className="space-y-1.5 border-t border-border pt-4">
        <div className="text-caption font-mono uppercase tracking-wider text-text-tertiary">
          Suggested action
        </div>
        <p className="text-body text-text-primary">{ai.suggested_action ?? "—"}</p>
      </div>

      <div className="mt-auto space-y-1 border-t border-border pt-4">
        <div className="text-caption font-mono uppercase tracking-wider text-text-tertiary">
          Provider
        </div>
        <p className="font-mono text-small text-text-secondary truncate" title={ai.provider ?? ""}>
          {ai.provider ?? "—"}
        </p>
        <p className="text-caption text-text-tertiary">
          {formatRelativeTime(email.received_at)} ago
        </p>
      </div>
    </aside>
  );
}
