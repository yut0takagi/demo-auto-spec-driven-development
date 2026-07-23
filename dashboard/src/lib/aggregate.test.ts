import { describe, it, expect } from 'vitest';
import {
  summarize,
  coverageTrend,
  costTrend,
  reviseCyclesTrend,
  reviseCyclesOutliers,
  reviseCyclesMedian,
  approvalRateTrend,
  mergeRateTrend,
  e2eFailureRateTrend,
  costBreakdown,
  changedLinesTrend,
  builderComparison,
  earlyWarningSignal,
  EARLY_WARNING_WINDOW,
  EARLY_WARNING_REVISE_THRESHOLD,
  EARLY_WARNING_APPROVAL_THRESHOLD,
  REVISE_CYCLES_OUTLIER_THRESHOLD,
  classifyGateReason,
  gateReasonBreakdown,
  gateReasonBurdenTrend,
  gateFailureTypeBreakdown,
  costEfficiency,
  costPerApprovedPrTrend,
  reviseCyclesByModel,
  reviseCyclesByVerdict,
  breakerRunway,
  modelEffectiveness,
  ideationFailureSummary,
  ideationFailureRateTrend,
  e2eFailureReviseCorrelation,
} from './aggregate';
import type { RunRecord } from './types';

function makeRun(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    id: '20260720T000000Z-1',
    iteration: 1,
    issue: { number: 1, title: 't', labels: [] },
    branch: 'loop/1-x',
    startedAt: '2026-07-20T00:00:00Z',
    finishedAt: '2026-07-20T00:05:00Z',
    durationSec: 300,
    reviseCycles: 0,
    verdict: 'merged',
    gateReasons: [],
    prNumber: 11,
    adversary: { approved: true, summary: '' },
    verify: { unitPassed: true, e2ePassed: true, coveragePct: 80 },
    changedLines: 10,
    cost: { builderUsd: 0.1, adversaryUsd: 0.01, ideationUsd: 0.01, totalUsd: 0.12 },
    models: { builder: 'claude-sonnet-5', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
    nextIssues: [],
    ...overrides,
  };
}

describe('summarize', () => {
  it('空配列でも NaN を出さずゼロを返す', () => {
    const s = summarize([]);
    expect(s.totalRuns).toBe(0);
    expect(s.approvalRate).toBe(0);
    expect(s.mergeRate).toBe(0);
    expect(s.avgCycleTimeSec).toBe(0);
    expect(s.avgReviseCycles).toBe(0);
    expect(s.medianReviseCycles).toBe(0);
    expect(s.totalCostUsd).toBe(0);
    expect(s.latestCoveragePct).toBe(0);
    expect(s.latestCoverageIteration).toBe(0);
    expect(s.latestCoverageStale).toBe(false);
    expect(s.latestDurationSec).toBe(0);
    expect(s.latestDurationIteration).toBe(0);
    expect(s.breakerStreak).toBe(0);
    expect(s.breakerThreshold).toBe(3);
    expect(s.breakerRemaining).toBe(3);
    expect(s.e2eFailureRate).toBe(0);
  });

  it('承認率とマージ率を別々に数える', () => {
    const runs = [
      makeRun({ iteration: 1, adversary: { approved: true, summary: '' }, verdict: 'merged' }),
      makeRun({ iteration: 2, adversary: { approved: true, summary: '' }, verdict: 'needs-human' }),
      makeRun({ iteration: 3, adversary: { approved: false, summary: '' }, verdict: 'failed' }),
      makeRun({ iteration: 4, adversary: { approved: false, summary: '' }, verdict: 'paused' }),
    ];
    const s = summarize(runs);
    expect(s.totalRuns).toBe(4);
    expect(s.mergedRuns).toBe(1);
    // iteration 3 は failed（クラッシュ）なので承認率の母集団から除外される: 2/3 (iteration 1, 2, 4)
    expect(s.approvalRate).toBeCloseTo(2 / 3);
    expect(s.mergeRate).toBeCloseTo(0.25);
  });

  it('e2e失敗率は承認率と同じ母集団（verify到達済み）で別々に数える', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', verify: { unitPassed: true, e2ePassed: true, coveragePct: 80 } }),
      makeRun({
        iteration: 2, verdict: 'failed',
        verify: { unitPassed: false, e2ePassed: false, coveragePct: 0 },
      }),
      makeRun({ iteration: 3, verdict: 'merged', verify: { unitPassed: true, e2ePassed: false, coveragePct: 80 } }),
    ];
    const s = summarize(runs);
    // iteration 2 は failed（クラッシュ）なので母集団から除外される: 1/2 (iteration 1, 3)
    expect(s.e2eFailureRate).toBeCloseTo(0.5);
  });

  it('平均と合計を計算する', () => {
    const runs = [
      makeRun({ iteration: 1, durationSec: 100, reviseCycles: 0, cost: { builderUsd: 0.1, adversaryUsd: 0, ideationUsd: 0, totalUsd: 0.1 } }),
      makeRun({ iteration: 2, durationSec: 300, reviseCycles: 2, cost: { builderUsd: 0.3, adversaryUsd: 0, ideationUsd: 0, totalUsd: 0.3 } }),
    ];
    const s = summarize(runs);
    expect(s.avgCycleTimeSec).toBe(200);
    expect(s.avgReviseCycles).toBe(1);
    expect(s.totalCostUsd).toBeCloseTo(0.4);
  });

  it('latestCoveragePct は iteration 最大の run を採用する（配列順に依存しない）', () => {
    const runs = [
      makeRun({ iteration: 5, verify: { unitPassed: true, e2ePassed: true, coveragePct: 91 } }),
      makeRun({ iteration: 2, verify: { unitPassed: true, e2ePassed: true, coveragePct: 70 } }),
    ];
    expect(summarize(runs).latestCoveragePct).toBe(91);
  });

  it('最新 iteration がクラッシュした場合、直前の測定値を採用しstaleを立てる', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', verify: { unitPassed: true, e2ePassed: true, coveragePct: 84.1 } }),
      makeRun({
        iteration: 2, verdict: 'failed', prNumber: null, changedLines: 0,
        adversary: { approved: false, summary: 'レビューに到達しなかった。' },
        verify: { unitPassed: false, e2ePassed: false, coveragePct: 0 },
      }),
    ];
    const s = summarize(runs);
    expect(s.latestCoveragePct).toBe(84.1);
    expect(s.latestCoverageIteration).toBe(1);
    expect(s.latestCoverageStale).toBe(true);
  });

  it('latestDurationSec は iteration 最大の run を採用する（配列順に依存しない）', () => {
    const runs = [
      makeRun({ iteration: 5, durationSec: 130 }),
      makeRun({ iteration: 2, durationSec: 300 }),
    ];
    const s = summarize(runs);
    expect(s.latestDurationSec).toBe(130);
    expect(s.latestDurationIteration).toBe(5);
  });

  it('durationSec は verdict に関係なく必ず記録されるため、最新 iteration が failed でも latestDurationSec に採用する（カバレッジと違い stale フォールバックしない）', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', durationSec: 700 }),
      makeRun({ iteration: 2, verdict: 'failed', durationSec: 130 }),
    ];
    const s = summarize(runs);
    expect(s.latestDurationSec).toBe(130);
    expect(s.latestDurationIteration).toBe(2);
  });

  it('クラッシュした run は平均サイクルタイムと平均revise回数の母集団から外す', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', durationSec: 700, reviseCycles: 2 }),
      makeRun({ iteration: 2, verdict: 'failed', durationSec: 100, reviseCycles: 0 }),
    ];
    const s = summarize(runs);
    expect(s.avgCycleTimeSec).toBe(700);
    expect(s.avgReviseCycles).toBe(2);
  });

  it('クラッシュした run は承認率の母集団から外すが、コストには算入する', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', adversary: { approved: true, summary: '' }, cost: { builderUsd: 0.1, adversaryUsd: 0, ideationUsd: 0, totalUsd: 0.1 } }),
      makeRun({ iteration: 2, verdict: 'failed', adversary: { approved: false, summary: 'レビューに到達しなかった。' }, cost: { builderUsd: 0.02, adversaryUsd: 0, ideationUsd: 0, totalUsd: 0.02 } }),
    ];
    const s = summarize(runs);
    expect(s.approvalRate).toBe(1);
    expect(s.totalCostUsd).toBeCloseTo(0.12);
    expect(s.totalRuns).toBe(2);
  });

  it('全 run が failed でも承認率や平均が NaN にならない', () => {
    const s = summarize([makeRun({ verdict: 'failed', adversary: { approved: false, summary: '' } })]);
    expect(s.approvalRate).toBe(0);
    expect(s.avgCycleTimeSec).toBe(0);
    expect(s.avgReviseCycles).toBe(0);
    expect(Number.isNaN(s.approvalRate)).toBe(false);
  });

  it('要素が1件でも正しく計算する', () => {
    const runs = [makeRun({ iteration: 7, durationSec: 200, cost: { builderUsd: 0.2, adversaryUsd: 0, ideationUsd: 0, totalUsd: 0.2 }, verify: { unitPassed: true, e2ePassed: true, coveragePct: 75 } })];
    const s = summarize(runs);
    expect(s.avgCycleTimeSec).toBe(200);
    expect(s.totalCostUsd).toBeCloseTo(0.2);
    expect(s.latestCoveragePct).toBe(75);
    expect(s.latestCoverageStale).toBe(false);
    expect(coverageTrend(runs)).toEqual([{ iteration: 7, value: 75 }]);
    expect(costTrend(runs)).toEqual([{ iteration: 7, value: 0.2 }]);
  });

  it('breakerStreak は最新 iteration から遡った連続 failed/needs-human 数（merged で途切れる）', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged' }),
      makeRun({ iteration: 2, verdict: 'failed' }),
      makeRun({ iteration: 3, verdict: 'needs-human' }),
    ];
    const s = summarize(runs);
    expect(s.breakerStreak).toBe(2);
    expect(s.breakerThreshold).toBe(3);
    expect(s.breakerRemaining).toBe(1);
  });

  it('abandoned（自動見送り）は failed/needs-human と同様に breakerStreak を進める', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged' }),
      makeRun({ iteration: 2, verdict: 'abandoned' }),
      makeRun({ iteration: 3, verdict: 'abandoned' }),
    ];
    const s = summarize(runs);
    expect(s.breakerStreak).toBe(2);
    expect(s.breakerRemaining).toBe(1);
  });

  it('paused は意図的な非マージであり、breakerStreak の連続をリセットする', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'failed' }),
      makeRun({ iteration: 2, verdict: 'failed' }),
      makeRun({ iteration: 3, verdict: 'paused' }),
      makeRun({ iteration: 4, verdict: 'failed' }),
    ];
    const s = summarize(runs);
    // iteration 3 (paused) で途切れるため、iteration 4 の1件のみが連続と数えられる
    expect(s.breakerStreak).toBe(1);
    expect(s.breakerRemaining).toBe(2);
  });

  it('dry-run は意図的な非マージであり、breakerStreak の連続をリセットする', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'failed' }),
      makeRun({ iteration: 2, verdict: 'failed' }),
      makeRun({ iteration: 3, verdict: 'dry-run' }),
      makeRun({ iteration: 4, verdict: 'failed' }),
    ];
    const s = summarize(runs);
    // iteration 3 (dry-run) で途切れるため、iteration 4 の1件のみが連続と数えられる
    expect(s.breakerStreak).toBe(1);
    expect(s.breakerRemaining).toBe(2);
  });

  it('連続 failed/needs-human がちょうど閾値(3)に達すると breakerRemaining は 0 になる（境界値）', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'failed' }),
      makeRun({ iteration: 2, verdict: 'needs-human' }),
      makeRun({ iteration: 3, verdict: 'failed' }),
    ];
    const s = summarize(runs);
    expect(s.breakerStreak).toBe(3);
    expect(s.breakerThreshold).toBe(3);
    expect(s.breakerRemaining).toBe(0);
  });

  it('連続 failed/needs-human が閾値(3)以上でも breakerRemaining は 0 未満にならない', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'failed' }),
      makeRun({ iteration: 2, verdict: 'needs-human' }),
      makeRun({ iteration: 3, verdict: 'failed' }),
      makeRun({ iteration: 4, verdict: 'needs-human' }),
    ];
    const s = summarize(runs);
    expect(s.breakerStreak).toBe(4);
    expect(s.breakerRemaining).toBe(0);
  });

  it('breakerStreak は配列順に依存せず iteration の時系列順で連続を数える', () => {
    const runs = [
      makeRun({ iteration: 3, verdict: 'failed' }),
      makeRun({ iteration: 1, verdict: 'failed' }),
      makeRun({ iteration: 2, verdict: 'merged' }),
    ];
    const s = summarize(runs);
    // 配列の並びは [3,1,2] だが、時系列(iteration昇順)は 1(failed) -> 2(merged) -> 3(failed)。
    // iteration 2 の merged で連続が途切れるため、最新(iteration 3)の failed 1件のみを数える。
    expect(s.breakerStreak).toBe(1);
  });
});

