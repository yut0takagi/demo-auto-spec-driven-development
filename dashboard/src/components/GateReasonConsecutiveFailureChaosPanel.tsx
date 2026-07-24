import type { RunRecord } from '@/lib/types';
import {
  gateReasonConsecutiveFailureChaos,
  type GateReasonCategory,
  type GateReasonConsecutiveFailureChaosLevel,
} from '@/lib/aggregate';

// GateReasonsPanel/GateReasonChainPanel と同じカテゴリ・同じ表示ラベルに揃えている。
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
const CHAOS_LEVEL_LABELS: Record<GateReasonConsecutiveFailureChaosLevel, string> = {
  stable: '固定（同じ原因が居座り）',
  mixed: '混在',
  chaotic: 'カオス（毎回原因が変わる）',
};

const CHAOS_LEVEL_TEXT_STYLES: Record<GateReasonConsecutiveFailureChaosLevel, string> = {
  stable: 'text-sky-400',
  mixed: 'text-amber-400',
  chaotic: 'text-rose-400',
};

const CHAOS_LEVEL_DOT_STYLES: Record<GateReasonConsecutiveFailureChaosLevel, string> = {
  stable: 'bg-sky-400',
  mixed: 'bg-amber-400',
  chaotic: 'bg-rose-400',
};

export function GateReasonConsecutiveFailureChaosPanel({ runs }: { runs: RunRecord[] }) {
  const streaks = gateReasonConsecutiveFailureChaos(runs);

  if (streaks.length === 0) {
    return (
      <div
        className="rounded-xl border border-white/10 bg-white/5 p-5"
        data-testid="gate-reason-consecutive-failure-chaos-panel"
      >
        <div className="text-xs uppercase tracking-wider opacity-60">
          ゲート理由の時系列カオス分析（連続非通過の根本原因パターン）
        </div>
        <p className="mt-4 text-sm opacity-50">
          データなし（gateReasonsを持つ反復が2回以上連続した区間はありません）
        </p>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl border border-white/10 bg-white/5 p-5"
      data-testid="gate-reason-consecutive-failure-chaos-panel"
    >
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">
          ゲート理由の時系列カオス分析（連続非通過の根本原因パターン）
        </span>
        <span className="text-sm tabular-nums opacity-80">{streaks.length}区間</span>
      </div>

      <ul className="mt-4 space-y-3">
        {streaks.map((streak) => (
          <li
            key={`${streak.startIteration}-${streak.endIteration}`}
            data-testid={`gate-reason-chaos-streak-${streak.startIteration}-${streak.endIteration}`}
            data-chaos-level={streak.chaosLevel}
            className="rounded-lg border border-white/10 p-3 text-sm"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="opacity-80">
                #{streak.startIteration}〜#{streak.endIteration}（{streak.length}反復連続）
              </span>
              <span
                data-testid={`gate-reason-chaos-level-${streak.startIteration}-${streak.endIteration}`}
                className={`flex shrink-0 items-center gap-1.5 font-semibold ${CHAOS_LEVEL_TEXT_STYLES[streak.chaosLevel]}`}
              >
                <span className={`inline-block h-2 w-2 rounded-full ${CHAOS_LEVEL_DOT_STYLES[streak.chaosLevel]}`} />
                {CHAOS_LEVEL_LABELS[streak.chaosLevel]}（{(streak.chaosScore * 100).toFixed(0)}%）
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1 text-xs opacity-70">
              {streak.rootCauses.map((category, i) => (
                <span key={`${streak.iterations[i]}-${category}`} className="flex items-center gap-1">
                  {i > 0 && <span aria-hidden="true">→</span>}
                  {CATEGORY_LABELS[category]}
                </span>
              ))}
            </div>
            <p className="mt-1 text-[10px] opacity-50">
              最多の根本原因: {CATEGORY_LABELS[streak.dominantRootCause]}（{streak.dominantRootCauseCount}/
              {streak.length}反復）
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
