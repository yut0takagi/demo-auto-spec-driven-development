import type { RunRecord } from '@/lib/types';
import { abandonedReasonOverrepresentation, type GateReasonCategory } from '@/lib/aggregate';

// GateReasonsPanel と同じラベル/色集合（打ち止め=abandonedに絞り込んだ内訳表示にのみ使う）。
const CATEGORY_LABELS: Record<GateReasonCategory, string> = {
  verifyFailed: 'verify失敗',
  e2eFailed: 'e2e失敗',
  adversaryNotApproved: 'adversary未承認',
  adversaryUnparseable: 'adversary出力解析不能',
  changedLinesExceeded: '変更行数超過',
  protectedPathViolation: '保護パス変更',
  noChanges: '変更なし',
  crashed: '例外クラッシュ',
  other: 'その他',
};

const CATEGORY_COLORS: Record<GateReasonCategory, string> = {
  verifyFailed: 'bg-rose-400',
  e2eFailed: 'bg-orange-400',
  adversaryNotApproved: 'bg-amber-400',
  adversaryUnparseable: 'bg-yellow-400',
  changedLinesExceeded: 'bg-sky-400',
  protectedPathViolation: 'bg-violet-400',
  noChanges: 'bg-slate-400',
  crashed: 'bg-red-500',
  other: 'bg-emerald-400',
};

const SIGNAL_LABELS: Record<'overrepresented' | 'underrepresented' | 'neutral', string> = {
  overrepresented: '全体より突出',
  underrepresented: '全体より少ない',
  neutral: '全体と同程度',
};

const SIGNAL_BADGE_COLORS: Record<'overrepresented' | 'underrepresented' | 'neutral', string> = {
  overrepresented: 'bg-rose-500/20 text-rose-300',
  underrepresented: 'bg-sky-500/20 text-sky-300',
  neutral: 'bg-white/10 text-white/50',
};

function formatDeltaPct(deltaPct: number): string {
  const sign = deltaPct >= 0 ? '+' : '';
  return `${sign}${deltaPct.toFixed(1)}pt`;
}

export function AbandonedReasonBreakdownPanel({ runs }: { runs: RunRecord[] }) {
  const breakdown = abandonedReasonOverrepresentation(runs);
  const totalCount = breakdown.reduce((sum, b) => sum + b.count, 0);

  if (breakdown.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-wider opacity-60">打ち止め（abandoned）の原因分類</div>
        <p className="mt-4 text-sm opacity-50">データなし（abandonedになった反復はありません）</p>
      </div>
    );
  }

  const topOverrepresented = breakdown
    .filter((b) => b.signal === 'overrepresented')
    .sort((a, b) => b.deltaPct - a.deltaPct)[0];

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5" data-testid="abandoned-reason-breakdown-panel">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">打ち止め（abandoned）の原因分類</span>
        <span className="text-sm tabular-nums opacity-80">{totalCount}件</span>
      </div>

      {topOverrepresented && (
        <p data-testid="abandoned-reason-top-overrepresented" className="mt-2 text-xs text-rose-300">
          ゲート不通過理由全体の分布と比べ「{CATEGORY_LABELS[topOverrepresented.category]}」が abandoned で突出して多い（
          {formatDeltaPct(topOverrepresented.deltaPct)}）
        </p>
      )}

      <ul className="mt-4 space-y-3">
        {breakdown.map((b) => {
          const pct = (b.count / totalCount) * 100;
          return (
            <li key={b.category} data-testid={`abandoned-reason-row-${b.category}`}>
              <div className="flex items-baseline justify-between text-sm">
                <span className="opacity-80">{CATEGORY_LABELS[b.category]}</span>
                <span data-testid={`abandoned-reason-count-${b.category}`} className="tabular-nums opacity-60">
                  {b.count}件 ({pct.toFixed(1)}%)
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  data-testid={`abandoned-reason-bar-${b.category}`}
                  className={`h-full ${CATEGORY_COLORS[b.category]}`}
                  style={{ width: `${pct.toFixed(2)}%` }}
                />
              </div>
              <div className="mt-1 flex items-baseline justify-between">
                <p className="text-[10px] opacity-50">対象iteration: {b.iterations.join(', ')}</p>
                <span
                  data-testid={`abandoned-reason-signal-${b.category}`}
                  className={`rounded px-1.5 py-0.5 text-[10px] ${SIGNAL_BADGE_COLORS[b.signal]}`}
                >
                  {SIGNAL_LABELS[b.signal]} ({formatDeltaPct(b.deltaPct)})
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