describe('breakerRunway', () => {
  it('run が無ければ streak 0・remaining は threshold と同じ・iterations は空', () => {
    const r = breakerRunway([]);
    expect(r.streak).toBe(0);
    expect(r.threshold).toBe(3);
    expect(r.remaining).toBe(3);
    expect(r.tripped).toBe(false);
    expect(r.iterations).toEqual([]);
  });

  it('summarize() の breakerStreak/breakerThreshold/breakerRemaining と同じ値を返す（別経路の一致）', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged' }),
      makeRun({ iteration: 2, verdict: 'failed' }),
      makeRun({ iteration: 3, verdict: 'needs-human' }),
    ];
    const s = summarize(runs);
    const r = breakerRunway(runs);
    expect(r.streak).toBe(s.breakerStreak);
    expect(r.threshold).toBe(s.breakerThreshold);
    expect(r.remaining).toBe(s.breakerRemaining);
    // 連続に含まれるのは iteration 2, 3（1 は merged で途切れているので含まない）
    expect(r.iterations).toEqual([2, 3]);
    expect(r.tripped).toBe(false);
  });

  it('連続が閾値ちょうどに達すると tripped が true になる（境界値）', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'failed' }),
      makeRun({ iteration: 2, verdict: 'needs-human' }),
      makeRun({ iteration: 3, verdict: 'failed' }),
    ];
    const r = breakerRunway(runs);
    expect(r.streak).toBe(3);
    expect(r.remaining).toBe(0);
    expect(r.tripped).toBe(true);
    expect(r.iterations).toEqual([1, 2, 3]);
  });

  it('連続が閾値を超えても remaining は負にならず、iterations は連続分すべてを含む', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'failed' }),
      makeRun({ iteration: 2, verdict: 'needs-human' }),
      makeRun({ iteration: 3, verdict: 'failed' }),
      makeRun({ iteration: 4, verdict: 'needs-human' }),
    ];
    const r = breakerRunway(runs);
    expect(r.streak).toBe(4);
    expect(r.remaining).toBe(0);
    expect(r.tripped).toBe(true);
    expect(r.iterations).toEqual([1, 2, 3, 4]);
  });

  it('paused で連続がリセットされた直後は streak 0・iterations 空（発火から一転して平常に戻る）', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'failed' }),
      makeRun({ iteration: 2, verdict: 'failed' }),
      makeRun({ iteration: 3, verdict: 'paused' }),
    ];
    const r = breakerRunway(runs);
    expect(r.streak).toBe(0);
    expect(r.remaining).toBe(3);
    expect(r.tripped).toBe(false);
    expect(r.iterations).toEqual([]);
  });

  it('iterations は配列順ではなく iteration 昇順（時系列）で並ぶ', () => {
    const runs = [
      makeRun({ iteration: 3, verdict: 'failed' }),
      makeRun({ iteration: 1, verdict: 'merged' }),
      makeRun({ iteration: 2, verdict: 'failed' }),
    ];
    const r = breakerRunway(runs);
    // 時系列: 1(merged) -> 2(failed) -> 3(failed)。1 で途切れるので 2,3 が連続。
    expect(r.streak).toBe(2);
    expect(r.iterations).toEqual([2, 3]);
  });
});

describe('coverageTrend', () => {
  it('iteration 昇順に整列して返す', () => {
    const runs = [
      makeRun({ iteration: 3, verify: { unitPassed: true, e2ePassed: true, coveragePct: 88 } }),
      makeRun({ iteration: 1, verify: { unitPassed: true, e2ePassed: true, coveragePct: 80 } }),
    ];
    expect(coverageTrend(runs)).toEqual([
      { iteration: 1, value: 80 },
      { iteration: 3, value: 88 },
    ]);
  });

  it('failed run は点として含めない（0への急落でカバレッジ崩壊に見せない）', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', verify: { unitPassed: true, e2ePassed: true, coveragePct: 84.1 } }),
      makeRun({
        iteration: 2, verdict: 'failed',
        verify: { unitPassed: false, e2ePassed: false, coveragePct: 0 },
      }),
    ];
    expect(coverageTrend(runs)).toEqual([{ iteration: 1, value: 84.1 }]);
  });

  it('costTrend は failed run のコストも含める（金は実際に消費されている）', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', cost: { builderUsd: 0, adversaryUsd: 0, ideationUsd: 0, totalUsd: 0.1 } }),
      makeRun({ iteration: 2, verdict: 'failed', cost: { builderUsd: 0, adversaryUsd: 0, ideationUsd: 0, totalUsd: 0.02 } }),
    ];
    const t = costTrend(runs);
    expect(t).toHaveLength(2);
    expect(t[1].value).toBeCloseTo(0.12);
  });
});

describe('costTrend', () => {
  it('累積コストを iteration 昇順で返す', () => {
    const runs = [
      makeRun({ iteration: 1, cost: { builderUsd: 0, adversaryUsd: 0, ideationUsd: 0, totalUsd: 0.1 } }),
      makeRun({ iteration: 2, cost: { builderUsd: 0, adversaryUsd: 0, ideationUsd: 0, totalUsd: 0.2 } }),
    ];
    const t = costTrend(runs);
    expect(t[0].value).toBeCloseTo(0.1);
    expect(t[1].value).toBeCloseTo(0.3);
  });

  it('coverageTrend/costTrend は空配列で空配列を返す', () => {
    expect(coverageTrend([])).toEqual([]);
    expect(costTrend([])).toEqual([]);
  });
});

describe('reviseCyclesMedian', () => {
  it('要素数が奇数(3件、既に昇順)なら中央の値を返す — 1件おきの平均に引きずられて off-by-one しないことを直接確認', () => {
    const runs = [
      makeRun({ iteration: 1, reviseCycles: 1 }),
      makeRun({ iteration: 2, reviseCycles: 2 }),
      makeRun({ iteration: 3, reviseCycles: 3 }),
    ];
    // [1, 2, 3] の中央値は 2（Math.floor(length/2)=1 を安易に使うと sorted[0]=1 を返す実装ミスがあり得るため明示的に確認）
    expect(reviseCyclesMedian(runs)).toBe(2);
  });

  it('要素数が1件なら、その値をそのまま返す', () => {
    const runs = [makeRun({ iteration: 1, reviseCycles: 7 })];
    expect(reviseCyclesMedian(runs)).toBe(7);
  });

  it('要素数が偶数なら中央2値の平均を返す', () => {
    const runs = [
      makeRun({ iteration: 1, reviseCycles: 0 }),
      makeRun({ iteration: 2, reviseCycles: 4 }),
    ];
    expect(reviseCyclesMedian(runs)).toBe(2);
  });

  it('failed run を除外した奇数個の母集団で正しい中央値を計算する', () => {
    // 生データ全4件をそのまま(除外なしで)ソートすると [1, 3, 5, 99] で中央値は (3+5)/2=4 になってしまう。
    // reachedVerify で failed(99) を除外すると merged の3件 [1, 3, 5] だけが残り、
    // 奇数個の中央値である 3 が正しい期待値になる。
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', reviseCycles: 1 }),
      makeRun({ iteration: 2, verdict: 'merged', reviseCycles: 5 }),
      makeRun({ iteration: 3, verdict: 'failed', reviseCycles: 99 }),
      makeRun({ iteration: 4, verdict: 'merged', reviseCycles: 3 }),
    ];
    expect(reviseCyclesMedian(runs)).toBe(3);
  });

  it('空配列では0を返す', () => {
    expect(reviseCyclesMedian([])).toBe(0);
  });
});

describe('reviseCyclesTrend / reviseCyclesOutliers', () => {
  it('iteration 昇順に revise 回数を並べる', () => {
    const runs = [
      makeRun({ iteration: 3, reviseCycles: 2 }),
      makeRun({ iteration: 1, reviseCycles: 0 }),
    ];
    expect(reviseCyclesTrend(runs)).toEqual([
      { iteration: 1, value: 0 },
      { iteration: 3, value: 2 },
    ]);
  });

  it('failed run は coverageTrend と同様に含めない', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', reviseCycles: 1 }),
      makeRun({ iteration: 2, verdict: 'failed', reviseCycles: 9 }),
    ];
    expect(reviseCyclesTrend(runs)).toEqual([{ iteration: 1, value: 1 }]);
  });

  it('閾値(3)ちょうどは外れ値に含めない境界値', () => {
    const runs = [makeRun({ iteration: 1, reviseCycles: REVISE_CYCLES_OUTLIER_THRESHOLD })];
    expect(reviseCyclesOutliers(runs)).toEqual([]);
  });

  it('閾値(3)を1でも超えると外れ値として拾う', () => {
    const runs = [makeRun({ iteration: 1, reviseCycles: REVISE_CYCLES_OUTLIER_THRESHOLD + 1 })];
    expect(reviseCyclesOutliers(runs)).toEqual([
      { iteration: 1, value: REVISE_CYCLES_OUTLIER_THRESHOLD + 1 },
    ]);
  });

  it('複数の外れ値を iteration 昇順で全て拾う', () => {
    const runs = [
      makeRun({ iteration: 1, reviseCycles: 1 }),
      makeRun({ iteration: 5, reviseCycles: 6 }),
      makeRun({ iteration: 3, reviseCycles: 4 }),
    ];
    expect(reviseCyclesOutliers(runs)).toEqual([
      { iteration: 3, value: 4 },
      { iteration: 5, value: 6 },
    ]);
  });

  it('外れ値が無ければ空配列を返す', () => {
    const runs = [makeRun({ iteration: 1, reviseCycles: 1 }), makeRun({ iteration: 2, reviseCycles: 3 })];
    expect(reviseCyclesOutliers(runs)).toEqual([]);
  });
});

