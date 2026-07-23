import type { RunRecord } from '@/lib/types';
import { gateReasonBurdenTrend, type GateReasonCategory } from '@/lib/aggregate';

// GateReasonsPanel の CATEGORY_LABELS と同じカテゴリ・同じ表示順（gates.py の
// evaluate_gate が理由を積む順）。2つのパネルで同じカテゴリが同じ色に見えるよう揃えている。
const CATEGORY_LABELS: Record<GateReasonCategory, string> = {
  verifyFailed: 'verify失敗',
  e2eFailed: 'e2e失敗',
  adversaryNotApproved: 'adversary未承認',
  changedLinesExceeded: '変更行数超過',
  protectedPathViolation: '保護パス変更',
  noChanges: '変更なし',
  crashed: '例外クラッシュ',
  other: 'その他',
};

const CATEGORY_ORDER = Object.keys(CATEGORY_LABELS) as GateReasonCategory[];

const CATEGORY_FILL_COLORS: Record<GateReasonCategory, string> = {
  verifyFailed: 'fill-rose-400',
  e2eFailed: 'fill-orange-400',
  adversaryNotApproved: 'fill-amber-400',
  changedLinesExceeded: 'fill-sky-400',
  protectedPathViolation: 'fill-violet-400',
  noChanges: 'fill-slate-400',
  crashed: 'fill-red-500',
  other: 'fill-emerald-400',
};

const CATEGORY_BG_COLORS: Record<GateReasonCategory, string> = {
  verifyFailed: 'bg-rose-400',
  e2eFailed: 'bg-orange-400',
  adversaryNotApproved: 'bg-amber-400',
  changedLinesExceeded: 'bg-sky-400',
  protectedPathViolation: 'bg-violet-400',
  noChanges: 'bg-slate-400',
  crashed: 'bg-red-500',
  other: 'bg-emerald-400',
};

export function GateReasonBurdenChart({ runs }: { runs: RunRecord[] }) {
  const points = gateReasonBurdenTrend(runs);
  const width = 640;
  const height = 200;
  const pad = 24;

  if (points.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-wider opacity-60">ゲート理由の時系列burden</div>
        <p className="mt-4 text-sm opacity-50">データなし</p>
      </div>
    );
  }

  const maxTotal = Math.max(...points.map((p) => p.total)) || 1;
  const plotHeight = height - pad * 2;
  const slotWidth = (width - pad * 2) / points.length;
  const barWidth = Math.min(32, slotWidth * 0.6);
  const latest = points[points.length - 1];

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5" data-testid="gate-reason-burden-chart">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">ゲート理由の時系列burden</span>
        <span className="text-sm tabular-nums opacity-80">直近iteration {latest.iteration}: {latest.total}件</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="mt-3 w-full" role="img" aria-label="ゲート理由の時系列burden">
        {points.map((p, i) => {
          const x = pad + slotWidth * i + (slotWidth - barWidth) / 2;
          let stacked = 0;
          return (
            <g key={p.iteration} data-testid={`gate-reason-burden-column-${p.iteration}`}>
              {CATEGORY_ORDER.filter((category) => p.counts[category] > 0).map((category) => {
                const count = p.counts[category];
                const y = height - pad - ((stacked + count) / maxTotal) * plotHeight;
                const segHeight = (count / maxTotal) * plotHeight;
                stacked += count;
                return (
                  <rect
                    key={category}
                    data-testid={`gate-reason-burden-bar-${p.iteration}-${category}`}
                    x={x.toFixed(1)}
                    y={y.toFixed(1)}
                    width={barWidth.toFixed(1)}
                    height={Math.max(segHeight, 0).toFixed(1)}
                    className={CATEGORY_FILL_COLORS[category]}
                  />
                );
              })}
            </g>
          );
        })}
      </svg>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] opacity-70">
        {CATEGORY_ORDER.map((category) => (
          <li key={category} className="flex items-center gap-1">
            <span className={`inline-block h-2 w-2 rounded-sm ${CATEGORY_BG_COLORS[category]}`} />
            {CATEGORY_LABELS[category]}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs opacity-60" data-testid="gate-reason-burden-iterations">
        対象iteration: {points.map((p) => p.iteration).join(', ')}
      </p>
    </div>
  );
}
