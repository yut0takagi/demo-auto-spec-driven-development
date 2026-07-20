import type { RunRecord } from '@/lib/types';

export function BacklogPanel({ runs, repoUrl }: { runs: RunRecord[]; repoUrl: string }) {
  const recent = [...runs]
    .sort((a, b) => b.iteration - a.iteration)
    .filter((run) => run.nextIssues.length > 0)
    .slice(0, 10);

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5">
      <div className="text-xs uppercase tracking-wider opacity-60">
        ループが生成した改善バックログ
      </div>
      <ul className="mt-4 space-y-2 text-sm">
        {recent.map((run) => (
          <li key={run.id} className="flex flex-wrap items-center gap-2">
            <span className="tabular-nums opacity-50">#{run.iteration} から</span>
            {run.nextIssues.map((number) => (
              <a
                key={number}
                href={`${repoUrl}/issues/${number}`}
                className="rounded-md border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 font-mono text-xs text-sky-300 hover:bg-sky-500/20"
              >
                #{number}
              </a>
            ))}
          </li>
        ))}
        {recent.length === 0 && (
          <li className="opacity-50">まだ改善 issue が生成されていません</li>
        )}
      </ul>
    </div>
  );
}