describe('approvalRateTrend', () => {
  it('空配列では空配列を返す', () => {
    expect(approvalRateTrend([])).toEqual([]);
  });

  it('iteration 昇順に、その時点までの累積承認率(%)を返す', () => {
    const runs = [
      makeRun({ iteration: 1, adversary: { approved: true, summary: '' } }),
      makeRun({ iteration: 2, adversary: { approved: false, summary: '' } }),
      makeRun({ iteration: 3, adversary: { approved: true, summary: '' } }),
    ];
    // 1件目: 1/1=100%, 2件目: 1/2=50%, 3件目: 2/3≈66.7%
    expect(approvalRateTrend(runs)).toEqual([
      { iteration: 1, value: 100 },
      { iteration: 2, value: 50 },
      { iteration: 3, value: (2 / 3) * 100 },
    ]);
  });

  it('failed run は verify に到達していないため点を持たない（reviseCyclesTrend と同様）', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', adversary: { approved: true, summary: '' } }),
      makeRun({
        iteration: 2, verdict: 'failed',
        adversary: { approved: false, summary: 'レビューに到達しなかった。' },
      }),
      makeRun({ iteration: 3, verdict: 'merged', adversary: { approved: false, summary: '' } }),
    ];
    // failed(iteration 2) を除外した [approved, not-approved] の累積: 100%, 50%
    expect(approvalRateTrend(runs)).toEqual([
      { iteration: 1, value: 100 },
      { iteration: 3, value: 50 },
    ]);
  });

  it('全て非承認なら 0% が続く（境界値）', () => {
    const runs = [
      makeRun({ iteration: 1, adversary: { approved: false, summary: '' } }),
      makeRun({ iteration: 2, adversary: { approved: false, summary: '' } }),
    ];
    expect(approvalRateTrend(runs)).toEqual([
      { iteration: 1, value: 0 },
      { iteration: 2, value: 0 },
    ]);
  });

  it('最終点は summarize(runs).approvalRate * 100 と一致する', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', adversary: { approved: true, summary: '' } }),
      makeRun({
        iteration: 2, verdict: 'failed',
        adversary: { approved: false, summary: 'レビューに到達しなかった。' },
      }),
      makeRun({ iteration: 3, verdict: 'needs-human', adversary: { approved: false, summary: '' } }),
    ];
    const trend = approvalRateTrend(runs);
    const summary = summarize(runs);
    expect(trend[trend.length - 1].value).toBeCloseTo(summary.approvalRate * 100);
  });
});

describe('mergeRateTrend', () => {
  it('空配列では空配列を返す', () => {
    expect(mergeRateTrend([])).toEqual([]);
  });

  it('iteration 昇順に、その時点までの累積マージ率(%)を返す', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged' }),
      makeRun({ iteration: 2, verdict: 'needs-human' }),
      makeRun({ iteration: 3, verdict: 'merged' }),
    ];
    // 1件目: 1/1=100%, 2件目: 1/2=50%, 3件目: 2/3≈66.7%
    expect(mergeRateTrend(runs)).toEqual([
      { iteration: 1, value: 100 },
      { iteration: 2, value: 50 },
      { iteration: 3, value: (2 / 3) * 100 },
    ]);
  });

  it('costTrend と同様、failed run も verdict は必ず記録されているため点として含める', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged' }),
      makeRun({ iteration: 2, verdict: 'failed' }),
    ];
    // failed は非マージとして分母にのみ算入される: 1/2=50%
    expect(mergeRateTrend(runs)).toEqual([
      { iteration: 1, value: 100 },
      { iteration: 2, value: 50 },
    ]);
  });

  it('一件もマージされていなければ 0% が続く（境界値）', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'failed' }),
      makeRun({ iteration: 2, verdict: 'paused' }),
    ];
    expect(mergeRateTrend(runs)).toEqual([
      { iteration: 1, value: 0 },
      { iteration: 2, value: 0 },
    ]);
  });

  it('最終点は summarize(runs).mergeRate * 100 と一致する', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged' }),
      makeRun({ iteration: 2, verdict: 'failed' }),
      makeRun({ iteration: 3, verdict: 'abandoned' }),
    ];
    const trend = mergeRateTrend(runs);
    const summary = summarize(runs);
    expect(trend[trend.length - 1].value).toBeCloseTo(summary.mergeRate * 100);
  });
});

describe('e2eFailureRateTrend', () => {
  it('空配列では空配列を返す', () => {
    expect(e2eFailureRateTrend([])).toEqual([]);
  });

  it('iteration 昇順に、その時点までの累積E2E失敗率(%)を返す', () => {
    const runs = [
      makeRun({ iteration: 1, verify: { unitPassed: true, e2ePassed: true, coveragePct: 80 } }),
      makeRun({ iteration: 2, verify: { unitPassed: true, e2ePassed: false, coveragePct: 80 } }),
      makeRun({ iteration: 3, verify: { unitPassed: true, e2ePassed: false, coveragePct: 80 } }),
    ];
    // 1件目: 0/1=0%, 2件目: 1/2=50%, 3件目: 2/3≈66.7%
    expect(e2eFailureRateTrend(runs)).toEqual([
      { iteration: 1, value: 0 },
      { iteration: 2, value: 50 },
      { iteration: 3, value: (2 / 3) * 100 },
    ]);
  });

  it('failed run は verify に到達しておらず e2ePassed が sentinel なので点を持たない（approvalRateTrend と同様）', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', verify: { unitPassed: true, e2ePassed: true, coveragePct: 80 } }),
      makeRun({
        iteration: 2, verdict: 'failed',
        verify: { unitPassed: false, e2ePassed: false, coveragePct: 0 },
      }),
      makeRun({ iteration: 3, verdict: 'merged', verify: { unitPassed: true, e2ePassed: false, coveragePct: 80 } }),
    ];
    // failed(iteration 2) を除外した [passed, failed] の累積: 0%, 50%
    expect(e2eFailureRateTrend(runs)).toEqual([
      { iteration: 1, value: 0 },
      { iteration: 3, value: 50 },
    ]);
  });

  it('全て成功なら 0% が続く（境界値）', () => {
    const runs = [
      makeRun({ iteration: 1, verify: { unitPassed: true, e2ePassed: true, coveragePct: 80 } }),
      makeRun({ iteration: 2, verify: { unitPassed: true, e2ePassed: true, coveragePct: 80 } }),
    ];
    expect(e2eFailureRateTrend(runs)).toEqual([
      { iteration: 1, value: 0 },
      { iteration: 2, value: 0 },
    ]);
  });

  it('全て失敗なら 100% が続く（境界値）', () => {
    const runs = [
      makeRun({ iteration: 1, verify: { unitPassed: true, e2ePassed: false, coveragePct: 80 } }),
      makeRun({ iteration: 2, verify: { unitPassed: true, e2ePassed: false, coveragePct: 80 } }),
    ];
    expect(e2eFailureRateTrend(runs)).toEqual([
      { iteration: 1, value: 100 },
      { iteration: 2, value: 100 },
    ]);
  });

  it('連続する failed run は点も分母も増やさず、直前の点をまたいで次の測定済み run が分母を引き継ぐ（中間・最終点で検証）', () => {
    const runs = [
      // iteration 1: 測定済み・成功 → 1点目 0/1=0%
      makeRun({ iteration: 1, verdict: 'merged', verify: { unitPassed: true, e2ePassed: true, coveragePct: 80 } }),
      // iteration 2,3: 連続 failed。verify 未到達なので点を持たず、分母(completed.length)も増えない
      makeRun({
        iteration: 2, verdict: 'failed',
        verify: { unitPassed: false, e2ePassed: false, coveragePct: 0 },
      }),
      makeRun({
        iteration: 3, verdict: 'failed',
        verify: { unitPassed: false, e2ePassed: false, coveragePct: 0 },
      }),
      // iteration 4: 測定済み・失敗 → もし failed が分母に紛れ込んでいれば 1/4=25% になるが、
      // 正しくは failed 2件を無視した 1/2=50%（2点目、中間点）
      makeRun({ iteration: 4, verdict: 'merged', verify: { unitPassed: true, e2ePassed: false, coveragePct: 80 } }),
      // iteration 5: 測定済み・成功 → 1/3≈33.3%（3点目、最終点）
      makeRun({ iteration: 5, verdict: 'merged', verify: { unitPassed: true, e2ePassed: true, coveragePct: 80 } }),
    ];
    const trend = e2eFailureRateTrend(runs);
    // 連続 failed の 2件は点を持たないため、trend は測定済み3件分のみ
    expect(trend).toHaveLength(3);
    expect(trend[0]).toEqual({ iteration: 1, value: 0 });
    // 中間点: failed をまたいでも分母は「測定済み run 数」であり iteration 数ではない
    expect(trend[1]).toEqual({ iteration: 4, value: 50 });
    expect(trend[2].iteration).toBe(5);
    expect(trend[2].value).toBeCloseTo((1 / 3) * 100);
  });

  it('全run が failed（verify 未到達）なら空配列を返す', () => {
    const runs = [makeRun({ iteration: 1, verdict: 'failed', verify: { unitPassed: false, e2ePassed: false, coveragePct: 0 } })];
    expect(e2eFailureRateTrend(runs)).toEqual([]);
  });

  it('最終点は summarize(runs).e2eFailureRate * 100 と一致する（trend と summarize は別々の計算経路）', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', verify: { unitPassed: true, e2ePassed: true, coveragePct: 80 } }),
      makeRun({
        iteration: 2, verdict: 'failed',
        verify: { unitPassed: false, e2ePassed: false, coveragePct: 0 },
      }),
      makeRun({ iteration: 3, verdict: 'needs-human', verify: { unitPassed: true, e2ePassed: false, coveragePct: 80 } }),
    ];
    const trend = e2eFailureRateTrend(runs);
    const summary = summarize(runs);
    expect(trend[trend.length - 1].value).toBeCloseTo(summary.e2eFailureRate * 100);
  });
});

