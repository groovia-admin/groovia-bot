interface BadgeProps {
  label: string;
  tone?: 'default' | 'success' | 'warning' | 'danger';
}

export function Badge({ label, tone = 'default' }: BadgeProps) {
  const styles = {
    default: 'bg-slate-100 text-slate-700',
    success: 'bg-emerald-100 text-emerald-700',
    warning: 'bg-amber-100 text-amber-700',
    danger: 'bg-rose-100 text-rose-700'
  };

  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${styles[tone]}`}>{label}</span>;
}
