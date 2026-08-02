import { requireRole } from '@/lib/auth/require-role'

export default async function LogsPage() {
  // Super admins see platform-wide audit logs; owners/managers see their
  // own shop's activity log. Staff has no access (matches Sidebar nav).
  await requireRole(['owner', 'manager'])

  return <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">Logs placeholder.</div>;
}