describe('costBreakdown', () => {
  it('空配列では totalUsd=0、byRole は3ロール分すべて0、byModel は空配列を返す（NaN を出さない）', () => {
    const b = costBreakdown([]);
    expect(b.totalUsd).toBe(0);
    expect(b.byRole.map((r) => r.role)).toEqual(['builder', 'adversary', 'ideation']);
    for (const r of b.byRole) {
      expect(r.totalUsd).toBe(0);
      expect(r.pct).toBe(0);
    }
    expect(b.byModel).toEqual([]);
  });

  it('ロールごとの合計とパーセンテージを計算し、常に builder→adversary→ideation の順で返す', () => {
    const runs = [
      makeRun({
        iteration: 1,
        cost: { builderUsd: 0.6, adversaryUsd: 0.3, ideationUsd: 0.1, totalUsd: 1.0 },
        models: { builder: 'model-a', adversary: 'model-b', ideation: 'model-b' },
      }),
    ];
    const b = costBreakdown(runs);
    expect(b.totalUsd).toBeCloseTo(1.0);
    expect(b.byRole.map((r) => r.role)).toEqual(['builder', 'adversary', 'ideation']);
    expect(b.byRole[0].totalUsd).toBeCloseTo(0.6);
    expect(b.byRole[0].pct).toBeCloseTo(60);
    expect(b.byRole[1].totalUsd).toBeCloseTo(0.3);
    expect(b.byRole[1].pct).toBeCloseTo(30);
    expect(b.byRole[2].totalUsd).toBeCloseTo(0.1);
    expect(b.byRole[2].pct).toBeCloseTo(10);
    // 内訳の合計は totalUsd の100%と一致するはず
    expect(b.byRole.reduce((s, r) => s + r.pct, 0)).toBeCloseTo(100);
  });

  it('同じモデルが複数ロール（adversary と ideation）で使われている場合は合算する', () => {
    const runs = [
      makeRun({
        iteration: 1,
        cost: { builderUsd: 0.5, adversaryUsd: 0.2, ideationUsd: 0.1, totalUsd: 0.8 },
        models: { builder: 'model-a', adversary: 'model-b', ideation: 'model-b' },
      }),
    ];
    const b = costBreakdown(runs);
    // model-b は adversary(0.2) + ideation(0.1) = 0.3 に合算される。model-a は別エントリ
    expect(b.byModel).toHaveLength(2);
    expect(b.byModel[0].model).toBe('model-a');
    expect(b.byModel[0].totalUsd).toBeCloseTo(0.5);
    expect(b.byModel[0].pct).toBeCloseTo(62.5);
    expect(b.byModel[1].model).toBe('model-b');
    expect(b.byModel[1].totalUsd).toBeCloseTo(0.3);
    expect(b.byModel[1].pct).toBeCloseTo(37.5);
  });

  it('複数 run にまたがるコストをモデル単位で積算し、totalUsd 降順で返す', () => {
    const runs = [
      makeRun({
        iteration: 1,
        cost: { builderUsd: 0.1, adversaryUsd: 0.05, ideationUsd: 0.05, totalUsd: 0.2 },
        models: { builder: 'model-a', adversary: 'model-c', ideation: 'model-c' },
      }),
      makeRun({
        iteration: 2,
        cost: { builderUsd: 0.3, adversaryUsd: 0.05, ideationUsd: 0.05, totalUsd: 0.4 },
        models: { builder: 'model-a', adversary: 'model-c', ideation: 'model-c' },
      }),
    ];
    const b = costBreakdown(runs);
    // model-a: 0.1+0.3=0.4, model-c: (0.05+0.05)+(0.05+0.05)=0.2, totalUsd=0.6
    expect(b.totalUsd).toBeCloseTo(0.6);
    expect(b.byModel[0].model).toBe('model-a');
    expect(b.byModel[0].totalUsd).toBeCloseTo(0.4);
    expect(b.byModel[1].model).toBe('model-c');
    expect(b.byModel[1].totalUsd).toBeCloseTo(0.2);
  });

  it('costTrend と同様、failed run のコストも含める（金は実際に消費されている）', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', cost: { builderUsd: 0.1, adversaryUsd: 0, ideationUsd: 0, totalUsd: 0.1 } }),
      makeRun({ iteration: 2, verdict: 'failed', cost: { builderUsd: 0.02, adversaryUsd: 0, ideationUsd: 0, totalUsd: 0.02 } }),
    ];
    const b = costBreakdown(runs);
    expect(b.totalUsd).toBeCloseTo(0.12);
  });

  it('byModel の合計は Summary.totalCostUsd と一致する（別々の計算経路の突き合わせ）', () => {
    const runs = [
      makeRun({
        iteration: 1,
        cost: { builderUsd: 0.4, adversaryUsd: 0.2, ideationUsd: 0.1, totalUsd: 0.7 },
        models: { builder: 'model-a', adversary: 'model-b', ideation: 'model-a' },
      }),
      makeRun({
        iteration: 2,
        cost: { builderUsd: 0.15, adversaryUsd: 0.05, ideationUsd: 0.05, totalUsd: 0.25 },
        models: { builder: 'model-b', adversary: 'model-b', ideation: 'model-a' },
      }),
    ];
    const b = costBreakdown(runs);
    const summary = summarize(runs);
    const modelSum = b.byModel.reduce((s, m) => s + m.totalUsd, 0);
    expect(modelSum).toBeCloseTo(summary.totalCostUsd);
    expect(b.totalUsd).toBeCloseTo(summary.totalCostUsd);
  });
});

describe('changedLinesTrend', () => {
  it('空配列では空配列を返す', () => {
    expect(changedLinesTrend([])).toEqual([]);
  });

  it('iteration 昇順に変更行数を並べる', () => {
    const runs = [
      makeRun({ iteration: 3, changedLines: 88 }),
      makeRun({ iteration: 1, changedLines: 20 }),
    ];
    expect(changedLinesTrend(runs)).toEqual([
      { iteration: 1, value: 20 },
      { iteration: 3, value: 88 },
    ]);
  });

  it('failed run は coverageTrend と同様に点として含めない（sentinel 0 への急落に見せない）', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', changedLines: 120 }),
      makeRun({ iteration: 2, verdict: 'failed', changedLines: 0 }),
    ];
    expect(changedLinesTrend(runs)).toEqual([{ iteration: 1, value: 120 }]);
  });
});

describe('builderComparison', () => {
  it('空配列では null を返す', () => {
    expect(builderComparison([])).toBeNull();
  });

  it('測定済み(verify到達済み) run が1件だけなら比較対象が無いため null を返す', () => {
    const runs = [makeRun({ iteration: 1 })];
    expect(builderComparison(runs)).toBeNull();
  });

  it('failed run を除外した結果、測定済みが1件しか残らない場合も null を返す（境界値）', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged' }),
      makeRun({ iteration: 2, verdict: 'failed' }),
    ];
    expect(builderComparison(runs)).toBeNull();
  });

  it('直近2件の測定済み iteration を比較し、各指標の delta と改善方向を正しく判定する', () => {
    const runs = [
      makeRun({
        iteration: 1,
        reviseCycles: 2,
        changedLines: 429,
        verify: { unitPassed: true, e2ePassed: true, coveragePct: 70 },
        cost: { builderUsd: 6.9, adversaryUsd: 0, ideationUsd: 0, totalUsd: 6.9 },
      }),
      makeRun({
        iteration: 2,
        reviseCycles: 1,
        changedLines: 59,
        verify: { unitPassed: true, e2ePassed: true, coveragePct: 80 },
        cost: { builderUsd: 3.4, adversaryUsd: 0, ideationUsd: 0, totalUsd: 3.4 },
      }),
    ];
    const c = builderComparison(runs);
    expect(c).not.toBeNull();
    expect(c!.previousIteration).toBe(1);
    expect(c!.currentIteration).toBe(2);

    const byKey = Object.fromEntries(c!.metrics.map((m) => [m.key, m]));
    // revise回数・変更行数・builderコストは減少 = 改善（lower-is-better）
    expect(byKey.reviseCycles).toMatchObject({ previous: 2, current: 1, delta: -1, verdict: 'improved' });
    expect(byKey.changedLines).toMatchObject({ previous: 429, current: 59, delta: -370, verdict: 'improved' });
    expect(byKey.builderUsd.verdict).toBe('improved');
    expect(byKey.builderUsd.delta).toBeCloseTo(-3.5);
    // カバレッジは上昇 = 改善（higher-is-better）
    expect(byKey.coveragePct).toMatchObject({ previous: 70, current: 80, delta: 10, verdict: 'improved' });
  });

  it('値が悪化した場合は regressed、変化が無い場合は unchanged を返す', () => {
    const runs = [
      makeRun({
        iteration: 1,
        reviseCycles: 0,
        changedLines: 50,
        verify: { unitPassed: true, e2ePassed: true, coveragePct: 90 },
        cost: { builderUsd: 1, adversaryUsd: 0, ideationUsd: 0, totalUsd: 1 },
      }),
      makeRun({
        iteration: 2,
        reviseCycles: 3,
        changedLines: 50,
        verify: { unitPassed: true, e2ePassed: true, coveragePct: 60 },
        cost: { builderUsd: 2, adversaryUsd: 0, ideationUsd: 0, totalUsd: 2 },
      }),
    ];
    const c = builderComparison(runs);
    const byKey = Object.fromEntries(c!.metrics.map((m) => [m.key, m]));
    // revise回数増加・カバレッジ低下・コスト増加は悪化
    expect(byKey.reviseCycles.verdict).toBe('regressed');
    expect(byKey.coveragePct.verdict).toBe('regressed');
    expect(byKey.builderUsd.verdict).toBe('regressed');
    // 変更行数は同一値 → 変化なし
    expect(byKey.changedLines).toMatchObject({ delta: 0, verdict: 'unchanged' });
  });

  it('failed run を除外したうえで直近2件（時系列順）を比較する。配列順や中間の failed に依存しない', () => {
    const runs = [
      makeRun({ iteration: 4, verdict: 'merged', reviseCycles: 1, changedLines: 10 }),
      makeRun({ iteration: 1, verdict: 'merged', reviseCycles: 5, changedLines: 200 }),
      makeRun({ iteration: 3, verdict: 'failed', reviseCycles: 9, changedLines: 0 }),
      makeRun({ iteration: 2, verdict: 'merged', reviseCycles: 2, changedLines: 100 }),
    ];
    const c = builderComparison(runs);
    // 時系列(iteration昇順)の測定済みは [1,2,4]。failed(3)を除外した直近2件は iteration 2 → 4
    expect(c!.previousIteration).toBe(2);
    expect(c!.currentIteration).toBe(4);
    const byKey = Object.fromEntries(c!.metrics.map((m) => [m.key, m]));
    expect(byKey.reviseCycles).toMatchObject({ previous: 2, current: 1 });
    expect(byKey.changedLines).toMatchObject({ previous: 100, current: 10 });
  });
});

