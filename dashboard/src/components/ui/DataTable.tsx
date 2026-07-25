interface DataTableProps {
  columns: string[];
  children: React.ReactNode;
}

export function DataTable({ columns, children }: DataTableProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            {columns.map((column) => (
              <th key={column} className="px-4 py-3 text-left font-semibold text-slate-600">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
