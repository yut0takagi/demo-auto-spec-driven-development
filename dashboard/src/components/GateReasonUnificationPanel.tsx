import type { RunRecord } from '@/lib/types';
import {
  gateReasonUnificationPatterns,
  type GateReasonCategory,
  type GateReasonUnificationPattern,
} from '@/lib/aggregate';

// GateReasonsPanel/GateReasonConsecutiveFailureChaosPanel と同じカテゴリ・同じ表示ラベルに揃えている。
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

// Record<...>で3値全てをキーとして要求するので、水準が増えたときの追加漏れをtypecheckで防ぐ。
const PATTERN_LABELS: Record<GateReasonUnificationPattern, string> = {
  'unified-from-start': '最初から単一原因',
  converged: '単一原因に収束',
  'not-unified': '収束せず（原因が入れ替わり続けた）',
};

const PATTERN_TEXT_STYLES: Record<GateReasonUnificationPattern, string> = {
  'unified-from-start': 'text-emerald-400',
  converged: 'text-sky-400',
  'not-unified': 'text-rose-400',
};

const PATTERN_DOT_STYLES: Record<GateReasonUnificationPattern, string> = {
  'unified-from-start': 'bg-emerald-400',
  converged: 'bg-sky-400',
  'not-unified': 'bg-rose-400',
};

export function GateReasonUnificationPanel({ runs }: { runs: RunRecord[] }) {
  const patterns = gateReasonUnificationPatterns(runs);

  if (patterns.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5" data-testid="gate-reason-unification-panel">
        <div className="text-xs uppercase tracking-wider opacity-60">ゲート連続失敗の理由単一化パターン認識</div>
        <p className="mt-4 text-sm opacity-50">
          データなし（gateReasonsを持つ反復が2回以上連続した区間はありません）
        </p>
      </div>
    );
  }

  const unifiedCount = patterns.filter((p) => p.pattern !== 'not-unified').length;

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5" data-testid="gate-reason-unification-panel">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">ゲート連続失敗の理由単一化パターン認識</span>
        <span className="text-sm tabular-nums opacity-80">
          {patterns.length}区間中{unifiedCount}区間が単一原因化
        </span>
      </div>

      <ul className="mt-4 space-y-3">
        {patterns.map((p) => (
          <li
            key={`${p.startIteration}-${p.endIteration}`}
            data-testid={`gate-reason-unification-streak-${p.startIteration}-${p.endIteration}`}
            data-pattern={p.pattern}
            className="rounded-lg border border-white/10 p-3 text-sm"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="opacity-80">
                #{p.startIteration}〜#{p.endIteration}（{p.length}反復連続）
              </span>
              <span
                data-testid={`gate-reason-unification-pattern-${p.startIteration}-${p.endIteration}`}
                className={`flex shrink-0 items-center gap-1.5 font-semibold ${PATTERN_TEXT_STYLES[p.pattern]}`}
              >
                <span className={`inline-block h-2 w-2 rounded-full ${PATTERN_DOT_STYLES[p.pattern]}`} />
                {PATTERN_LABELS[p.pattern]}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1 text-xs opacity-70">
              {p.rootCauses.map((category, i) => (
                <span key={`${p.iterations[i]}-${category}`} className="flex items-center gap-1">
                  {i > 0 && <span aria-hidden="true">→</span>}
                  {CATEGORY_LABELS[category]}
                </span>
              ))}
            </div>
            <p className="mt-1 text-[10px] opacity-50">
              {p.pattern === 'unified-from-start' &&
                `最初から一貫して${CATEGORY_LABELS[p.unifiedRootCause as GateReasonCategory]}が原因（${p.unifiedRunLength}反復）`}
              {p.pattern === 'converged' &&
                `#${p.unifiedSinceIteration}以降、${CATEGORY_LABELS[p.unifiedRootCause as GateReasonCategory]}に収束（${p.unifiedRunLength}反復持続）`}
              {p.pattern === 'not-unified' && '収束せず: 最後まで原因が入れ替わり続けた'}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