describe('earlyWarningSignal', () => {
  it('空配列では null を返す', () => {
    expect(earlyWarningSignal([])).toBeNull();
  });

  it('reachedVerify な run が1件も無ければ null を返す（全件 failed）', () => {
    const runs = [makeRun({ iteration: 1, verdict: 'failed' })];
    expect(earlyWarningSignal(runs)).toBeNull();
  });

  it('高revise・低承認が揃うと critical になる', () => {
    // 直近3反復: 平均revise = (3+3+3)/3 = 3 (>2 の閾値超え)、承認率 = 0/3 = 0% (<50%)
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', reviseCycles: 3, adversary: { approved: false, summary: '' } }),
      makeRun({ iteration: 2, verdict: 'merged', reviseCycles: 3, adversary: { approved: false, summary: '' } }),
      makeRun({ iteration: 3, verdict: 'merged', reviseCycles: 3, adversary: { approved: false, summary: '' } }),
    ];
    const s = earlyWarningSignal(runs);
    expect(s).not.toBeNull();
    expect(s!.level).toBe('critical');
    expect(s!.highRevise).toBe(true);
    expect(s!.lowApproval).toBe(true);
    expect(s!.windowAvgReviseCycles).toBe(3);
    expect(s!.windowApprovalRate).toBe(0);
  });

  it('高reviseのみ該当する場合は watch になる（承認率は閾値以上）', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', reviseCycles: 3, adversary: { approved: true, summary: '' } }),
      makeRun({ iteration: 2, verdict: 'merged', reviseCycles: 3, adversary: { approved: true, summary: '' } }),
      makeRun({ iteration: 3, verdict: 'merged', reviseCycles: 3, adversary: { approved: true, summary: '' } }),
    ];
    const s = earlyWarningSignal(runs);
    expect(s!.level).toBe('watch');
    expect(s!.highRevise).toBe(true);
    expect(s!.lowApproval).toBe(false);
  });

  it('低承認のみ該当する場合は watch になる（revise回数は閾値以下）', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', reviseCycles: 0, adversary: { approved: false, summary: '' } }),
      makeRun({ iteration: 2, verdict: 'merged', reviseCycles: 0, adversary: { approved: false, summary: '' } }),
      makeRun({ iteration: 3, verdict: 'merged', reviseCycles: 0, adversary: { approved: false, summary: '' } }),
    ];
    const s = earlyWarningSignal(runs);
    expect(s!.level).toBe('watch');
    expect(s!.highRevise).toBe(false);
    expect(s!.lowApproval).toBe(true);
  });

  it('どちらの条件も満たさなければ normal になる', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', reviseCycles: 0, adversary: { approved: true, summary: '' } }),
      makeRun({ iteration: 2, verdict: 'merged', reviseCycles: 1, adversary: { approved: true, summary: '' } }),
      makeRun({ iteration: 3, verdict: 'merged', reviseCycles: 0, adversary: { approved: true, summary: '' } }),
    ];
    const s = earlyWarningSignal(runs);
    expect(s!.level).toBe('normal');
  });

  it('平均revideが閾値ちょうどでは highRevise にならない（境界値、超過のみ真）', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', reviseCycles: EARLY_WARNING_REVISE_THRESHOLD }),
      makeRun({ iteration: 2, verdict: 'merged', reviseCycles: EARLY_WARNING_REVISE_THRESHOLD }),
      makeRun({ iteration: 3, verdict: 'merged', reviseCycles: EARLY_WARNING_REVISE_THRESHOLD }),
    ];
    const s = earlyWarningSignal(runs);
    expect(s!.windowAvgReviseCycles).toBe(EARLY_WARNING_REVISE_THRESHOLD);
    expect(s!.highRevise).toBe(false);
  });

  it('承認率が閾値ちょうどでは lowApproval にならない（境界値、未満のみ真）', () => {
    // 承認率をちょうど50%にするため、window内 2件承認・2件非承認にしたいが window は直近3件。
    // 3件では 50% ちょうどを作れないため window を4件用意しても直近3件しか見ないことを踏まえ、
    // 直近3件のうち承認1件・非承認2件は 1/3≈33%、2件承認・1件非承認は 2/3≈67% になり
    // ちょうど EARLY_WARNING_APPROVAL_THRESHOLD(0.5) を作れる組み合わせが無い。
    // そのため windowSize=2 になるよう reachedVerify な run を2件だけ用意し、1/2=50%を作る。
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', reviseCycles: 0, adversary: { approved: true, summary: '' } }),
      makeRun({ iteration: 2, verdict: 'merged', reviseCycles: 0, adversary: { approved: false, summary: '' } }),
    ];
    const s = earlyWarningSignal(runs);
    expect(s!.windowSize).toBe(2);
    expect(s!.windowApprovalRate).toBe(0.5);
    expect(s!.lowApproval).toBe(false);
  });

  it(`直近 ${EARLY_WARNING_WINDOW} 反復のみを見て、それより古い反復は無視する`, () => {
    // 古い2反復は高revise・低承認（critical条件）だが、直近3反復は normal 条件。
    // window が正しく直近3件だけを見ていれば結果は normal になるはず。
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', reviseCycles: 5, adversary: { approved: false, summary: '' } }),
      makeRun({ iteration: 2, verdict: 'merged', reviseCycles: 5, adversary: { approved: false, summary: '' } }),
      makeRun({ iteration: 3, verdict: 'merged', reviseCycles: 0, adversary: { approved: true, summary: '' } }),
      makeRun({ iteration: 4, verdict: 'merged', reviseCycles: 0, adversary: { approved: true, summary: '' } }),
      makeRun({ iteration: 5, verdict: 'merged', reviseCycles: 0, adversary: { approved: true, summary: '' } }),
    ];
    const s = earlyWarningSignal(runs);
    expect(s!.windowSize).toBe(EARLY_WARNING_WINDOW);
    expect(s!.iterations).toEqual([3, 4, 5]);
    expect(s!.level).toBe('normal');
    expect(s!.partial).toBe(false);
  });

  it('window に満たないデータ数では partial=true になり、あるだけの反復数で計算する', () => {
    const runs = [makeRun({ iteration: 1, verdict: 'merged', reviseCycles: 5, adversary: { approved: false, summary: '' } })];
    const s = earlyWarningSignal(runs);
    expect(s!.windowSize).toBe(1);
    expect(s!.partial).toBe(true);
    expect(s!.iterations).toEqual([1]);
  });

  it('failed run は window の対象から除外する（revise/approve が測定されていない sentinel のため）', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', reviseCycles: 3, adversary: { approved: false, summary: '' } }),
      makeRun({ iteration: 2, verdict: 'merged', reviseCycles: 3, adversary: { approved: false, summary: '' } }),
      makeRun({
        iteration: 3, verdict: 'failed', reviseCycles: 99,
        adversary: { approved: false, summary: 'レビューに到達しなかった。' },
      }),
      makeRun({ iteration: 4, verdict: 'merged', reviseCycles: 3, adversary: { approved: false, summary: '' } }),
    ];
    const s = earlyWarningSignal(runs);
    // failed(iteration 3) を除外すると reachedVerify は [1,2,4] の3件で window ちょうど埋まる。
    // reviseCycles=99 が紛れ込んでいれば平均が跳ね上がるが、実際は 3 のまま。
    expect(s!.iterations).toEqual([1, 2, 4]);
    expect(s!.windowAvgReviseCycles).toBe(3);
  });

  it('window は配列順に依存せず iteration の時系列順で直近を選ぶ', () => {
    const runs = [
      makeRun({ iteration: 5, verdict: 'merged', reviseCycles: 0, adversary: { approved: true, summary: '' } }),
      makeRun({ iteration: 1, verdict: 'merged', reviseCycles: 9, adversary: { approved: false, summary: '' } }),
      makeRun({ iteration: 4, verdict: 'merged', reviseCycles: 0, adversary: { approved: true, summary: '' } }),
      makeRun({ iteration: 2, verdict: 'merged', reviseCycles: 9, adversary: { approved: false, summary: '' } }),
      makeRun({ iteration: 3, verdict: 'merged', reviseCycles: 0, adversary: { approved: true, summary: '' } }),
    ];
    const s = earlyWarningSignal(runs);
    // 時系列(iteration昇順)は 1,2,3,4,5。直近3件は 3,4,5 で全て reviseCycles=0, approved=true。
    expect(s!.iterations).toEqual([3, 4, 5]);
    expect(s!.level).toBe('normal');
  });

  it('EARLY_WARNING_APPROVAL_THRESHOLD は 0..1 の範囲の定数である', () => {
    expect(EARLY_WARNING_APPROVAL_THRESHOLD).toBeGreaterThan(0);
    expect(EARLY_WARNING_APPROVAL_THRESHOLD).toBeLessThan(1);
  });
});

describe('classifyGateReason', () => {
  it('orchestrator/gates.py の固定文字列テンプレートを厳密一致で分類する', () => {
    expect(classifyGateReason('verify(lint/typecheck/unit/build) が失敗している')).toBe('verifyFailed');
    expect(classifyGateReason('e2e(Playwright) が失敗している')).toBe('e2eFailed');
    expect(classifyGateReason('adversary が approve していない')).toBe('adversaryNotApproved');
    expect(classifyGateReason('builder が変更を生成しなかった')).toBe('noChanges');
  });

  it('変更行数・保護パス・例外クラッシュは埋め込み値（数値/パス/メッセージ）が変わっても分類できる', () => {
    expect(classifyGateReason('変更行数 501 が上限 400 を超えている')).toBe('changedLinesExceeded');
    expect(classifyGateReason('変更行数 9999 が上限 400 を超えている')).toBe('changedLinesExceeded');
    expect(classifyGateReason('保護パスを変更している: orchestrator/gates.py')).toBe('protectedPathViolation');
    expect(classifyGateReason('保護パスを変更している: .github/workflows/loop.yml')).toBe('protectedPathViolation');
    expect(classifyGateReason('反復が例外で異常終了した: AgentError: claude exited 1')).toBe('crashed');
    expect(classifyGateReason('反復が例外で異常終了した: GitHubError("checkout failed")')).toBe('crashed');
  });

  it('接頭辞だけ似ていて条件を満たさない/未知/空文字列は誤分類せず other に落とす', () => {
    // 「変更行数」で始まるが「を超えている」で終わらない → changedLinesExceeded ではない
    expect(classifyGateReason('変更行数 100 は許容範囲内')).toBe('other');
    expect(classifyGateReason('未知の理由')).toBe('other');
    expect(classifyGateReason('')).toBe('other');
  });
});

