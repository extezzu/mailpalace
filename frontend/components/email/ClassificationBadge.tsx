import { cn } from "@/lib/utils";
import type { Classification } from "@/lib/types";

const STYLES: Record<Classification, { bg: string; text: string; label: string }> = {
  urgent: { bg: "bg-urgent/12", text: "text-urgent", label: "Urgent" },
  important: { bg: "bg-important/15", text: "text-important", label: "Important" },
  newsletter: { bg: "bg-newsletter/15", text: "text-newsletter", label: "Newsletter" },
  promotion: { bg: "bg-promo/15", text: "text-promo", label: "Promo" },
  transactional: { bg: "bg-transactional/15", text: "text-transactional", label: "Receipt" },
  spam: { bg: "bg-text-tertiary/15", text: "text-text-tertiary", label: "Spam" },
  other: { bg: "bg-text-tertiary/12", text: "text-text-tertiary", label: "Other" },
};

const FALLBACK = STYLES.other;

interface Props {
  // The LLM is free-form, so we accept the raw string and normalise here
  // rather than rejecting a row when the model invents a slight variant
  // ("Important" vs "important", or a synonym like "advertising").
  category: string | null;
  size?: "sm" | "md";
  className?: string;
}

function lookup(category: string): { bg: string; text: string; label: string } {
  const key = category.trim().toLowerCase() as Classification;
  return STYLES[key] ?? FALLBACK;
}

export function ClassificationBadge({ category, size = "sm", className }: Props) {
  if (!category) return null;
  const s = lookup(category);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded font-mono uppercase tracking-wide",
        size === "sm" ? "px-1.5 py-0.5 text-caption" : "px-2 py-1 text-small",
        s.bg,
        s.text,
        className,
      )}
    >
      {s.label}
    </span>
  );
}
