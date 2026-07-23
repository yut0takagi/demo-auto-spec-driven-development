import type { RunRecord } from '@/lib/types';
import { gateReasonTrendSignal, type GateReasonCategory, type GateReasonTrendDirection } from '@/lib/aggregate';

// GateReasonsPanel/GateReasonBurdenChart の CATEGORY_LABELS と同じカテゴリ・同じ表示順
// （gates.py の evaluate_gate が理由を積む順）。3つのパネルで同じカテゴリが同じ呼称で
// 見えるよう揃えている。
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

// `Record<GateReasonTrendDirection, string>` は3値全てをキーとして要求するので、
// 契約に方向が増えたときにここへの追加漏れを typecheck で防ぐ
// （AdversaryCommentTrendPanel の DIRECTION_LABELS と同じ狙い）。
const DIRECTION_LABELS: Record<GateReasonTrendDirection, string> = {
  worsening: '悪化傾向',
  improving: '改善傾向',
  flat: '横ばい',
};

const DIRECTION_TEXT_STYLES: Record<GateReasonTrendDirection, string> = {
  worsening: 'text-rose-400',
  improving: 'text-emerald-400',
  flat: 'text-slate-400',
};

const DIRECTION_DOT_STYLES: Record<GateReasonTrendDirection, string> = {
  worsening: 'bg-rose-400',
  improving: 'bg-emerald-400',
  flat: 'bg-slate-400',
};

export function GateReasonTrendPanel({ runs }: { runs: RunRecord[] }) {
  const signal = gateReasonTrendSignal(runs);

  if (signal === null) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5" data-testid="gate-reason-trend-panel">
        <div className="text-xs uppercase tracking-wider opacity-60">ゲート不通過理由のカテゴリ別トレンド</div>
        <p className="mt-4 text-sm opacity-50">
          反復数が少なく、傾向（直近ウィンドウと直前ウィンドウの比較）はまだ判定できません。
        </p>
      </div>
    );
  }

  // 悪化/改善しているカテゴリだけ変化幅の大きい順に並べ、横ばいのカテゴリで埋もれないようにする。
  const changed = signal.categories
    .filter((c) => c.direction !== 'flat')
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5" data-testid="gate-reason-trend-panel">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">ゲート不通過理由のカテゴリ別トレンド</span>
        <span className="text-xs opacity-60">
          直近{signal.windowSize}反復 / 直前{signal.windowSize}反復 比較
        </span>
      </div>

      {changed.length === 0 ? (
        <p className="mt-4 text-sm opacity-50" data-testid="gate-reason-trend-all-flat">
          全カテゴリで有意な変化なし（横ばい）
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {changed.map((c) => (
            <li
              key={c.category}
              data-testid={`gate-reason-trend-row-${c.category}`}
              data-direction={c.direction}
              className="flex items-baseline justify-between text-sm"
            >
              <span className="flex items-center gap-1.5 opacity-80">
                <span className={`inline-block h-2 w-2 rounded-full ${DIRECTION_DOT_STYLES[c.direction]}`} />
                {CATEGORY_LABELS[c.category]}
              </span>
              <span
                data-testid={`gate-reason-trend-delta-${c.category}`}
                className={`tabular-nums font-semibold ${DIRECTION_TEXT_STYLES[c.direction]}`}
              >
                {DIRECTION_LABELS[c.direction]}（{c.previousAvgCount.toFixed(1)} → {c.recentAvgCount.toFixed(1)}件/反復）
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 text-[10px] opacity-50">
        直近: {signal.recentIterations.join(', ')} / 直前: {signal.previousIterations.join(', ')}
        {signal.partial && '（データ不足のため window 未満の反復数で計算）'}
      </p>
    </div>
  );
}