describe('gateReasonBreakdown', () => {
  it('run が無い/全runのgateReasonsが空（全merged）なら空配列を返す', () => {
    expect(gateReasonBreakdown([])).toEqual([]);
    const runs = [makeRun({ iteration: 1, verdict: 'merged', gateReasons: [] })];
    expect(gateReasonBreakdown(runs)).toEqual([]);
  });

  it('1件のrunに複数カテゴリのgateReasonsがある場合、それぞれ1件ずつカウントする', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'abandoned',
        gateReasons: ['adversary が approve していない', '変更行数 500 が上限 400 を超えている'],
      }),
    ];
    const b = gateReasonBreakdown(runs);
    expect(b).toHaveLength(2);
    expect(b.find((x) => x.category === 'adversaryNotApproved')?.iterations).toEqual([1]);
    expect(b.find((x) => x.category === 'changedLinesExceeded')?.count).toBe(1);
  });

  it('複数runにまたがる同一カテゴリを合算し、count降順で返す', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'abandoned', gateReasons: ['adversary が approve していない'] }),
      makeRun({ iteration: 2, verdict: 'abandoned', gateReasons: ['adversary が approve していない'] }),
      makeRun({ iteration: 3, verdict: 'abandoned', gateReasons: ['変更行数 450 が上限 400 を超えている'] }),
    ];
    const b = gateReasonBreakdown(runs);
    expect(b[0].category).toBe('adversaryNotApproved');
    expect(b[0].count).toBe(2);
    expect(b[0].iterations).toEqual([1, 2]);
    expect(b[1].category).toBe('changedLinesExceeded');
    expect(b[1].count).toBe(1);
  });

  it('count が同数のときは gates.py の評価順（e2eFailed→noChanges）で安定させる', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'abandoned', gateReasons: ['builder が変更を生成しなかった'] }),
      makeRun({ iteration: 2, verdict: 'abandoned', gateReasons: ['e2e(Playwright) が失敗している'] }),
    ];
    expect(gateReasonBreakdown(runs).map((x) => x.category)).toEqual(['e2eFailed', 'noChanges']);
  });

  it('同一run内の重複理由はcountに反映しつつiterations/examplesは重複排除する', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'abandoned',
        gateReasons: ['adversary が approve していない', 'adversary が approve していない'],
      }),
    ];
    const b = gateReasonBreakdown(runs);
    expect(b[0].count).toBe(2);
    expect(b[0].iterations).toEqual([1]);
    expect(b[0].examples).toEqual(['adversary が approve していない']);
  });

  it('examplesは埋め込み値ごとに別文字列として昇順で重複排除される', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'abandoned', gateReasons: ['変更行数 500 が上限 400 を超えている'] }),
      makeRun({ iteration: 2, verdict: 'abandoned', gateReasons: ['変更行数 450 が上限 400 を超えている'] }),
    ];
    expect(gateReasonBreakdown(runs)[0].examples).toEqual([
      '変更行数 450 が上限 400 を超えている',
      '変更行数 500 が上限 400 を超えている',
    ]);
  });
});

describe('gateReasonBurdenTrend', () => {
  it('run が無い/全runのgateReasonsが空なら空配列を返す', () => {
    expect(gateReasonBurdenTrend([])).toEqual([]);
    const runs = [makeRun({ iteration: 1, verdict: 'merged', gateReasons: [] })];
    expect(gateReasonBurdenTrend(runs)).toEqual([]);
  });

  it('gateReasonsが空の反復（merged/paused/dry-run等）は点を持たず、ある反復だけが残る', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', gateReasons: [] }),
      makeRun({ iteration: 2, verdict: 'paused', gateReasons: [] }),
      makeRun({
        iteration: 3,
        verdict: 'abandoned',
        gateReasons: ['adversary が approve していない'],
      }),
    ];
    const points = gateReasonBurdenTrend(runs);
    expect(points).toHaveLength(1);
    expect(points[0].iteration).toBe(3);
  });

  it('1反復内の複数カテゴリをそれぞれ数え、他カテゴリは0のまま・totalは合計と一致する', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'abandoned',
        gateReasons: [
          'adversary が approve していない',
          '変更行数 500 が上限 400 を超えている',
          'adversary が approve していない',
        ],
      }),
    ];
    const points = gateReasonBurdenTrend(runs);
    expect(points).toHaveLength(1);
    expect(points[0].total).toBe(3);
    expect(points[0].counts.adversaryNotApproved).toBe(2);
    expect(points[0].counts.changedLinesExceeded).toBe(1);
    expect(points[0].counts.e2eFailed).toBe(0);
    expect(points[0].counts.other).toBe(0);
  });

  it('入力の順序に関わらずiteration昇順で返す', () => {
    const runs = [
      makeRun({ iteration: 3, verdict: 'abandoned', gateReasons: ['builder が変更を生成しなかった'] }),
      makeRun({ iteration: 1, verdict: 'abandoned', gateReasons: ['e2e(Playwright) が失敗している'] }),
      makeRun({ iteration: 2, verdict: 'abandoned', gateReasons: ['adversary が approve していない'] }),
    ];
    const points = gateReasonBurdenTrend(runs);
    expect(points.map((p) => p.iteration)).toEqual([1, 2, 3]);
  });
});

describe('gateFailureTypeBreakdown', () => {
  it('run が無い/全runのgateReasonsが空なら空配列を返す', () => {
    expect(gateFailureTypeBreakdown([])).toEqual([]);
    const runs = [makeRun({ iteration: 1, verdict: 'merged', gateReasons: [] })];
    expect(gateFailureTypeBreakdown(runs)).toEqual([]);
  });

  it('paused/dry-runはgateReasonsが空である限り、verdictがmerged以外でも集計対象から除外される', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'paused', gateReasons: [] }),
      makeRun({ iteration: 2, verdict: 'dry-run', gateReasons: [] }),
    ];
    expect(gateFailureTypeBreakdown(runs)).toEqual([]);
  });

  it('verdictごとにrun数を数える（1runに複数gateReasonsがあってもrunとしては1件）', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'abandoned',
        gateReasons: ['adversary が approve していない', '変更行数 500 が上限 400 を超えている'],
      }),
    ];
    const b = gateFailureTypeBreakdown(runs);
    expect(b).toHaveLength(1);
    expect(b[0]).toEqual({ verdict: 'abandoned', count: 1, iterations: [1] });
  });

  it('複数verdictにまたがる件数をcount降順で返し、対象iterationを昇順で保持する', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'abandoned', gateReasons: ['adversary が approve していない'] }),
      makeRun({ iteration: 3, verdict: 'abandoned', gateReasons: ['adversary が approve していない'] }),
      makeRun({
        iteration: 2,
        verdict: 'failed',
        gateReasons: ['反復が例外で異常終了した: AgentError: claude exited 1'],
      }),
    ];
    const b = gateFailureTypeBreakdown(runs);
    expect(b[0]).toEqual({ verdict: 'abandoned', count: 2, iterations: [1, 3] });
    expect(b[1]).toEqual({ verdict: 'failed', count: 1, iterations: [2] });
  });

  it('countが同数のときはGATE_FAILURE_TYPE_ORDER（failed→abandoned→needs-human）で安定させる', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'abandoned', gateReasons: ['adversary が approve していない'] }),
      makeRun({
        iteration: 2,
        verdict: 'failed',
        gateReasons: ['反復が例外で異常終了した: boom'],
      }),
      makeRun({
        iteration: 3,
        verdict: 'needs-human',
        gateReasons: ['adversary が approve していない'],
      }),
    ];
    expect(gateFailureTypeBreakdown(runs).map((x) => x.verdict)).toEqual(['failed', 'abandoned', 'needs-human']);
  });
});

describe('costEfficiency', () => {
  it('run が無ければ承認PR0件・コスト0・usdPerApprovedPrはnullを返す（0除算を避ける）', () => {
    const e = costEfficiency([]);
    expect(e).toEqual({ totalCostUsd: 0, approvedPrCount: 0, usdPerApprovedPr: null });
  });

  it('adversary.approvedがtrueでもprNumberがnullなら承認PRとして数えない（builderが変更を生成しなかったケース）', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'abandoned',
        adversary: { approved: true, summary: '' },
        prNumber: null,
        gateReasons: ['builder が変更を生成しなかった'],
        cost: { builderUsd: 0.02, adversaryUsd: 0, ideationUsd: 0, totalUsd: 0.02 },
      }),
    ];
    const e = costEfficiency(runs);
    expect(e.approvedPrCount).toBe(0);
    expect(e.usdPerApprovedPr).toBeNull();
    // コスト自体は消費されているため合計には含める
    expect(e.totalCostUsd).toBeCloseTo(0.02, 6);
  });

  it('prNumberがあってもadversaryが未承認なら承認PRとして数えない（needs-humanでPRだけ開いたケース）', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'needs-human',
        adversary: { approved: false, summary: '' },
        prNumber: 20,
        gateReasons: ['adversary が approve していない'],
      }),
    ];
    expect(costEfficiency(runs).approvedPrCount).toBe(0);
  });

  it('paused/dry-runも承認済みでPRが開いていれば承認PRとして数える（mergedに限定しない）', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'paused', adversary: { approved: true, summary: '' }, prNumber: 14 }),
      makeRun({ iteration: 2, verdict: 'dry-run', adversary: { approved: true, summary: '' }, prNumber: 33 }),
    ];
    expect(costEfficiency(runs).approvedPrCount).toBe(2);
  });

  it('failedなど非承認runのコストも分子に合算した上で承認PR数で割る', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'merged',
        adversary: { approved: true, summary: '' },
        prNumber: 11,
        cost: { builderUsd: 0.3, adversaryUsd: 0.05, ideationUsd: 0.05, totalUsd: 0.4 },
      }),
      makeRun({
        iteration: 2,
        verdict: 'failed',
        adversary: { approved: false, summary: '' },
        prNumber: null,
        gateReasons: ['反復が例外で異常終了した: boom'],
        cost: { builderUsd: 0.1, adversaryUsd: 0, ideationUsd: 0, totalUsd: 0.1 },
      }),
    ];
    const e = costEfficiency(runs);
    expect(e.totalCostUsd).toBeCloseTo(0.5, 6);
    expect(e.approvedPrCount).toBe(1);
    expect(e.usdPerApprovedPr).toBeCloseTo(0.5, 6);
  });
});

describe('costPerApprovedPrTrend', () => {
  it('run が無ければ空配列を返す', () => {
    expect(costPerApprovedPrTrend([])).toEqual([]);
  });

  it('最初の承認PRが出るまでは点を持たない（分母0を避ける）', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'abandoned',
        adversary: { approved: false, summary: '' },
        prNumber: null,
        gateReasons: ['adversary が approve していない'],
        cost: { builderUsd: 0.1, adversaryUsd: 0, ideationUsd: 0, totalUsd: 0.1 },
      }),
      makeRun({
        iteration: 2,
        verdict: 'merged',
        adversary: { approved: true, summary: '' },
        prNumber: 11,
        cost: { builderUsd: 0.2, adversaryUsd: 0, ideationUsd: 0, totalUsd: 0.2 },
      }),
    ];
    const trend = costPerApprovedPrTrend(runs);
    // iteration1は承認PRが1件も出ていないため点を持たない。iteration2で初めて
    // 累計コスト(0.1+0.2=0.3) ÷ 累計承認PR数(1) = 0.3 の点が現れる。
    expect(trend).toEqual([{ iteration: 2, value: 0.3 }]);
  });

  it('承認PRが複数回出るたびに累計コスト÷累計承認PR数を更新する', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'merged',
        adversary: { approved: true, summary: '' },
        prNumber: 11,
        cost: { builderUsd: 0.4, adversaryUsd: 0, ideationUsd: 0, totalUsd: 0.4 },
      }),
      makeRun({
        iteration: 2,
        verdict: 'failed',
        adversary: { approved: false, summary: '' },
        prNumber: null,
        gateReasons: ['反復が例外で異常終了した: boom'],
        cost: { builderUsd: 0.1, adversaryUsd: 0, ideationUsd: 0, totalUsd: 0.1 },
      }),
      makeRun({
        iteration: 3,
        verdict: 'merged',
        adversary: { approved: true, summary: '' },
        prNumber: 12,
        cost: { builderUsd: 0.2, adversaryUsd: 0, ideationUsd: 0, totalUsd: 0.2 },
      }),
    ];
    const trend = costPerApprovedPrTrend(runs);
    // iter1: 累計0.4 / 承認1件 = 0.4
    // iter2: 累計0.5(failedのコストも加算) / 承認1件(変わらず) = 0.5
    // iter3: 累計0.7 / 承認2件 = 0.35
    expect(trend).toEqual([
      { iteration: 1, value: 0.4 },
      { iteration: 2, value: 0.5 },
      { iteration: 3, value: 0.35 },
    ]);
  });

  it('iteration昇順でない入力を渡してもiteration昇順に並べてから計算する', () => {
    const runs = [
      makeRun({
        iteration: 2,
        verdict: 'merged',
        adversary: { approved: true, summary: '' },
        prNumber: 12,
        cost: { builderUsd: 0.2, adversaryUsd: 0, ideationUsd: 0, totalUsd: 0.2 },
      }),
      makeRun({
        iteration: 1,
        verdict: 'merged',
        adversary: { approved: true, summary: '' },
        prNumber: 11,
        cost: { builderUsd: 0.4, adversaryUsd: 0, ideationUsd: 0, totalUsd: 0.4 },
      }),
    ];
    expect(costPerApprovedPrTrend(runs)).toEqual([
      { iteration: 1, value: 0.4 },
      { iteration: 2, value: 0.3 },
    ]);
  });
});

