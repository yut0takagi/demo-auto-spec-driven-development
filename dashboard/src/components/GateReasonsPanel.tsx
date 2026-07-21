import type { RunRecord } from '@/lib/types';
import { unresolvedNeedsHuman } from '@/lib/aggregate';

export function GateReasonsPanel({ runs }: { runs: RunRecord[] }) {
  const run = unresolvedNeedsHuman(runs);

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5" data-testid="gate-reasons-panel">
      <div className="text-xs uppercase tracking-wider opacity-60">直近のゲート不通過理由</div>
      {run === null ? (
        <p className="mt-4 text-sm opacity-50">現在、ゲート不通過で保留中の反復はありません</p>
      ) : (
        <>
          <p className="mt-4 text-sm opacity-70">
            iteration #{run.iteration}「{run.issue.title}」
          </p>
          {run.gateReasons.length === 0 ? (
            <p className="mt-2 text-sm opacity-50">理由が記録されていません</p>
          ) : (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-300">
              {run.gateReasons.map((reason, i) => (
                <li key={`${run.iteration}-${i}`}>{reason}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
