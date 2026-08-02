import { requireRole } from '@/lib/auth/require-role'

export default async function CustomersPage() {
  await requireRole(['owner', 'manager'])

  return <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">Customers placeholder.</div>;
}
