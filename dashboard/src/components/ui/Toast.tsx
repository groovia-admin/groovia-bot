export function Toast({ message }: { message: string }) {
  return (
    <div className="fixed bottom-4 right-4 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-lg">
      <p className="text-sm text-slate-700">{message}</p>
    </div>
  );
}