describe('reviseCyclesByModel', () => {
  it('run が無ければ空配列を返す', () => {
    expect(reviseCyclesByModel([])).toEqual([]);
  });

  it('failed run（verifyに未到達）は revise 回数が sentinel のため母集団から除外する', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'failed',
        reviseCycles: 99,
        models: { builder: 'claude-opus-4-8', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
      }),
    ];
    expect(reviseCyclesByModel(runs)).toEqual([]);
  });

  it('builder モデルごとに mean/median/min/max/count/iterations を正確な値で集計する', () => {
    const runs = [
      makeRun({
        iteration: 1,
        reviseCycles: 1,
        models: { builder: 'claude-sonnet-5', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
      }),
      makeRun({
        iteration: 2,
        reviseCycles: 3,
        models: { builder: 'claude-sonnet-5', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
      }),
      makeRun({
        iteration: 3,
        reviseCycles: 5,
        models: { builder: 'claude-sonnet-5', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
      }),
      makeRun({
        iteration: 4,
        reviseCycles: 0,
        models: { builder: 'claude-opus-4-8', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
      }),
    ];
    const result = reviseCyclesByModel(runs);
    // 平均revise回数降順: sonnet(mean=3) > opus(mean=0)
    expect(result).toEqual([
      {
        model: 'claude-sonnet-5',
        count: 3,
        mean: 3,
        median: 3,
        min: 1,
        max: 5,
        iterations: [1, 2, 3],
      },
      {
        model: 'claude-opus-4-8',
        count: 1,
        mean: 0,
        median: 0,
        min: 0,
        max: 0,
        iterations: [4],
      },
    ]);
  });

  it('平均revise回数が同値のときはモデル名の昇順で安定させる', () => {
    const runs = [
      makeRun({
        iteration: 1,
        reviseCycles: 2,
        models: { builder: 'zeta-model', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
      }),
      makeRun({
        iteration: 2,
        reviseCycles: 2,
        models: { builder: 'alpha-model', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
      }),
    ];
    const result = reviseCyclesByModel(runs);
    expect(result.map((r) => r.model)).toEqual(['alpha-model', 'zeta-model']);
  });

  it('iteration昇順でない入力を渡しても iterations を昇順で保持する', () => {
    const runs = [
      makeRun({
        iteration: 3,
        reviseCycles: 1,
        models: { builder: 'claude-sonnet-5', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
      }),
      makeRun({
        iteration: 1,
        reviseCycles: 2,
        models: { builder: 'claude-sonnet-5', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
      }),
    ];
    const result = reviseCyclesByModel(runs);
    expect(result[0].iterations).toEqual([1, 3]);
  });
});

describe('reviseCyclesByVerdict', () => {
  it('run が無ければ空配列を返す', () => {
    expect(reviseCyclesByVerdict([])).toEqual([]);
  });

  it('reviseCyclesByModel とは異なり failed run を除外せず、独立した verdict グループとして集計する', () => {
    const runs = [makeRun({ iteration: 1, verdict: 'failed', reviseCycles: 99 })];
    expect(reviseCyclesByVerdict(runs)).toEqual([
      { verdict: 'failed', count: 1, mean: 99, median: 99, min: 99, max: 99, iterations: [1] },
    ]);
  });

  it('verdict ごとに mean/median/min/max/count/iterations を正確な値で集計する', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', reviseCycles: 1 }),
      makeRun({ iteration: 2, verdict: 'merged', reviseCycles: 3 }),
      makeRun({ iteration: 3, verdict: 'merged', reviseCycles: 5 }),
      makeRun({ iteration: 4, verdict: 'abandoned', reviseCycles: 0 }),
    ];
    const result = reviseCyclesByVerdict(runs);
    // 平均revise回数降順: merged(mean=3) > abandoned(mean=0)
    expect(result).toEqual([
      { verdict: 'merged', count: 3, mean: 3, median: 3, min: 1, max: 5, iterations: [1, 2, 3] },
      { verdict: 'abandoned', count: 1, mean: 0, median: 0, min: 0, max: 0, iterations: [4] },
    ]);
  });

  it('平均revise回数が同値のときは深刻度順（failed > abandoned > needs-human > paused > dry-run > merged）で安定させる', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', reviseCycles: 2 }),
      makeRun({ iteration: 2, verdict: 'abandoned', reviseCycles: 2 }),
    ];
    const result = reviseCyclesByVerdict(runs);
    expect(result.map((r) => r.verdict)).toEqual(['abandoned', 'merged']);
  });

  it('iteration昇順でない入力を渡しても iterations を昇順で保持する', () => {
    const runs = [
      makeRun({ iteration: 3, verdict: 'merged', reviseCycles: 1 }),
      makeRun({ iteration: 1, verdict: 'merged', reviseCycles: 2 }),
    ];
    const result = reviseCyclesByVerdict(runs);
    expect(result[0].iterations).toEqual([1, 3]);
  });
});

describe('modelEffectiveness', () => {
  it('run が0件なら空配列を返す', () => {
    expect(modelEffectiveness([])).toEqual([]);
  });

  it('builder モデルごとにマージ率・承認率・e2e失敗率・平均revise・平均カバレッジ・平均コストを分けて集計する', () => {
    const runs = [
      // sonnet: merged 2件, needs-human 1件 → mergeRate = 2/3
      makeRun({
        iteration: 1,
        verdict: 'merged',
        reviseCycles: 0,
        adversary: { approved: true, summary: '' },
        verify: { unitPassed: true, e2ePassed: true, coveragePct: 90 },
        cost: { builderUsd: 1, adversaryUsd: 0, ideationUsd: 0, totalUsd: 1 },
        models: { builder: 'claude-sonnet-5', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
      }),
      makeRun({
        iteration: 2,
        verdict: 'merged',
        reviseCycles: 2,
        adversary: { approved: true, summary: '' },
        verify: { unitPassed: true, e2ePassed: false, coveragePct: 70 },
        cost: { builderUsd: 3, adversaryUsd: 0, ideationUsd: 0, totalUsd: 3 },
        models: { builder: 'claude-sonnet-5', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
      }),
      makeRun({
        iteration: 3,
        verdict: 'needs-human',
        reviseCycles: 4,
        adversary: { approved: false, summary: '' },
        verify: { unitPassed: false, e2ePassed: false, coveragePct: 50 },
        cost: { builderUsd: 2, adversaryUsd: 0, ideationUsd: 0, totalUsd: 2 },
        models: { builder: 'claude-sonnet-5', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
      }),
      // haiku: needs-human 1件のみ → mergeRate = 0
      makeRun({
        iteration: 4,
        verdict: 'needs-human',
        reviseCycles: 1,
        adversary: { approved: false, summary: '' },
        verify: { unitPassed: false, e2ePassed: true, coveragePct: 40 },
        cost: { builderUsd: 0.5, adversaryUsd: 0, ideationUsd: 0, totalUsd: 0.5 },
        models: { builder: 'claude-haiku-4-5', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
      }),
    ];

    const result = modelEffectiveness(runs);

    // マージ率降順: sonnet(2/3) が haiku(0/1) より先
    expect(result.map((r) => r.model)).toEqual(['claude-sonnet-5', 'claude-haiku-4-5']);

    const sonnet = result[0];
    expect(sonnet.count).toBe(3);
    expect(sonnet.mergeRate).toBeCloseTo(2 / 3, 10);
    expect(sonnet.approvalRate).toBeCloseTo(2 / 3, 10);
    expect(sonnet.e2eFailureRate).toBeCloseTo(2 / 3, 10);
    expect(sonnet.avgReviseCycles).toBeCloseTo(2, 10);
    expect(sonnet.avgCoveragePct).toBeCloseTo(70, 10);
    expect(sonnet.avgCostUsd).toBeCloseTo(2, 10);
    expect(sonnet.iterations).toEqual([1, 2, 3]);

    const haiku = result[1];
    expect(haiku.count).toBe(1);
    expect(haiku.mergeRate).toBe(0);
    expect(haiku.approvalRate).toBe(0);
    expect(haiku.e2eFailureRate).toBe(0);
    expect(haiku.avgReviseCycles).toBeCloseTo(1, 10);
    expect(haiku.avgCoveragePct).toBeCloseTo(40, 10);
    expect(haiku.avgCostUsd).toBeCloseTo(0.5, 10);
  });

  it('failed run（verify未到達）は approvalRate/e2eFailureRate/avgReviseCycles/avgCoveragePct の母集団から除くが、mergeRate と avgCostUsd の母集団には含める', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'failed',
        reviseCycles: 99,
        adversary: { approved: false, summary: '' },
        verify: { unitPassed: false, e2ePassed: false, coveragePct: 0 },
        cost: { builderUsd: 5, adversaryUsd: 0, ideationUsd: 0, totalUsd: 5 },
        models: { builder: 'claude-sonnet-5', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
      }),
      makeRun({
        iteration: 2,
        verdict: 'merged',
        reviseCycles: 1,
        adversary: { approved: true, summary: '' },
        verify: { unitPassed: true, e2ePassed: true, coveragePct: 80 },
        cost: { builderUsd: 1, adversaryUsd: 0, ideationUsd: 0, totalUsd: 1 },
        models: { builder: 'claude-sonnet-5', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
      }),
    ];

    const result = modelEffectiveness(runs);
    expect(result).toHaveLength(1);
    const sonnet = result[0];

    // mergeRate/avgCostUsd の分母は全2件
    expect(sonnet.count).toBe(2);
    expect(sonnet.mergeRate).toBeCloseTo(1 / 2, 10);
    expect(sonnet.avgCostUsd).toBeCloseTo(3, 10);

    // approvalRate/e2eFailureRate/avgReviseCycles/avgCoveragePct の分母は failed を除いた1件のみ
    expect(sonnet.approvalRate).toBe(1);
    expect(sonnet.e2eFailureRate).toBe(0);
    expect(sonnet.avgReviseCycles).toBeCloseTo(1, 10);
    expect(sonnet.avgCoveragePct).toBeCloseTo(80, 10);
  });

  it('全反復が failed（verify未到達）なら approvalRate/e2eFailureRate を 0 にしてNaNを避ける', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'failed',
        reviseCycles: 5,
        verify: { unitPassed: false, e2ePassed: false, coveragePct: 0 },
        models: { builder: 'claude-sonnet-5', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
      }),
    ];
    const result = modelEffectiveness(runs);
    expect(result[0].approvalRate).toBe(0);
    expect(result[0].e2eFailureRate).toBe(0);
    expect(result[0].avgReviseCycles).toBe(0);
    expect(result[0].avgCoveragePct).toBe(0);
    expect(result[0].mergeRate).toBe(0);
  });

  it('マージ率が同値のときはモデル名の昇順で安定させる', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'merged',
        models: { builder: 'zeta-model', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
      }),
      makeRun({
        iteration: 2,
        verdict: 'merged',
        models: { builder: 'alpha-model', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
      }),
    ];
    const result = modelEffectiveness(runs);
    expect(result.map((r) => r.model)).toEqual(['alpha-model', 'zeta-model']);
  });
});

