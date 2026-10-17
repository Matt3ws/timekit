interface PageHeaderProps {
  title: string;
  description?: React.ReactNode;
  /** Small line above the title, e.g. the customer a project belongs to. */
  eyebrow?: React.ReactNode;
  action?: React.ReactNode;
}

/** Page title block: optional eyebrow, title, description and a right-aligned action. */
export const PageHeader = ({ title, description, eyebrow, action }: PageHeaderProps): React.JSX.Element => (
  <div className="mb-7 flex items-end justify-between gap-4">
    <div className="min-w-0">
      {eyebrow ? <div className="mb-1.5 text-sm text-muted-foreground">{eyebrow}</div> : null}
      <h1 className="truncate text-2xl font-semibold leading-tight tracking-tight">{title}</h1>
      {description ? <div className="mt-1.5 text-sm text-muted-foreground">{description}</div> : null}
    </div>
    {action ? <div className="shrink-0 pb-1">{action}</div> : null}
  </div>
);
