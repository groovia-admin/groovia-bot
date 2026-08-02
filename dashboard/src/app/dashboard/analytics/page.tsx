import { requireRole } from '@/lib/auth/require-role'

export default async function AnalyticsPage() {
  // Owner/manager can view this page; when real revenue/finance widgets are
  // added here, gate them additionally with `context.role !== 'manager'`
  // (revenue figures are owner-only per the permission matrix).
  await requireRole(['owner', 'manager'])

  return <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">Analytics placeholder.</div>;
}
