import { Mail } from "lucide-react";

interface Props {
  title: string;
  description?: string;
  icon?: React.ElementType;
}

export function EmptyState({ title, description, icon: Icon = Mail }: Props) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-8 text-center">
      <div className="flex h-10 w-10 items-center justify-center text-text-tertiary">
        <Icon className="h-10 w-10" strokeWidth={1.25} />
      </div>
      <h2 className="text-display text-text-primary">{title}</h2>
      {description && (
        <p className="max-w-sm text-body text-text-secondary">{description}</p>
      )}
    </div>
  );
}
