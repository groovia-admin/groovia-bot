import { requireRole } from '@/lib/auth/require-role'

export default async function CustomersPage() {
  await requireRole(['owner', 'manager'])

  return (
    <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 12, padding: 20, color: '#94a3b8', fontSize: 13 }}>
      Customers placeholder.
    </div>
  );
}
