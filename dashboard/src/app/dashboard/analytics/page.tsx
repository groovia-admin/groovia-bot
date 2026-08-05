import { requireRole } from '@/lib/auth/require-role'

export default async function AnalyticsPage() {
  // Owner/manager can view this page; when real revenue/finance widgets are
  // added here, gate them additionally with `context.role !== 'manager'`
  // (revenue figures are owner-only per the permission matrix).
  await requireRole(['owner', 'manager'])

  return (
    <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 12, padding: 20, color: '#94a3b8', fontSize: 13 }}>
      Analytics placeholder.
    </div>
  );
}
