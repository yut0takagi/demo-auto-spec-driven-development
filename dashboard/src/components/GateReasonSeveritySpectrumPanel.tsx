import type { RunRecord, Verdict } from '@/lib/types';
import { gateReasonSeveritySpectrum, type GateReasonCategory } from '@/lib/aggregate';

// GateReasonCostPanel等と同じカテゴリ・同じ表示ラベル。パネル間で見た目を揃えている。
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

// GateFailureTypesPanel等と同じ verdict ラベル。gateReasonSeveritySpectrum が返す tiers は
// failed/abandoned/needs-human のみだが、Record<Verdict, ...> にして Verdict の全メンバーを
// キーに要求することで、契約が増えたときの追加漏れを typecheck で防ぐ（他パネルと同じ狙い）。
const VERDICT_LABELS: Record<Verdict, string> = {
  merged: 'マージ成功',
  abandoned: '見送り（自動）',
  'needs-human': '人間対応が必要',
  paused: '一時停止',
  'dry-run': 'ドライラン',
  failed: '異常終了',
};

// severityScoreの理論上の範囲。lib/aggregate.ts の SEVERITY_TIER_VERDICTS
// (failed/abandoned/needs-human の3段階)の重み1〜3と対応させている。
const SEVERITY_SCORE_MIN = 1;
const SEVERITY_SCORE_MAX = 3;

export function GateReasonSeveritySpectrumPanel({ runs }: { runs: RunRecord[] }) {
  const spectrum = gateReasonSeveritySpectrum(runs);

  if (spectrum.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-wider opacity-60">
          ゲート理由の深刻度スペクトラム（復旧コスト分析）
        </div>
        <p className="mt-4 text-sm opacity-50">データなし</p>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl border border-white/10 bg-white/5 p-5"
      data-testid="gate-reason-severity-spectrum-panel"
    >
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">
          ゲート理由の深刻度スペクトラム（復旧コスト分析）
        </span>
        <span className="text-sm tabular-nums opacity-80">{spectrum.length}カテゴリ</span>
      </div>
      <p className="mt-1 text-[10px] opacity-50">
        同じカテゴリでも、自動で見送れた（軽度）のかクラッシュ（重度）にまでエスカレーションしたのかで
        ループが払う復旧コストは異なる。バーが長いほど、より深刻な形（クラッシュ寄り）で終わりやすい。
      </p>

      <ul className="mt-4 space-y-4">
        {spectrum.map((s) => {
          const barPct = ((s.severityScore - SEVERITY_SCORE_MIN) / (SEVERITY_SCORE_MAX - SEVERITY_SCORE_MIN)) * 100;
          return (
            <li key={s.category} data-testid={`severity-spectrum-row-${s.category}`}>
              <div className="flex items-baseline justify-between text-sm">
                <span className="opacity-80">{CATEGORY_LABELS[s.category]}</span>
                <span
                  data-testid={`severity-spectrum-score-${s.category}`}
                  className="tabular-nums opacity-60"
                >
                  深刻度 {s.severityScore.toFixed(2)}（平均${s.avgCostUsdPerRun.toFixed(2)} / {s.runCount}反復）
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  data-testid={`severity-spectrum-bar-${s.category}`}
                  className={`h-full ${CATEGORY_COLORS[s.category]}`}
                  style={{ width: `${barPct.toFixed(2)}%` }}
                />
              </div>
              <ul className="mt-2 space-y-1 pl-3">
                {s.tiers.map((t) => (
                  <li
                    key={t.verdict}
                    data-testid={`severity-spectrum-tier-${s.category}-${t.verdict}`}
                    className="flex items-baseline justify-between text-[10px] opacity-50"
                  >
                    <span>{VERDICT_LABELS[t.verdict]}</span>
                    <span>
                      {t.runCount}反復 / 平均${t.avgCostUsdPerRun.toFixed(2)} / revise平均{t.avgReviseCyclesPerRun.toFixed(1)}回
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