describe('ideationFailureSummary', () => {
  it('run が0件なら attempted/failed が0でfailureRateも0', () => {
    const result = ideationFailureSummary([]);
    expect(result).toEqual({ attempted: 0, failed: 0, failureRate: 0, failedIterations: [] });
  });

  it('ideationUsd が0の反復（ready充足でideation未実行）は分母に含めない', () => {
    const runs = [
      makeRun({ iteration: 1, cost: { builderUsd: 0.1, adversaryUsd: 0.01, ideationUsd: 0, totalUsd: 0.11 }, nextIssues: [] }),
      makeRun({ iteration: 2, cost: { builderUsd: 0.1, adversaryUsd: 0.01, ideationUsd: 0, totalUsd: 0.11 }, nextIssues: [] }),
    ];
    const result = ideationFailureSummary(runs);
    expect(result).toEqual({ attempted: 0, failed: 0, failureRate: 0, failedIterations: [] });
  });

  it('ideationUsd > 0 かつ nextIssues が空の反復だけを失敗として数える', () => {
    const runs = [
      // 実行して成功（提案あり）
      makeRun({
        iteration: 1,
        cost: { builderUsd: 0.1, adversaryUsd: 0.01, ideationUsd: 0.05, totalUsd: 0.16 },
        nextIssues: [10],
      }),
      // 実行したが提案0件 → 失敗
      makeRun({
        iteration: 2,
        cost: { builderUsd: 0.1, adversaryUsd: 0.01, ideationUsd: 0.08, totalUsd: 0.19 },
        nextIssues: [],
      }),
      // 未実行（ready充足）→ 母集団に含めない
      makeRun({
        iteration: 3,
        cost: { builderUsd: 0.1, adversaryUsd: 0.01, ideationUsd: 0, totalUsd: 0.11 },
        nextIssues: [],
      }),
      // 実行したが提案0件 → 失敗
      makeRun({
        iteration: 4,
        cost: { builderUsd: 0.1, adversaryUsd: 0.01, ideationUsd: 0.02, totalUsd: 0.13 },
        nextIssues: [],
      }),
    ];
    const result = ideationFailureSummary(runs);
    expect(result.attempted).toBe(3);
    expect(result.failed).toBe(2);
    expect(result.failureRate).toBeCloseTo(2 / 3, 10);
    expect(result.failedIterations).toEqual([2, 4]);
  });

  it('実行した反復が全て成功していればfailureRateは0（境界値）', () => {
    const runs = [
      makeRun({
        iteration: 1,
        cost: { builderUsd: 0.1, adversaryUsd: 0.01, ideationUsd: 0.05, totalUsd: 0.16 },
        nextIssues: [2],
      }),
    ];
    const result = ideationFailureSummary(runs);
    expect(result.attempted).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.failureRate).toBe(0);
    expect(result.failedIterations).toEqual([]);
  });

  it('実行した反復が全て失敗していればfailureRateは1（境界値）', () => {
    const runs = [
      makeRun({
        iteration: 1,
        cost: { builderUsd: 0.1, adversaryUsd: 0.01, ideationUsd: 0.05, totalUsd: 0.16 },
        nextIssues: [],
      }),
    ];
    const result = ideationFailureSummary(runs);
    expect(result.attempted).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.failureRate).toBe(1);
    expect(result.failedIterations).toEqual([1]);
  });
});

describe('ideationFailureRateTrend', () => {
  it('run が0件なら空配列を返す', () => {
    expect(ideationFailureRateTrend([])).toEqual([]);
  });

  it('ideationUsd=0の反復は点を持たず、実行された反復だけの累積失敗率を辿る', () => {
    const runs = [
      makeRun({
        iteration: 1,
        cost: { builderUsd: 0.1, adversaryUsd: 0.01, ideationUsd: 0.05, totalUsd: 0.16 },
        nextIssues: [2],
      }),
      makeRun({
        iteration: 2,
        cost: { builderUsd: 0.1, adversaryUsd: 0.01, ideationUsd: 0, totalUsd: 0.11 },
        nextIssues: [],
      }),
      makeRun({
        iteration: 3,
        cost: { builderUsd: 0.1, adversaryUsd: 0.01, ideationUsd: 0.08, totalUsd: 0.19 },
        nextIssues: [],
      }),
      makeRun({
        iteration: 4,
        cost: { builderUsd: 0.1, adversaryUsd: 0.01, ideationUsd: 0.02, totalUsd: 0.13 },
        nextIssues: [],
      }),
    ];
    const trend = ideationFailureRateTrend(runs);
    // iteration2は未実行なので点を持たない → [1, 3, 4] の3点のみ
    expect(trend.map((p) => p.iteration)).toEqual([1, 3, 4]);
    expect(trend[0].value).toBeCloseTo(0, 10); // 1件中0件失敗
    expect(trend[1].value).toBeCloseTo(50, 10); // 2件中1件失敗
    expect(trend[2].value).toBeCloseTo((2 / 3) * 100, 10); // 3件中2件失敗

    // 最終点は ideationFailureSummary().failureRate*100 と一致するはず
    const summary = ideationFailureSummary(runs);
    expect(trend[trend.length - 1].value).toBeCloseTo(summary.failureRate * 100, 10);
  });
});

describe('e2eFailureReviseCorrelation', () => {
  it('run が0件なら全て0、相関係数はnull（境界値）', () => {
    const result = e2eFailureReviseCorrelation([]);
    expect(result).toEqual({
      sampleSize: 0,
      passedCount: 0,
      failedCount: 0,
      passedMeanRevise: 0,
      failedMeanRevise: 0,
      delta: 0,
      correlationCoefficient: null,
      failedIterations: [],
    });
  });

  it('verify に到達していない failed run は母集団から除外する', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'failed', verify: { unitPassed: false, e2ePassed: false, coveragePct: 0 }, reviseCycles: 0 }),
      makeRun({ iteration: 2, verify: { unitPassed: true, e2ePassed: true, coveragePct: 80 }, reviseCycles: 1 }),
    ];
    const result = e2eFailureReviseCorrelation(runs);
    expect(result.sampleSize).toBe(1);
    expect(result.passedCount).toBe(1);
    expect(result.failedCount).toBe(0);
  });

  it('e2e成功群・失敗群それぞれ全て同じe2e結果（分散0）だと相関係数はnull（境界値）', () => {
    const runs = [
      makeRun({ iteration: 1, verify: { unitPassed: true, e2ePassed: true, coveragePct: 80 }, reviseCycles: 0 }),
      makeRun({ iteration: 2, verify: { unitPassed: true, e2ePassed: true, coveragePct: 80 }, reviseCycles: 2 }),
    ];
    const result = e2eFailureReviseCorrelation(runs);
    expect(result.passedCount).toBe(2);
    expect(result.failedCount).toBe(0);
    expect(result.passedMeanRevise).toBeCloseTo(1, 10);
    expect(result.failedMeanRevise).toBe(0);
    expect(result.correlationCoefficient).toBeNull();
    expect(result.failedIterations).toEqual([]);
  });

  it('reviseCyclesが全run同値（分散0）でも相関係数はnull（境界値）', () => {
    const runs = [
      makeRun({ iteration: 1, verify: { unitPassed: true, e2ePassed: true, coveragePct: 80 }, reviseCycles: 1 }),
      makeRun({ iteration: 2, verify: { unitPassed: true, e2ePassed: false, coveragePct: 80 }, reviseCycles: 1 }),
    ];
    const result = e2eFailureReviseCorrelation(runs);
    expect(result.correlationCoefficient).toBeNull();
  });

  it('e2e失敗群のrevise回数が明確に多いケースで正の相関・正のdeltaを算出する', () => {
    const runs = [
      makeRun({ iteration: 1, verify: { unitPassed: true, e2ePassed: true, coveragePct: 80 }, reviseCycles: 0 }),
      makeRun({ iteration: 2, verify: { unitPassed: true, e2ePassed: true, coveragePct: 80 }, reviseCycles: 1 }),
      makeRun({ iteration: 3, verify: { unitPassed: true, e2ePassed: false, coveragePct: 80 }, reviseCycles: 3 }),
      makeRun({ iteration: 4, verify: { unitPassed: true, e2ePassed: false, coveragePct: 80 }, reviseCycles: 4 }),
    ];
    const result = e2eFailureReviseCorrelation(runs);
    expect(result.sampleSize).toBe(4);
    expect(result.passedCount).toBe(2);
    expect(result.failedCount).toBe(2);
    expect(result.passedMeanRevise).toBeCloseTo(0.5, 10);
    expect(result.failedMeanRevise).toBeCloseTo(3.5, 10);
    expect(result.delta).toBeCloseTo(3, 10);
    expect(result.correlationCoefficient).not.toBeNull();
    expect(result.correlationCoefficient!).toBeCloseTo(0.9487, 4);
    expect(result.failedIterations).toEqual([3, 4]);
  });

  it('e2e失敗群のrevise回数が成功群より少ないと負のdeltaになる', () => {
    const runs = [
      makeRun({ iteration: 1, verify: { unitPassed: true, e2ePassed: true, coveragePct: 80 }, reviseCycles: 5 }),
      makeRun({ iteration: 2, verify: { unitPassed: true, e2ePassed: false, coveragePct: 80 }, reviseCycles: 1 }),
    ];
    const result = e2eFailureReviseCorrelation(runs);
    expect(result.delta).toBeCloseTo(-4, 10);
    expect(result.correlationCoefficient!).toBeLessThan(0);
  });
});
