import type { LoadError } from '@/lib/loadData';

export function LoadErrorBanner({ errors }: { errors: LoadError[] }) {
  if (errors.length === 0) return null;
  return (
    <section
      data-testid="load-error-banner"
      className="rounded-xl border border-rose-500/40 bg-rose-500/15 p-5 text-rose-300"
    >
      <div className="font-semibold">
        {errors.length} 件の実行記録を読み込めませんでした
      </div>
      <ul className="mt-2 space-y-1 text-sm">
        {errors.map((e) => (
          <li key={e.file} className="font-mono text-xs">
            {e.file}: {e.message}
          </li>
        ))}
      </ul>
    </section>
  );
}
