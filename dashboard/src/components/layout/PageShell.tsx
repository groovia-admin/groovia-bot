interface PageShellProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export function PageShell({ title, description, actions, children }: PageShellProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
          {description ? <p className="mt-1 text-sm text-slate-600">{description}</p> : null}
        </div>
        {actions ? <div>{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}
