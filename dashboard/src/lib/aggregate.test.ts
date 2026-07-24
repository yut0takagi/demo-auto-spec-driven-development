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
  gateReasonCostBreakdown,
  gateReasonBurdenTrend,
  gateReasonTrendSignal,
  GATE_REASON_TREND_WINDOW,
  GATE_REASON_TREND_FLAT_THRESHOLD,
  gateFailureTypeBreakdown,
  gateReasonSeveritySpectrum,
  costEfficiency,
  costPerApprovedPrTrend,
  reviseCyclesByModel,
  reviseCyclesByVerdict,
  reviseVerdictMatrix,
  reviseCycleCostRecovery,
  durationByVerdict,
  breakerRunway,
  modelEffectiveness,
  issueLabelSuccessRates,
  modelConfidenceWeightedScores,
  modelEfficiencyByRole,
  builderModelSwitchComparisons,
  approvalRateTrendByModel,
  ideationFailureSummary,
  ideationFailureRateTrend,
  e2eFailureReviseCorrelation,
  e2eFailureDiffSizeCorrelation,
  builderVolumeApprovalCoupling,
  cycleTimeTrend,
  cycleTimeTrendSignal,
  CYCLE_TIME_TREND_WINDOW,
  CYCLE_TIME_TREND_FLAT_THRESHOLD_PCT,
  timeToFirstPrTrend,
  timeToFirstPrTrendSignal,
  TIME_TO_FIRST_PR_TREND_WINDOW,
  TIME_TO_FIRST_PR_TREND_FLAT_THRESHOLD_PCT,
  leadTimeInversions,
  LEAD_TIME_INVERSION_THRESHOLD_PCT,
  builderUtilizationDeclineSignal,
  BUILDER_UTILIZATION_DECLINE_STREAK_THRESHOLD,
  adversarySummaryLengthTrend,
  adversaryCommentTrendSignal,
  ADVERSARY_COMMENT_TREND_WINDOW,
  ADVERSARY_COMMENT_TREND_FLAT_THRESHOLD_PCT,
  adversaryApprovalCommentStats,
  recentAdversaryComments,
  ADVERSARY_COMMENT_DIGEST_LIMIT,
  ideationCostQualityCorrelation,
  abandonedSummary,
  abandonedReasonBreakdown,
  abandonedReasonOverrepresentation,
  ABANDONED_REASON_OVERREPRESENTATION_THRESHOLD_PT,
  abandonedRateTrend,
  abandonedIterationDetails,
  gateReasonChains,
  gateReasonConsecutiveFailureChaos,
  gateReasonUnificationPatterns,
  adversaryApprovalByReasonAndModel,
  issueResolutionTimeTrend,
  issueResolutionTimeTrendSignal,
  ISSUE_RESOLUTION_TIME_TREND_WINDOW,
  ISSUE_RESOLUTION_TIME_TREND_FLAT_THRESHOLD_PCT,
  pausedDryRunDetails,
  pausedDryRunSummary,
  gatePauseClassifications,
  gatePauseSummary,
  GATE_PAUSE_STALE_THRESHOLD_ITERATIONS,
  adversaryOutcomeDivergence,
  adversaryModelVerdictMissMatrix,
  ideationToStartLeadTimes,
  ideationToStartLeadTimeTrendSignal,
  IDEATION_TO_START_LEAD_TIME_TREND_WINDOW,
  IDEATION_TO_START_LEAD_TIME_TREND_FLAT_THRESHOLD_PCT,
  ideationStartSuccessSummary,
  ideationDropRateSignal,
  IDEATION_DROP_STALENESS_ITERATIONS,
  IDEATION_DROP_RATE_STREAK_THRESHOLD,
  ideationProposalQualityDropCorrelation,
  ideationToStartLeadTimeDistribution,
  ideationToStartBottlenecks,
  IDEATION_TO_START_BOTTLENECK_MIN_SAMPLES,
  IDEATION_TO_START_STILL_WAITING_MIN_ITERATIONS,
  verdictTransitions,
  verdictTransitionSummary,
  dropoutStreaks,
  DROPOUT_STREAK_MIN_LENGTH,
  reviseSizeSuccessPatterns,
  CHANGE_SIZE_SMALL_MAX,
  CHANGE_SIZE_MEDIUM_MAX,
  SUCCESS_PATTERN_MIN_SAMPLES,
  reviseCyclesBySizeBucket,
  reviseCyclesSizeCurve,
  REVISE_SIZE_CURVE_MIN_SAMPLES,
  REVISE_SIZE_CURVE_FLAT_THRESHOLD,
  modelSkillStratification,
  MODEL_SKILL_PRESSURE_FLAT_THRESHOLD_PCT,
  approvedButBuilderFailedIterations,
  approvedButBuilderFailedSummary,
} from './aggregate';
import type { RunRecord, Verdict } from './types';

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

  it('adversarySummary が orchestrator/review.py の技術的棄却文言のときだけ adversaryUnparseable に分岐する', () => {
    // JSON を取り出せなかった場合の文言（review.py の _REJECT_UNPARSEABLE と完全一致）
    expect(
      classifyGateReason('adversary が approve していない', 'adversary の出力を解釈できないため棄却として扱う'),
    ).toBe('adversaryUnparseable');
    // approved が真偽値でなかった場合の文言（先頭が固定、末尾に元summaryが動的に付く）
    expect(
      classifyGateReason('adversary が approve していない', 'approved が真偽値でないため棄却: よさそう'),
    ).toBe('adversaryUnparseable');
    // 内容を読んで却下した場合の通常summaryは従来通り adversaryNotApproved のまま
    expect(
      classifyGateReason('adversary が approve していない', '既存の挙動を壊している'),
    ).toBe('adversaryNotApproved');
    // adversarySummary を渡さない呼び出しは後方互換で adversaryNotApproved に丸める
    expect(classifyGateReason('adversary が approve していない')).toBe('adversaryNotApproved');
    // adversary が approve していない 以外の reason では adversarySummary を渡しても影響しない
    expect(
      classifyGateReason('e2e(Playwright) が失敗している', 'adversary の出力を解釈できないため棄却として扱う'),
    ).toBe('e2eFailed');
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

  it('reasonの文字列だけでは同一の "adversary が approve していない" でも adversary.summary で adversaryUnparseable と adversaryNotApproved に分離する', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'abandoned',
        gateReasons: ['adversary が approve していない'],
        adversary: { approved: false, summary: 'adversary の出力を解釈できないため棄却として扱う' },
      }),
      makeRun({
        iteration: 2,
        verdict: 'abandoned',
        gateReasons: ['adversary が approve していない'],
        adversary: { approved: false, summary: '既存の挙動を壊している' },
      }),
    ];
    const b = gateReasonBreakdown(runs);
    expect(b.find((x) => x.category === 'adversaryUnparseable')?.iterations).toEqual([1]);
    expect(b.find((x) => x.category === 'adversaryNotApproved')?.iterations).toEqual([2]);
  });
});

describe('gateReasonCostBreakdown', () => {
  it('run が無い/全runのgateReasonsが空なら空配列を返す', () => {
    expect(gateReasonCostBreakdown([])).toEqual([]);
    const runs = [makeRun({ iteration: 1, verdict: 'merged', gateReasons: [] })];
    expect(gateReasonCostBreakdown(runs)).toEqual([]);
  });

  it('reviseCyclesが0より大きいrunでは cost/duration/reviseCycles を合算し、revise1回あたりの実質コストを算出する', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'abandoned',
        gateReasons: ['e2e(Playwright) が失敗している'],
        reviseCycles: 2,
        durationSec: 600,
        cost: { builderUsd: 1, adversaryUsd: 0, ideationUsd: 0, totalUsd: 1 },
      }),
      makeRun({
        iteration: 2,
        verdict: 'abandoned',
        gateReasons: ['e2e(Playwright) が失敗している'],
        reviseCycles: 2,
        durationSec: 400,
        cost: { builderUsd: 1, adversaryUsd: 0, ideationUsd: 0, totalUsd: 1 },
      }),
    ];
    const b = gateReasonCostBreakdown(runs);
    expect(b).toHaveLength(1);
    expect(b[0].category).toBe('e2eFailed');
    expect(b[0].count).toBe(2);
    expect(b[0].runCount).toBe(2);
    expect(b[0].totalCostUsd).toBeCloseTo(2, 5);
    expect(b[0].totalDurationSec).toBe(1000);
    expect(b[0].totalReviseCycles).toBe(4);
    expect(b[0].avgCostUsdPerRun).toBeCloseTo(1, 5);
    // 2USD合計 / revise4回 = 0.5USD/revise
    expect(b[0].avgCostUsdPerReviseCycle).toBeCloseTo(0.5, 5);
    // 1000秒合計 / revise4回 = 250秒/revise
    expect(b[0].avgDurationSecPerReviseCycle).toBeCloseTo(250, 5);
  });

  it('該当カテゴリの全runが reviseCycles=0（即abandon等）なら revise1回あたりコストは null（0除算を避ける）', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'abandoned',
        gateReasons: ['反復が例外で異常終了した: boom'],
        reviseCycles: 0,
        cost: { builderUsd: 0.5, adversaryUsd: 0, ideationUsd: 0, totalUsd: 0.5 },
      }),
    ];
    const b = gateReasonCostBreakdown(runs);
    expect(b[0].category).toBe('crashed');
    expect(b[0].totalCostUsd).toBeCloseTo(0.5, 5);
    expect(b[0].avgCostUsdPerReviseCycle).toBeNull();
    expect(b[0].avgDurationSecPerReviseCycle).toBeNull();
  });

  it('1 run が同一カテゴリの reason を複数持っていても cost/duration/reviseCycles は run 単位で1回だけ加算する（重複計上しない）', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'abandoned',
        gateReasons: ['adversary が approve していない', 'adversary が approve していない'],
        reviseCycles: 3,
        durationSec: 900,
        cost: { builderUsd: 2, adversaryUsd: 0, ideationUsd: 0, totalUsd: 2 },
      }),
    ];
    const b = gateReasonCostBreakdown(runs);
    expect(b[0].count).toBe(2); // 出現件数はgateReasonBreakdownと同じ定義で2件
    expect(b[0].runCount).toBe(1); // だがcost集計の母数は1run
    expect(b[0].totalCostUsd).toBeCloseTo(2, 5); // 2重計上されず2USDのまま
    expect(b[0].totalReviseCycles).toBe(3);
    expect(b[0].avgCostUsdPerReviseCycle).toBeCloseTo(2 / 3, 5);
  });

  it('複数カテゴリにまたがる場合、totalCostUsd降順で返す', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'abandoned',
        gateReasons: ['builder が変更を生成しなかった'],
        reviseCycles: 1,
        cost: { builderUsd: 0.1, adversaryUsd: 0, ideationUsd: 0, totalUsd: 0.1 },
      }),
      makeRun({
        iteration: 2,
        verdict: 'abandoned',
        gateReasons: ['e2e(Playwright) が失敗している'],
        reviseCycles: 3,
        cost: { builderUsd: 5, adversaryUsd: 0, ideationUsd: 0, totalUsd: 5 },
      }),
    ];
    const b = gateReasonCostBreakdown(runs);
    expect(b.map((x) => x.category)).toEqual(['e2eFailed', 'noChanges']);
  });
});

describe('gateReasonSeveritySpectrum', () => {
  it('run が無い/全runのgateReasonsが空なら空配列を返す', () => {
    expect(gateReasonSeveritySpectrum([])).toEqual([]);
    const runs = [makeRun({ iteration: 1, verdict: 'merged', gateReasons: [] })];
    expect(gateReasonSeveritySpectrum(runs)).toEqual([]);
  });

  it('全runがabandonedなカテゴリはseverityScoreが最小(1)になる', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'abandoned',
        gateReasons: ['変更行数 500 が上限 400 を超えている'],
        reviseCycles: 0,
        cost: { builderUsd: 0.2, adversaryUsd: 0, ideationUsd: 0, totalUsd: 0.2 },
      }),
    ];
    const s = gateReasonSeveritySpectrum(runs);
    expect(s).toHaveLength(1);
    expect(s[0].category).toBe('changedLinesExceeded');
    // SEVERITY_TIER_VERDICTS = [failed, abandoned, needs-human] のうち abandoned は中間(重み2)
    expect(s[0].severityScore).toBeCloseTo(2, 5);
    expect(s[0].runCount).toBe(1);
    expect(s[0].iterations).toEqual([1]);
    expect(s[0].avgCostUsdPerRun).toBeCloseTo(0.2, 5);
    expect(s[0].tiers).toEqual([
      {
        verdict: 'abandoned',
        runCount: 1,
        totalCostUsd: 0.2,
        avgCostUsdPerRun: 0.2,
        totalReviseCycles: 0,
        avgReviseCyclesPerRun: 0,
      },
    ]);
  });

  it('同一カテゴリがfailed/abandoned/needs-humanにまたがると加重平均でseverityScoreが動く', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'failed',
        gateReasons: ['反復が例外で異常終了した: boom'],
      }),
      makeRun({
        iteration: 2,
        verdict: 'abandoned',
        gateReasons: ['反復が例外で異常終了した: boom2'],
      }),
    ];
    const s = gateReasonSeveritySpectrum(runs);
    expect(s[0].category).toBe('crashed');
    // failed(重み3)が1件、abandoned(重み2)が1件 -> 平均2.5
    expect(s[0].severityScore).toBeCloseTo(2.5, 5);
    expect(s[0].tiers.map((t) => t.verdict)).toEqual(['failed', 'abandoned']);
    // tier(verdict)をまたいでも反復番号は1つの昇順リストにまとまる
    expect(s[0].iterations).toEqual([1, 2]);
  });

  it('needs-humanのみのカテゴリはseverityScoreが最小(1)になり、failedのみは最大(3)になる', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'needs-human',
        gateReasons: ['adversary が approve していない'],
        adversary: { approved: false, summary: '既存の挙動を壊している' },
      }),
      makeRun({
        iteration: 2,
        verdict: 'failed',
        gateReasons: ['反復が例外で異常終了した: boom'],
      }),
    ];
    const s = gateReasonSeveritySpectrum(runs);
    const needsHumanRow = s.find((x) => x.category === 'adversaryNotApproved');
    const crashedRow = s.find((x) => x.category === 'crashed');
    expect(needsHumanRow?.severityScore).toBeCloseTo(1, 5);
    expect(crashedRow?.severityScore).toBeCloseTo(3, 5);
    // severityScore降順で返る
    expect(s.map((x) => x.category)).toEqual(['crashed', 'adversaryNotApproved']);
  });

  it('1 run が同一カテゴリの reason を複数持っていても run 単位で1回だけ加算する（重複計上しない）', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'abandoned',
        gateReasons: ['adversary が approve していない', 'adversary が approve していない'],
        reviseCycles: 3,
        cost: { builderUsd: 2, adversaryUsd: 0, ideationUsd: 0, totalUsd: 2 },
      }),
    ];
    const s = gateReasonSeveritySpectrum(runs);
    expect(s[0].runCount).toBe(1);
    expect(s[0].avgCostUsdPerRun).toBeCloseTo(2, 5);
    expect(s[0].tiers[0].totalReviseCycles).toBe(3);
  });

  it('paused/dry-runはgateReasonsが空という契約が破られても対象から除外する（防御的分岐）', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'paused',
        gateReasons: ['e2e(Playwright) が失敗している'],
      }),
      makeRun({
        iteration: 2,
        verdict: 'dry-run',
        gateReasons: ['e2e(Playwright) が失敗している'],
      }),
    ];
    expect(gateReasonSeveritySpectrum(runs)).toEqual([]);
  });
});

describe('adversaryApprovalByReasonAndModel', () => {
  it('run が無い/全runのgateReasonsが空なら空配列を返す', () => {
    expect(adversaryApprovalByReasonAndModel([])).toEqual([]);
    const runs = [makeRun({ iteration: 1, verdict: 'merged', gateReasons: [] })];
    expect(adversaryApprovalByReasonAndModel(runs)).toEqual([]);
  });

  it('同一カテゴリ内で adversaryモデルが異なれば別セルとして分離し、承認率をモデルごとに算出する', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'abandoned',
        gateReasons: ['e2e(Playwright) が失敗している'],
        adversary: { approved: true, summary: '' },
        models: { builder: 'claude-sonnet-5', adversary: 'claude-sonnet-5', ideation: 'claude-haiku-4-5' },
      }),
      makeRun({
        iteration: 2,
        verdict: 'abandoned',
        gateReasons: ['e2e(Playwright) が失敗している'],
        adversary: { approved: false, summary: '' },
        models: { builder: 'claude-sonnet-5', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
      }),
      makeRun({
        iteration: 3,
        verdict: 'abandoned',
        gateReasons: ['e2e(Playwright) が失敗している'],
        adversary: { approved: true, summary: '' },
        models: { builder: 'claude-sonnet-5', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
      }),
    ];
    const rows = adversaryApprovalByReasonAndModel(runs);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.category).toBe('e2eFailed');
    expect(row.total).toBe(3);

    const sonnet = row.cells.find((c) => c.model === 'claude-sonnet-5')!;
    expect(sonnet.count).toBe(1);
    expect(sonnet.approvedCount).toBe(1);
    expect(sonnet.approvalRatePct).toBeCloseTo(100, 5);
    expect(sonnet.iterations).toEqual([1]);

    const haiku = row.cells.find((c) => c.model === 'claude-haiku-4-5')!;
    expect(haiku.count).toBe(2);
    expect(haiku.approvedCount).toBe(1);
    expect(haiku.approvalRatePct).toBeCloseTo(50, 5);
    expect(haiku.iterations).toEqual([2, 3]);
  });

  it('adversaryNotApproved / adversaryUnparseable は定義上、承認率が常に0%になる', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'abandoned',
        gateReasons: ['adversary が approve していない'],
        adversary: { approved: false, summary: '既存の挙動を壊している' },
        models: { builder: 'claude-sonnet-5', adversary: 'claude-sonnet-5', ideation: 'claude-haiku-4-5' },
      }),
      makeRun({
        iteration: 2,
        verdict: 'abandoned',
        gateReasons: ['adversary が approve していない'],
        adversary: { approved: false, summary: 'adversary の出力を解釈できないため棄却として扱う' },
        models: { builder: 'claude-sonnet-5', adversary: 'claude-sonnet-5', ideation: 'claude-haiku-4-5' },
      }),
    ];
    const rows = adversaryApprovalByReasonAndModel(runs);
    const notApproved = rows.find((r) => r.category === 'adversaryNotApproved')!;
    expect(notApproved.cells[0].approvalRatePct).toBe(0);
    const unparseable = rows.find((r) => r.category === 'adversaryUnparseable')!;
    expect(unparseable.cells[0].approvalRatePct).toBe(0);
  });

  it('1件のrunに複数カテゴリのgateReasonsがあれば、そのrunのadversaryモデルがそれぞれのカテゴリへ計上される', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'abandoned',
        gateReasons: ['adversary が approve していない', '変更行数 500 が上限 400 を超えている'],
        adversary: { approved: false, summary: '' },
        models: { builder: 'claude-sonnet-5', adversary: 'claude-opus-4-8', ideation: 'claude-haiku-4-5' },
      }),
    ];
    const rows = adversaryApprovalByReasonAndModel(runs);
    expect(rows).toHaveLength(2);
    const changedLines = rows.find((r) => r.category === 'changedLinesExceeded')!;
    expect(changedLines.cells).toEqual([
      { model: 'claude-opus-4-8', count: 1, approvedCount: 0, approvalRatePct: 0, iterations: [1] },
    ]);
  });

  it('total降順で行を並べ、同数はgateReasonBreakdownと同じカテゴリ評価順で安定させる', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'abandoned', gateReasons: ['builder が変更を生成しなかった'] }),
      makeRun({ iteration: 2, verdict: 'abandoned', gateReasons: ['e2e(Playwright) が失敗している'] }),
    ];
    expect(adversaryApprovalByReasonAndModel(runs).map((r) => r.category)).toEqual(['e2eFailed', 'noChanges']);
  });

  it('セル内はcount降順・同数はモデル名昇順で並ぶ', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'abandoned',
        gateReasons: ['verify(lint/typecheck/unit/build) が失敗している'],
        models: { builder: 'claude-sonnet-5', adversary: 'claude-sonnet-5', ideation: 'claude-haiku-4-5' },
      }),
      makeRun({
        iteration: 2,
        verdict: 'abandoned',
        gateReasons: ['verify(lint/typecheck/unit/build) が失敗している'],
        models: { builder: 'claude-sonnet-5', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
      }),
      makeRun({
        iteration: 3,
        verdict: 'abandoned',
        gateReasons: ['verify(lint/typecheck/unit/build) が失敗している'],
        models: { builder: 'claude-sonnet-5', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
      }),
    ];
    const row = adversaryApprovalByReasonAndModel(runs).find((r) => r.category === 'verifyFailed')!;
    expect(row.cells.map((c) => c.model)).toEqual(['claude-haiku-4-5', 'claude-sonnet-5']);
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

  it('adversary.summaryが技術的棄却の文言なら adversaryUnparseable に計上し、adversaryNotApproved は増やさない', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'abandoned',
        gateReasons: ['adversary が approve していない'],
        adversary: { approved: false, summary: 'adversary の出力を解釈できないため棄却として扱う' },
      }),
    ];
    const points = gateReasonBurdenTrend(runs);
    expect(points[0].counts.adversaryUnparseable).toBe(1);
    expect(points[0].counts.adversaryNotApproved).toBe(0);
    expect(points[0].total).toBe(1);
  });
});

describe('gateReasonTrendSignal', () => {
  const CL = '変更行数 500 が上限 400 を超えている';
  const E2E = 'e2e(Playwright) が失敗している';
  const ADV = 'adversary が approve していない';

  function gateRun(iteration: number, gateReasons: string[]) {
    return makeRun({ iteration, verdict: 'abandoned', gateReasons });
  }

  it('比較対象の点が1件以下（runなし、または1件のみ）なら null を返す', () => {
    expect(gateReasonTrendSignal([])).toBeNull();
    expect(gateReasonTrendSignal([gateRun(1, [ADV])])).toBeNull();
    // gateReasons が空の run は点自体を持たないため、実質1点未満扱いで null
    const runs = [gateRun(1, [ADV]), makeRun({ iteration: 2, verdict: 'merged', gateReasons: [] })];
    expect(gateReasonTrendSignal(runs)).toBeNull();
  });

  it('直近windowと直前windowを比較し、カテゴリごとに悪化/改善/横ばいを判定する', () => {
    const runs = [
      gateRun(1, [E2E, CL, CL]),
      gateRun(2, [E2E, CL, CL]),
      gateRun(3, [E2E, CL, CL]),
      gateRun(4, [E2E, CL, ADV]),
      gateRun(5, [E2E, CL, ADV]),
      gateRun(6, [E2E, CL, ADV]),
    ];
    const signal = gateReasonTrendSignal(runs);
    expect(signal).not.toBeNull();
    if (!signal) return;

    expect(signal.windowSize).toBe(GATE_REASON_TREND_WINDOW);
    expect(signal.partial).toBe(false);
    expect(signal.previousIterations).toEqual([1, 2, 3]);
    expect(signal.recentIterations).toEqual([4, 5, 6]);

    const byCategory = Object.fromEntries(signal.categories.map((c) => [c.category, c]));
    // adversaryNotApproved: 0件/反復 → 1件/反復 に増加＝悪化
    expect(byCategory.adversaryNotApproved.previousAvgCount).toBe(0);
    expect(byCategory.adversaryNotApproved.recentAvgCount).toBe(1);
    expect(byCategory.adversaryNotApproved.direction).toBe('worsening');
    // changedLinesExceeded: 2件/反復 → 1件/反復 に減少＝改善
    expect(byCategory.changedLinesExceeded.previousAvgCount).toBe(2);
    expect(byCategory.changedLinesExceeded.recentAvgCount).toBe(1);
    expect(byCategory.changedLinesExceeded.direction).toBe('improving');
    // e2eFailed: 1件/反復のまま変化なし＝横ばい
    expect(byCategory.e2eFailed.direction).toBe('flat');
    expect(byCategory.e2eFailed.delta).toBe(0);
    // 一度も出現していないカテゴリも横ばいとして含まれる（全カテゴリを列挙する契約）
    expect(byCategory.crashed.direction).toBe('flat');
    // GATE_REASON_CATEGORY_ORDER の全カテゴリ数（adversaryUnparseable 追加後）
    expect(signal.categories).toHaveLength(9);
  });

  it('閾値未満のブレは横ばい、閾値ちょうどは悪化/改善として扱う（境界値）', () => {
    // windowSize=3: 直前平均 0/3=0、直近平均 1/3≈0.333 → 閾値0.5未満なので横ばい
    const flatRuns = [
      gateRun(1, [E2E]),
      gateRun(2, [E2E]),
      gateRun(3, [E2E]),
      gateRun(4, [E2E, ADV]),
      gateRun(5, [E2E]),
      gateRun(6, [E2E]),
    ];
    const flatSignal = gateReasonTrendSignal(flatRuns);
    expect(flatSignal?.categories.find((c) => c.category === 'adversaryNotApproved')?.direction).toBe('flat');

    // windowSize=2: 直前平均 0/2=0、直近平均 1/2=0.5 → 閾値ちょうどなので悪化と判定
    const boundaryRuns = [gateRun(1, [E2E]), gateRun(2, [E2E]), gateRun(3, [E2E, ADV]), gateRun(4, [E2E])];
    const boundarySignal = gateReasonTrendSignal(boundaryRuns);
    const adv = boundarySignal?.categories.find((c) => c.category === 'adversaryNotApproved');
    expect(adv?.delta).toBeCloseTo(GATE_REASON_TREND_FLAT_THRESHOLD);
    expect(adv?.direction).toBe('worsening');
  });

  it('データ点が window*2 未満のときは実際の点数に縮小したwindowで比較し、partial=trueになる', () => {
    const runs = [gateRun(1, [ADV]), gateRun(2, [E2E]), gateRun(3, [CL])];
    const signal = gateReasonTrendSignal(runs);
    expect(signal).not.toBeNull();
    if (!signal) return;

    expect(signal.windowSize).toBe(1);
    expect(signal.partial).toBe(true);
    expect(signal.previousIterations).toEqual([2]);
    expect(signal.recentIterations).toEqual([3]);
  });
});

describe('gateReasonChains', () => {
  it('run が無い/全runのgateReasonsが空なら空配列を返す', () => {
    expect(gateReasonChains([])).toEqual([]);
    const runs = [makeRun({ iteration: 1, verdict: 'merged', gateReasons: [] })];
    expect(gateReasonChains(runs)).toEqual([]);
  });

  it('gateReasonsが空の反復（merged/paused等）は除外され、ある反復だけが残る', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', gateReasons: [] }),
      makeRun({ iteration: 2, verdict: 'paused', gateReasons: [] }),
      makeRun({
        iteration: 3,
        verdict: 'abandoned',
        gateReasons: ['adversary が approve していない'],
      }),
    ];
    const chains = gateReasonChains(runs);
    expect(chains).toHaveLength(1);
    expect(chains[0].iteration).toBe(3);
    expect(chains[0].issueNumber).toBe(1);
    expect(chains[0].verdict).toBe('abandoned');
  });

  it('1反復内の複数カテゴリを出現順に連鎖として並べ、同カテゴリの重複は除去する', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'abandoned',
        gateReasons: [
          'e2e(Playwright) が失敗している',
          'adversary が approve していない',
          '変更行数 500 が上限 400 を超えている',
          'adversary が approve していない',
        ],
      }),
    ];
    const chains = gateReasonChains(runs);
    expect(chains).toHaveLength(1);
    expect(chains[0].categories).toEqual(['e2eFailed', 'adversaryNotApproved', 'changedLinesExceeded']);
  });

  it('入力の順序に関わらずiteration降順（新しい順）で返す', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'abandoned', gateReasons: ['e2e(Playwright) が失敗している'] }),
      makeRun({ iteration: 3, verdict: 'abandoned', gateReasons: ['builder が変更を生成しなかった'] }),
      makeRun({ iteration: 2, verdict: 'abandoned', gateReasons: ['adversary が approve していない'] }),
    ];
    const chains = gateReasonChains(runs);
    expect(chains.map((c) => c.iteration)).toEqual([3, 2, 1]);
  });

  it('adversaryの応答が構造化できず技術的に棄却された反復は、内容を読んで却下した反復と別カテゴリ(adversaryUnparseable)になる', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'abandoned',
        gateReasons: ['adversary が approve していない'],
        adversary: { approved: false, summary: 'adversary の出力を解釈できないため棄却として扱う' },
      }),
      makeRun({
        iteration: 2,
        verdict: 'abandoned',
        gateReasons: ['adversary が approve していない'],
        adversary: { approved: false, summary: '既存の挙動を壊している' },
      }),
    ];
    const chains = gateReasonChains(runs);
    // iteration降順で返るので[0]がiteration2、[1]がiteration1
    expect(chains[0].categories).toEqual(['adversaryNotApproved']);
    expect(chains[1].categories).toEqual(['adversaryUnparseable']);
  });
});

describe('gateReasonConsecutiveFailureChaos', () => {
  it('runが無い/全runがmerged、またはgateReasonsを持つ反復が1件だけ（前後がmerged）なら空配列を返す（連続には2件以上必要）', () => {
    expect(gateReasonConsecutiveFailureChaos([])).toEqual([]);
    expect(gateReasonConsecutiveFailureChaos([makeRun({ iteration: 1, verdict: 'merged', gateReasons: [] })])).toEqual(
      [],
    );
    const isolated = [
      makeRun({ iteration: 1, verdict: 'merged', gateReasons: [] }),
      makeRun({ iteration: 2, verdict: 'abandoned', gateReasons: ['e2e(Playwright) が失敗している'] }),
      makeRun({ iteration: 3, verdict: 'merged', gateReasons: [] }),
    ];
    expect(gateReasonConsecutiveFailureChaos(isolated)).toEqual([]);
  });

  it('同じ根本原因が連続するstreakはstable判定になり、入力の順序に関わらずiteration昇順で結果を返す', () => {
    const runs = [
      makeRun({ iteration: 3, verdict: 'abandoned', gateReasons: ['e2e(Playwright) が失敗している'] }),
      makeRun({ iteration: 1, verdict: 'abandoned', gateReasons: ['e2e(Playwright) が失敗している'] }),
      makeRun({ iteration: 2, verdict: 'abandoned', gateReasons: ['e2e(Playwright) が失敗している'] }),
    ];
    const streaks = gateReasonConsecutiveFailureChaos(runs);
    expect(streaks).toHaveLength(1);
    const s = streaks[0];
    expect(s.startIteration).toBe(1);
    expect(s.endIteration).toBe(3);
    expect(s.length).toBe(3);
    expect(s.iterations).toEqual([1, 2, 3]);
    expect(s.rootCauses).toEqual(['e2eFailed', 'e2eFailed', 'e2eFailed']);
    expect(s.switchCount).toBe(0);
    expect(s.chaosScore).toBe(0);
    expect(s.chaosLevel).toBe('stable');
    expect(s.dominantRootCause).toBe('e2eFailed');
    expect(s.dominantRootCauseCount).toBe(3);
  });

  it('毎回根本原因が入れ替わるstreakはchaotic判定になる（根本原因はgateReasons[0]だけを見て2番目以降は無視する）', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'abandoned',
        gateReasons: ['e2e(Playwright) が失敗している', '変更行数 500 が上限 400 を超えている'],
      }),
      makeRun({
        iteration: 2,
        verdict: 'abandoned',
        gateReasons: ['verify(lint/typecheck/unit/build) が失敗している'],
      }),
    ];
    const streaks = gateReasonConsecutiveFailureChaos(runs);
    expect(streaks).toHaveLength(1);
    expect(streaks[0].rootCauses).toEqual(['e2eFailed', 'verifyFailed']);
    expect(streaks[0].switchCount).toBe(1);
    expect(streaks[0].chaosScore).toBe(1);
    expect(streaks[0].chaosLevel).toBe('chaotic');
  });

  it('一部だけ根本原因が入れ替わるstreakはmixed判定になり、最多カテゴリの同数タイはGATE_REASON_CATEGORY_ORDER順（verifyFailedが先）で決める', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'abandoned', gateReasons: ['e2e(Playwright) が失敗している'] }),
      makeRun({ iteration: 2, verdict: 'abandoned', gateReasons: ['e2e(Playwright) が失敗している'] }),
      makeRun({
        iteration: 3,
        verdict: 'abandoned',
        gateReasons: ['verify(lint/typecheck/unit/build) が失敗している'],
      }),
      makeRun({
        iteration: 4,
        verdict: 'abandoned',
        gateReasons: ['verify(lint/typecheck/unit/build) が失敗している'],
      }),
    ];
    const streaks = gateReasonConsecutiveFailureChaos(runs);
    expect(streaks).toHaveLength(1);
    const s = streaks[0];
    expect(s.switchCount).toBe(1);
    expect(s.chaosScore).toBeCloseTo(1 / 3);
    expect(s.chaosLevel).toBe('mixed');
    expect(s.dominantRootCause).toBe('verifyFailed');
    expect(s.dominantRootCauseCount).toBe(2);
  });

  it('gateReasonsが空の反復（merged/paused等）を挟む、またはruns配列内でiteration番号が飛ぶと、そこでstreakが分断される（新しいstreakから返す）', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'abandoned', gateReasons: ['e2e(Playwright) が失敗している'] }),
      makeRun({ iteration: 2, verdict: 'abandoned', gateReasons: ['e2e(Playwright) が失敗している'] }),
      makeRun({ iteration: 3, verdict: 'paused', gateReasons: [] }),
      // iteration 5が渡されていない（呼び出し元が事前にフィルタした等）ため、4だけでは長さ1でstreak対象外
      makeRun({ iteration: 4, verdict: 'abandoned', gateReasons: ['e2e(Playwright) が失敗している'] }),
      makeRun({ iteration: 6, verdict: 'abandoned', gateReasons: ['e2e(Playwright) が失敗している'] }),
      makeRun({ iteration: 7, verdict: 'abandoned', gateReasons: ['e2e(Playwright) が失敗している'] }),
    ];
    const streaks = gateReasonConsecutiveFailureChaos(runs);
    expect(streaks).toHaveLength(2);
    expect(streaks[0].iterations).toEqual([6, 7]);
    expect(streaks[1].iterations).toEqual([1, 2]);
  });
});

describe('gateReasonUnificationPatterns', () => {
  it('streakが1つも無ければ空配列を返す', () => {
    expect(gateReasonUnificationPatterns([])).toEqual([]);
    const isolated = [
      makeRun({ iteration: 1, verdict: 'merged', gateReasons: [] }),
      makeRun({ iteration: 2, verdict: 'abandoned', gateReasons: ['e2e(Playwright) が失敗している'] }),
      makeRun({ iteration: 3, verdict: 'merged', gateReasons: [] }),
    ];
    expect(gateReasonUnificationPatterns(isolated)).toEqual([]);
  });

  it('streak全体で根本原因が同じなら unified-from-start（末尾の連続長=streak長）', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'abandoned', gateReasons: ['e2e(Playwright) が失敗している'] }),
      makeRun({ iteration: 2, verdict: 'abandoned', gateReasons: ['e2e(Playwright) が失敗している'] }),
      makeRun({ iteration: 3, verdict: 'abandoned', gateReasons: ['e2e(Playwright) が失敗している'] }),
    ];
    const [p] = gateReasonUnificationPatterns(runs);
    expect(p.pattern).toBe('unified-from-start');
    expect(p.unifiedRootCause).toBe('e2eFailed');
    expect(p.unifiedRunLength).toBe(3);
    expect(p.unifiedSinceIteration).toBe(1);
  });

  it('長さ2のstreakで根本原因が異なれば not-unified（収束するには末尾2反復以上の一致が必要）', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'abandoned', gateReasons: ['e2e(Playwright) が失敗している'] }),
      makeRun({
        iteration: 2,
        verdict: 'abandoned',
        gateReasons: ['verify(lint/typecheck/unit/build) が失敗している'],
      }),
    ];
    const [p] = gateReasonUnificationPatterns(runs);
    expect(p.pattern).toBe('not-unified');
    expect(p.unifiedRootCause).toBeNull();
    expect(p.unifiedRunLength).toBe(0);
    expect(p.unifiedSinceIteration).toBeNull();
  });

  it('前半で原因が入れ替わり、末尾2反復以上が同じ原因で終わるstreakは converged になる', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'abandoned', gateReasons: ['e2e(Playwright) が失敗している'] }),
      makeRun({
        iteration: 2,
        verdict: 'abandoned',
        gateReasons: ['verify(lint/typecheck/unit/build) が失敗している'],
      }),
      makeRun({
        iteration: 3,
        verdict: 'abandoned',
        gateReasons: ['verify(lint/typecheck/unit/build) が失敗している'],
      }),
      makeRun({
        iteration: 4,
        verdict: 'abandoned',
        gateReasons: ['verify(lint/typecheck/unit/build) が失敗している'],
      }),
    ];
    const [p] = gateReasonUnificationPatterns(runs);
    expect(p.pattern).toBe('converged');
    expect(p.rootCauses).toEqual(['e2eFailed', 'verifyFailed', 'verifyFailed', 'verifyFailed']);
    expect(p.unifiedRootCause).toBe('verifyFailed');
    expect(p.unifiedRunLength).toBe(3);
    expect(p.unifiedSinceIteration).toBe(2);
  });

  it('末尾の反復だけがその直前と異なる（最後で再び入れ替わって終わる）streakは、途中に同一原因の連続があっても not-unified になる', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'abandoned', gateReasons: ['e2e(Playwright) が失敗している'] }),
      makeRun({ iteration: 2, verdict: 'abandoned', gateReasons: ['e2e(Playwright) が失敗している'] }),
      makeRun({
        iteration: 3,
        verdict: 'abandoned',
        gateReasons: ['verify(lint/typecheck/unit/build) が失敗している'],
      }),
    ];
    const [p] = gateReasonUnificationPatterns(runs);
    expect(p.pattern).toBe('not-unified');
    expect(p.unifiedRootCause).toBeNull();
    expect(p.unifiedRunLength).toBe(0);
    expect(p.unifiedSinceIteration).toBeNull();
  });

  it('複数streakを新しいstreakから順に返す（gateReasonConsecutiveFailureChaosと同じ並び）', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'abandoned', gateReasons: ['e2e(Playwright) が失敗している'] }),
      makeRun({ iteration: 2, verdict: 'abandoned', gateReasons: ['e2e(Playwright) が失敗している'] }),
      makeRun({ iteration: 3, verdict: 'paused', gateReasons: [] }),
      makeRun({
        iteration: 4,
        verdict: 'abandoned',
        gateReasons: ['verify(lint/typecheck/unit/build) が失敗している'],
      }),
      makeRun({
        iteration: 5,
        verdict: 'abandoned',
        gateReasons: ['adversary が approve していない'],
      }),
    ];
    const patterns = gateReasonUnificationPatterns(runs);
    expect(patterns).toHaveLength(2);
    expect(patterns[0].iterations).toEqual([4, 5]);
    expect(patterns[0].pattern).toBe('not-unified');
    expect(patterns[1].iterations).toEqual([1, 2]);
    expect(patterns[1].pattern).toBe('unified-from-start');
  });

  it('reasonの文字列が同じ "adversary が approve していない" でも adversary.summary が技術的棄却の文言(adversaryUnparseable)に切り替わると switchCount に反映され、単純な reason 文字列一致では収束と誤判定しない', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'abandoned',
        gateReasons: ['adversary が approve していない'],
        adversary: { approved: false, summary: '要件を満たしていない実装のため却下' },
      }),
      makeRun({
        iteration: 2,
        verdict: 'abandoned',
        gateReasons: ['adversary が approve していない'],
        adversary: { approved: false, summary: 'adversary の出力を解釈できないため棄却として扱う' },
      }),
      makeRun({
        iteration: 3,
        verdict: 'abandoned',
        gateReasons: ['adversary が approve していない'],
        adversary: { approved: false, summary: 'adversary の出力を解釈できないため棄却として扱う' },
      }),
    ];
    const [p] = gateReasonUnificationPatterns(runs);
    expect(p.rootCauses).toEqual(['adversaryNotApproved', 'adversaryUnparseable', 'adversaryUnparseable']);
    expect(p.pattern).toBe('converged');
    expect(p.unifiedRootCause).toBe('adversaryUnparseable');
    expect(p.unifiedRunLength).toBe(2);
    expect(p.unifiedSinceIteration).toBe(2);
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

describe('reviseVerdictMatrix', () => {
  it('run が無ければ空配列を返す', () => {
    expect(reviseVerdictMatrix([])).toEqual([]);
  });

  it('reviseCycles を 0/1/2/3+ の4区分に分類し、区分ごとにverdict別件数を集計する', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', reviseCycles: 0 }),
      makeRun({ iteration: 2, verdict: 'merged', reviseCycles: 2 }),
      makeRun({ iteration: 3, verdict: 'abandoned', reviseCycles: 2 }),
      makeRun({ iteration: 4, verdict: 'abandoned', reviseCycles: 3 }),
      makeRun({ iteration: 5, verdict: 'failed', reviseCycles: 99 }),
    ];
    const result = reviseVerdictMatrix(runs);
    expect(result).toEqual([
      {
        bucket: '0',
        total: 1,
        byVerdict: { merged: 1, abandoned: 0, 'needs-human': 0, paused: 0, 'dry-run': 0, failed: 0 },
        iterations: [1],
      },
      {
        bucket: '2',
        total: 2,
        byVerdict: { merged: 1, abandoned: 1, 'needs-human': 0, paused: 0, 'dry-run': 0, failed: 0 },
        iterations: [2, 3],
      },
      {
        bucket: '3+',
        total: 2,
        byVerdict: { merged: 0, abandoned: 1, 'needs-human': 0, paused: 0, 'dry-run': 0, failed: 1 },
        iterations: [4, 5],
      },
    ]);
  });

  it('reviseCycles=1 は独立した"1"区分に入り、reviseCycles=3 は"2"ではなく"3+"に入る（境界値）', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', reviseCycles: 1 }),
      makeRun({ iteration: 2, verdict: 'merged', reviseCycles: 3 }),
    ];
    const result = reviseVerdictMatrix(runs);
    expect(result.map((r) => r.bucket)).toEqual(['1', '3+']);
  });

  it('reviseCyclesByVerdict と同様、failed run を除外せず reviseCycles の値どおりに区分する（クラッシュまでのrevise回数として扱う）', () => {
    const runs = [makeRun({ iteration: 1, verdict: 'failed', reviseCycles: 0 })];
    const result = reviseVerdictMatrix(runs);
    expect(result).toEqual([
      {
        bucket: '0',
        total: 1,
        byVerdict: { merged: 0, abandoned: 0, 'needs-human': 0, paused: 0, 'dry-run': 0, failed: 1 },
        iterations: [1],
      },
    ]);
  });

  it('データに出現しない区分は含めない（空bucketを作らない）', () => {
    const runs = [makeRun({ iteration: 1, verdict: 'merged', reviseCycles: 5 })];
    const result = reviseVerdictMatrix(runs);
    expect(result.map((r) => r.bucket)).toEqual(['3+']);
  });

  it('bucketは常に 0 → 1 → 2 → 3+ の順で返す（入力順やverdictの種類に関係なく）', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', reviseCycles: 3 }),
      makeRun({ iteration: 2, verdict: 'abandoned', reviseCycles: 0 }),
      makeRun({ iteration: 3, verdict: 'paused', reviseCycles: 2 }),
      makeRun({ iteration: 4, verdict: 'dry-run', reviseCycles: 1 }),
    ];
    const result = reviseVerdictMatrix(runs);
    expect(result.map((r) => r.bucket)).toEqual(['0', '1', '2', '3+']);
  });

  it('iteration昇順でない入力を渡しても iterations を昇順で保持する', () => {
    const runs = [
      makeRun({ iteration: 5, verdict: 'merged', reviseCycles: 0 }),
      makeRun({ iteration: 2, verdict: 'merged', reviseCycles: 0 }),
    ];
    const result = reviseVerdictMatrix(runs);
    expect(result[0].iterations).toEqual([2, 5]);
  });

  it('各行の total は byVerdict の合計と一致する', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', reviseCycles: 1 }),
      makeRun({ iteration: 2, verdict: 'paused', reviseCycles: 1 }),
      makeRun({ iteration: 3, verdict: 'dry-run', reviseCycles: 1 }),
    ];
    const [row] = reviseVerdictMatrix(runs);
    const sum = Object.values(row.byVerdict).reduce((a, b) => a + b, 0);
    expect(row.total).toBe(sum);
    expect(row.total).toBe(3);
  });
});

describe('reviseCycleCostRecovery', () => {
  it('run が無ければ空配列を返す', () => {
    expect(reviseCycleCostRecovery([])).toEqual([]);
  });

  it('bucket内のコスト分布(mean/median/min/max/p90)とmerge回収率を正確な値で集計する', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'merged',
        reviseCycles: 1,
        cost: { builderUsd: 0.9, adversaryUsd: 0.1, ideationUsd: 0, totalUsd: 1.0 },
      }),
      makeRun({
        iteration: 2,
        verdict: 'merged',
        reviseCycles: 1,
        cost: { builderUsd: 1.8, adversaryUsd: 0.2, ideationUsd: 0, totalUsd: 2.0 },
      }),
      makeRun({
        iteration: 3,
        verdict: 'abandoned',
        reviseCycles: 1,
        cost: { builderUsd: 3.6, adversaryUsd: 0.4, ideationUsd: 0, totalUsd: 4.0 },
      }),
    ];
    const result = reviseCycleCostRecovery(runs);
    expect(result).toHaveLength(1);
    const bucket1 = result[0];
    expect(bucket1.bucket).toBe('1');
    expect(bucket1.count).toBe(3);
    expect(bucket1.totalCostUsd).toBeCloseTo(7.0, 6);
    expect(bucket1.meanCostUsd).toBeCloseTo(7 / 3, 6);
    // 中央値: [1,2,4]の中央2要素(index1)の平均 = 2
    expect(bucket1.medianCostUsd).toBeCloseTo(2, 6);
    expect(bucket1.minCostUsd).toBeCloseTo(1, 6);
    expect(bucket1.maxCostUsd).toBeCloseTo(4, 6);
    // p90: rank=0.9*2=1.8 → sorted[1] + (sorted[2]-sorted[1])*0.8 = 2 + 2*0.8 = 3.6
    expect(bucket1.p90CostUsd).toBeCloseTo(3.6, 6);
    expect(bucket1.mergedCount).toBe(2);
    expect(bucket1.recoveryRate).toBeCloseTo(2 / 3, 6);
    expect(bucket1.usdPerMergedIteration).toBeCloseTo(3.5, 6);
    expect(bucket1.iterations).toEqual([1, 2, 3]);
  });

  it('bucket内にmergedが1件も無ければ回収率0・usdPerMergedIterationはnull（0除算を避ける）', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'abandoned',
        reviseCycles: 0,
        cost: { builderUsd: 0.5, adversaryUsd: 0, ideationUsd: 0, totalUsd: 0.5 },
      }),
    ];
    const [bucket0] = reviseCycleCostRecovery(runs);
    expect(bucket0.mergedCount).toBe(0);
    expect(bucket0.recoveryRate).toBe(0);
    expect(bucket0.usdPerMergedIteration).toBeNull();
  });

  it('failed run のコストも「回収できなかった支出」としてbucketの分布に含める（costEfficiencyと同じ理由）', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'failed',
        reviseCycles: 2,
        cost: { builderUsd: 3, adversaryUsd: 0, ideationUsd: 0, totalUsd: 3 },
      }),
    ];
    const [bucket2] = reviseCycleCostRecovery(runs);
    expect(bucket2.bucket).toBe('2');
    expect(bucket2.count).toBe(1);
    expect(bucket2.totalCostUsd).toBeCloseTo(3, 6);
    expect(bucket2.mergedCount).toBe(0);
    expect(bucket2.recoveryRate).toBe(0);
  });

  it('データに出現しない区分は含めず、出現した区分は入力順に関係なく 0→1→2→3+ の順で返す', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', reviseCycles: 5, cost: { builderUsd: 1, adversaryUsd: 0, ideationUsd: 0, totalUsd: 1 } }),
      makeRun({ iteration: 2, verdict: 'merged', reviseCycles: 0, cost: { builderUsd: 1, adversaryUsd: 0, ideationUsd: 0, totalUsd: 1 } }),
      makeRun({ iteration: 3, verdict: 'merged', reviseCycles: 1, cost: { builderUsd: 1, adversaryUsd: 0, ideationUsd: 0, totalUsd: 1 } }),
    ];
    const result = reviseCycleCostRecovery(runs);
    expect(result.map((b) => b.bucket)).toEqual(['0', '1', '3+']);
  });

  it('iteration昇順でない入力を渡しても iterations を昇順で保持する', () => {
    const runs = [
      makeRun({ iteration: 5, verdict: 'merged', reviseCycles: 0, cost: { builderUsd: 1, adversaryUsd: 0, ideationUsd: 0, totalUsd: 1 } }),
      makeRun({ iteration: 2, verdict: 'merged', reviseCycles: 0, cost: { builderUsd: 1, adversaryUsd: 0, ideationUsd: 0, totalUsd: 1 } }),
    ];
    const [bucket0] = reviseCycleCostRecovery(runs);
    expect(bucket0.iterations).toEqual([2, 5]);
  });
});

describe('durationByVerdict', () => {
  it('run が無ければ空配列を返す', () => {
    expect(durationByVerdict([])).toEqual([]);
  });

  it('reviseCyclesByVerdict と同様、failed run を除外せず独立した verdict グループとして集計する', () => {
    const runs = [makeRun({ iteration: 1, verdict: 'failed', durationSec: 999 })];
    expect(durationByVerdict(runs)).toEqual([
      { verdict: 'failed', count: 1, mean: 999, median: 999, min: 999, max: 999, iterations: [1] },
    ]);
  });

  it('verdict ごとに mean/median/min/max/count/iterations を正確な値で集計する', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', durationSec: 300 }),
      makeRun({ iteration: 2, verdict: 'merged', durationSec: 600 }),
      makeRun({ iteration: 3, verdict: 'merged', durationSec: 900 }),
      makeRun({ iteration: 4, verdict: 'abandoned', durationSec: 120 }),
    ];
    const result = durationByVerdict(runs);
    // 平均所要時間降順: merged(mean=600) > abandoned(mean=120)
    expect(result).toEqual([
      { verdict: 'merged', count: 3, mean: 600, median: 600, min: 300, max: 900, iterations: [1, 2, 3] },
      { verdict: 'abandoned', count: 1, mean: 120, median: 120, min: 120, max: 120, iterations: [4] },
    ]);
  });

  it('平均所要時間が同値のときは深刻度順（failed > abandoned > needs-human > paused > dry-run > merged）で安定させる', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', durationSec: 300 }),
      makeRun({ iteration: 2, verdict: 'abandoned', durationSec: 300 }),
    ];
    const result = durationByVerdict(runs);
    expect(result.map((r) => r.verdict)).toEqual(['abandoned', 'merged']);
  });

  it('iteration昇順でない入力を渡しても iterations を昇順で保持する', () => {
    const runs = [
      makeRun({ iteration: 3, verdict: 'merged', durationSec: 300 }),
      makeRun({ iteration: 1, verdict: 'merged', durationSec: 600 }),
    ];
    const result = durationByVerdict(runs);
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

describe('issueLabelSuccessRates', () => {
  it('run が0件なら空配列を返す', () => {
    expect(issueLabelSuccessRates([])).toEqual([]);
  });

  it('labelが空配列の反復（issue特定不能）はどのバケットにも数えない', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', issue: { number: 0, title: '?', labels: [] } }),
    ];
    expect(issueLabelSuccessRates(runs)).toEqual([]);
  });

  it('label別にマージ件数・件数・成功率を分けて集計し、成功率降順で並べる', () => {
    const runs = [
      // bug: merged 1件, abandoned 1件 → successRate = 1/2
      makeRun({
        iteration: 1,
        verdict: 'merged',
        issue: { number: 1, title: 'a', labels: ['bug'] },
      }),
      makeRun({
        iteration: 2,
        verdict: 'abandoned',
        issue: { number: 2, title: 'b', labels: ['bug'] },
      }),
      // feature: merged 1件のみ → successRate = 1/1
      makeRun({
        iteration: 3,
        verdict: 'merged',
        issue: { number: 3, title: 'c', labels: ['feature'] },
      }),
    ];

    const result = issueLabelSuccessRates(runs);

    // 成功率降順: feature(100%) が bug(50%) より先
    expect(result.map((r) => r.label)).toEqual(['feature', 'bug']);

    const feature = result[0];
    expect(feature.count).toBe(1);
    expect(feature.mergedCount).toBe(1);
    expect(feature.successRate).toBeCloseTo(1, 10);
    expect(feature.iterations).toEqual([3]);

    const bug = result[1];
    expect(bug.count).toBe(2);
    expect(bug.mergedCount).toBe(1);
    expect(bug.successRate).toBeCloseTo(0.5, 10);
    expect(bug.iterations).toEqual([1, 2]);
  });

  it('1つのissueが複数labelを持つ場合、該当する全labelのバケットに数える', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'merged',
        issue: { number: 1, title: 'a', labels: ['bug', 'urgent'] },
      }),
    ];
    const result = issueLabelSuccessRates(runs);
    expect(result.map((r) => r.label).sort()).toEqual(['bug', 'urgent']);
    expect(result.every((r) => r.count === 1 && r.mergedCount === 1)).toBe(true);
  });

  it('成功率が同値のときはlabel名の昇順で並べる', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', issue: { number: 1, title: 'a', labels: ['zeta'] } }),
      makeRun({ iteration: 2, verdict: 'merged', issue: { number: 2, title: 'b', labels: ['alpha'] } }),
    ];
    const result = issueLabelSuccessRates(runs);
    expect(result.map((r) => r.label)).toEqual(['alpha', 'zeta']);
  });

  it('1件もマージされていないlabelはsuccessRate 0で、mergedCountも0のまま返す（分子が0でも欠落・NaNにならない）', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'abandoned', issue: { number: 1, title: 'a', labels: ['stale'] } }),
      makeRun({ iteration: 2, verdict: 'failed', issue: { number: 2, title: 'b', labels: ['stale'] } }),
    ];
    const result = issueLabelSuccessRates(runs);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ label: 'stale', count: 2, mergedCount: 0, successRate: 0 });
    expect(result[0].iterations).toEqual([1, 2]);
  });

  it('全labelのsuccessRateが0のとき、成功率降順ソートはNaN比較で崩れずlabel名昇順にフォールバックする', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'failed', issue: { number: 1, title: 'a', labels: ['zeta'] } }),
      makeRun({ iteration: 2, verdict: 'failed', issue: { number: 2, title: 'b', labels: ['alpha'] } }),
    ];
    const result = issueLabelSuccessRates(runs);
    expect(result.every((r) => r.successRate === 0)).toBe(true);
    expect(result.map((r) => r.label)).toEqual(['alpha', 'zeta']);
  });
});

describe('modelConfidenceWeightedScores', () => {
  it('run が0件なら空配列を返す', () => {
    expect(modelConfidenceWeightedScores([])).toEqual([]);
  });

  it('少数サンプルのモデルは全体平均側に縮約され、rawMergeRate=100%でも weightedScore は100%より大きく下がる', () => {
    const runs = [
      // model-a: 1件のみ merged → rawMergeRate = 100%（暴れやすい極端値）
      makeRun({
        iteration: 1,
        verdict: 'merged',
        models: { builder: 'model-a', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
      }),
      // model-b: 9件中3件 merged → rawMergeRate = 1/3
      ...Array.from({ length: 9 }, (_, i) =>
        makeRun({
          iteration: i + 2,
          verdict: i < 3 ? 'merged' : 'needs-human',
          models: { builder: 'model-b', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
        }),
      ),
    ];

    const result = modelConfidenceWeightedScores(runs);
    // globalMean = 4/10 = 0.4, priorWeight既定=5
    const a = result.find((r) => r.model === 'model-a')!;
    const b = result.find((r) => r.model === 'model-b')!;

    expect(a.rawMergeRate).toBe(1);
    expect(a.count).toBe(1);
    // (1*1 + 5*0.4) / (1+5) = 3/6 = 0.5
    expect(a.weightedScore).toBeCloseTo(0.5, 10);
    expect(a.confidence).toBeCloseTo(1 / 6, 10);

    expect(b.rawMergeRate).toBeCloseTo(1 / 3, 10);
    expect(b.count).toBe(9);
    // (9*(1/3) + 5*0.4) / (9+5) = 5/14
    expect(b.weightedScore).toBeCloseTo(5 / 14, 10);
    expect(b.confidence).toBeCloseTo(9 / 14, 10);

    // 生の値では model-a(100%) が model-b(33%) を圧倒的に上回るが、
    // 加重後は差が大きく縮まる（暴れの抑制）ことを確認する
    const rawGap = a.rawMergeRate - b.rawMergeRate;
    const weightedGap = a.weightedScore - b.weightedScore;
    expect(weightedGap).toBeLessThan(rawGap);
    expect(weightedGap).toBeGreaterThan(0);
  });

  it('件数が多いモデルは全体平均に引きずられにくく、weightedScore が rawMergeRate に近い値を保つ', () => {
    const runs = [
      // model-large: 100件中70件 merged → rawMergeRate = 0.7
      ...Array.from({ length: 100 }, (_, i) =>
        makeRun({
          iteration: i + 1,
          verdict: i < 70 ? 'merged' : 'needs-human',
          models: { builder: 'model-large', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
        }),
      ),
      // model-small: 1件 merged → rawMergeRate = 1（極端な少数サンプル）
      makeRun({
        iteration: 101,
        verdict: 'merged',
        models: { builder: 'model-small', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
      }),
    ];

    const result = modelConfidenceWeightedScores(runs);
    const large = result.find((r) => r.model === 'model-large')!;
    const small = result.find((r) => r.model === 'model-small')!;

    // globalMean = (70 + 1) / 101
    const globalMean = 71 / 101;

    // 100件の実績はほぼ動かない（差は 1%未満）
    expect(Math.abs(large.weightedScore - large.rawMergeRate)).toBeLessThan(0.01);
    expect(large.weightedScore).toBeCloseTo((100 * 0.7 + 5 * globalMean) / 105, 10);

    // 1件しかない model-small は priorWeight(5) が count(1) を上回るため、
    // rawMergeRate(100%) より全体平均寄りの値まで大きく下振れする
    expect(small.weightedScore).toBeCloseTo((1 * 1 + 5 * globalMean) / 6, 10);
    expect(small.weightedScore).toBeLessThan(0.9);
    expect(small.weightedScore).toBeGreaterThan(globalMean);
  });

  it('全反復が同一モデルなら事前平均=生の平均と一致し、priorWeightに関わらず weightedScore は rawMergeRate と一致する', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', models: { builder: 'solo-model', adversary: 'x', ideation: 'x' } }),
      makeRun({ iteration: 2, verdict: 'needs-human', models: { builder: 'solo-model', adversary: 'x', ideation: 'x' } }),
    ];
    const result = modelConfidenceWeightedScores(runs);
    expect(result).toHaveLength(1);
    expect(result[0].rawMergeRate).toBeCloseTo(0.5, 10);
    expect(result[0].weightedScore).toBeCloseTo(0.5, 10);
  });

  it('priorWeight=0 なら縮約が完全に無効化され weightedScore は rawMergeRate と一致する', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', models: { builder: 'model-a', adversary: 'x', ideation: 'x' } }),
      makeRun({ iteration: 2, verdict: 'needs-human', models: { builder: 'model-b', adversary: 'x', ideation: 'x' } }),
    ];
    const result = modelConfidenceWeightedScores(runs, 0);
    const a = result.find((r) => r.model === 'model-a')!;
    const b = result.find((r) => r.model === 'model-b')!;
    expect(a.weightedScore).toBe(a.rawMergeRate);
    expect(b.weightedScore).toBe(b.rawMergeRate);
    expect(a.confidence).toBe(1);
    expect(b.confidence).toBe(1);
  });

  it('weightedScore が同値のときはモデル名の昇順で安定させる', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', models: { builder: 'zeta-model', adversary: 'x', ideation: 'x' } }),
      makeRun({ iteration: 2, verdict: 'merged', models: { builder: 'alpha-model', adversary: 'x', ideation: 'x' } }),
    ];
    const result = modelConfidenceWeightedScores(runs);
    expect(result.map((r) => r.model)).toEqual(['alpha-model', 'zeta-model']);
  });

  it('対象iterationの一覧を昇順で保持する', () => {
    const runs = [
      makeRun({ iteration: 3, models: { builder: 'model-a', adversary: 'x', ideation: 'x' } }),
      makeRun({ iteration: 1, models: { builder: 'model-a', adversary: 'x', ideation: 'x' } }),
    ];
    const result = modelConfidenceWeightedScores(runs);
    expect(result[0].iterations).toEqual([1, 3]);
  });
});

describe('modelEfficiencyByRole', () => {
  it('run が0件なら空配列を返す', () => {
    expect(modelEfficiencyByRole([])).toEqual([]);
  });

  it('role は builder→adversary→ideation の固定順で3件返す', () => {
    const result = modelEfficiencyByRole([makeRun({ iteration: 1 })]);
    expect(result.map((r) => r.role)).toEqual(['builder', 'adversary', 'ideation']);
  });

  it('role×modelでコストを分離集計し、mergeRate降順で並べ、costPerMergedRunUsdは0除算を避けてnullにする', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'merged',
        cost: { builderUsd: 1, adversaryUsd: 0.1, ideationUsd: 0.05, totalUsd: 1.15 },
        models: { builder: 'sonnet', adversary: 'haiku', ideation: 'haiku' },
      }),
      makeRun({
        iteration: 2,
        verdict: 'needs-human',
        cost: { builderUsd: 2, adversaryUsd: 0.2, ideationUsd: 0.3, totalUsd: 2.5 },
        models: { builder: 'sonnet', adversary: 'haiku', ideation: 'opus' },
      }),
      makeRun({
        iteration: 3,
        verdict: 'merged',
        cost: { builderUsd: 0.5, adversaryUsd: 0.4, ideationUsd: 0.1, totalUsd: 1.0 },
        models: { builder: 'haiku', adversary: 'sonnet', ideation: 'haiku' },
      }),
    ];

    const result = modelEfficiencyByRole(runs);
    const byRole = Object.fromEntries(result.map((r) => [r.role, r.entries]));

    // builder: haiku(mergeRate=1) が sonnet(mergeRate=0.5) より先。同モデルでも role をまたいでコストを合算しない。
    expect(byRole.builder.map((e) => e.model)).toEqual(['haiku', 'sonnet']);
    const builderHaiku = byRole.builder[0];
    expect(builderHaiku.count).toBe(1);
    expect(builderHaiku.mergeRate).toBe(1);
    expect(builderHaiku.totalCostUsd).toBeCloseTo(0.5, 10);
    expect(builderHaiku.avgCostUsd).toBeCloseTo(0.5, 10);
    expect(builderHaiku.costPerMergedRunUsd).toBeCloseTo(0.5, 10);
    expect(builderHaiku.iterations).toEqual([3]);

    const builderSonnet = byRole.builder[1];
    expect(builderSonnet.count).toBe(2);
    expect(builderSonnet.mergeRate).toBeCloseTo(0.5, 10);
    expect(builderSonnet.totalCostUsd).toBeCloseTo(3, 10);
    expect(builderSonnet.avgCostUsd).toBeCloseTo(1.5, 10);
    expect(builderSonnet.costPerMergedRunUsd).toBeCloseTo(3, 10);
    expect(builderSonnet.iterations).toEqual([1, 2]);

    // adversary: sonnet(mergeRate=1) が haiku(mergeRate=0.5) より先。builderのコストとは別集計。
    expect(byRole.adversary.map((e) => e.model)).toEqual(['sonnet', 'haiku']);
    expect(byRole.adversary[0].totalCostUsd).toBeCloseTo(0.4, 10);
    expect(byRole.adversary[1].totalCostUsd).toBeCloseTo(0.3, 10);

    // ideation: haiku(mergeRate=1, 2件とも merged) が opus(mergeRate=0) より先。
    // opus はマージ0件なので costPerMergedRunUsd は0除算を避けて null。
    expect(byRole.ideation.map((e) => e.model)).toEqual(['haiku', 'opus']);
    const ideationHaiku = byRole.ideation[0];
    expect(ideationHaiku.count).toBe(2);
    expect(ideationHaiku.mergeRate).toBe(1);
    expect(ideationHaiku.totalCostUsd).toBeCloseTo(0.15, 10);
    expect(ideationHaiku.costPerMergedRunUsd).toBeCloseTo(0.075, 10);

    const ideationOpus = byRole.ideation[1];
    expect(ideationOpus.mergeRate).toBe(0);
    expect(ideationOpus.costPerMergedRunUsd).toBeNull();
  });

  it('mergeRateが同値のときはモデル名の昇順で安定させる', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', models: { builder: 'zeta', adversary: 'x', ideation: 'x' } }),
      makeRun({ iteration: 2, verdict: 'merged', models: { builder: 'alpha', adversary: 'x', ideation: 'x' } }),
    ];
    const result = modelEfficiencyByRole(runs);
    const builder = result.find((r) => r.role === 'builder')!;
    expect(builder.entries.map((e) => e.model)).toEqual(['alpha', 'zeta']);
  });
});

describe('builderModelSwitchComparisons', () => {
  it('run が0件なら空配列を返す', () => {
    expect(builderModelSwitchComparisons([])).toEqual([]);
  });

  it('builder モデルが1種類のまま（切り替えが一度も無い）なら空配列を返す', () => {
    const runs = [
      makeRun({ iteration: 1, models: { builder: 'model-a', adversary: 'x', ideation: 'x' } }),
      makeRun({ iteration: 2, models: { builder: 'model-a', adversary: 'x', ideation: 'x' } }),
      makeRun({ iteration: 3, models: { builder: 'model-a', adversary: 'x', ideation: 'x' } }),
    ];
    expect(builderModelSwitchComparisons(runs)).toEqual([]);
  });

  it('1回の切り替えで、切り替え直前区間(A)と直後区間(B)の承認率・マージ率・差分・verdictを算出する', () => {
    const runs = [
      // model-a: merged+approved 1件, needs-human+却下 1件 → approvalRate=0.5, mergeRate=0.5
      makeRun({
        iteration: 1,
        verdict: 'merged',
        adversary: { approved: true, summary: '' },
        models: { builder: 'model-a', adversary: 'x', ideation: 'x' },
      }),
      makeRun({
        iteration: 2,
        verdict: 'needs-human',
        adversary: { approved: false, summary: '' },
        models: { builder: 'model-a', adversary: 'x', ideation: 'x' },
      }),
      // model-b: merged+approved 1件のみ → approvalRate=1, mergeRate=1
      makeRun({
        iteration: 3,
        verdict: 'merged',
        adversary: { approved: true, summary: '' },
        models: { builder: 'model-b', adversary: 'x', ideation: 'x' },
      }),
    ];

    const result = builderModelSwitchComparisons(runs);
    expect(result).toHaveLength(1);

    const [c] = result;
    expect(c.switchIndex).toBe(1);
    expect(c.before).toEqual({
      model: 'model-a',
      fromIteration: 1,
      toIteration: 2,
      count: 2,
      approvalRate: 0.5,
      mergeRate: 0.5,
    });
    expect(c.after).toEqual({
      model: 'model-b',
      fromIteration: 3,
      toIteration: 3,
      count: 1,
      approvalRate: 1,
      mergeRate: 1,
    });
    expect(c.approvalRateDelta).toBeCloseTo(0.5, 10);
    expect(c.mergeRateDelta).toBeCloseTo(0.5, 10);
    expect(c.approvalVerdict).toBe('improved');
    expect(c.mergeVerdict).toBe('improved');
  });

  it('入力順が iteration 順でなくても、iteration 昇順に並べ直してから区間分割する', () => {
    const runs = [
      makeRun({
        iteration: 3,
        verdict: 'merged',
        adversary: { approved: true, summary: '' },
        models: { builder: 'model-b', adversary: 'x', ideation: 'x' },
      }),
      makeRun({
        iteration: 1,
        verdict: 'merged',
        adversary: { approved: true, summary: '' },
        models: { builder: 'model-a', adversary: 'x', ideation: 'x' },
      }),
      makeRun({
        iteration: 2,
        verdict: 'needs-human',
        adversary: { approved: false, summary: '' },
        models: { builder: 'model-a', adversary: 'x', ideation: 'x' },
      }),
    ];

    const result = builderModelSwitchComparisons(runs);
    expect(result).toHaveLength(1);
    expect(result[0].before.model).toBe('model-a');
    expect(result[0].before.count).toBe(2);
    expect(result[0].after.model).toBe('model-b');
  });

  it('A→B→A のように同じモデルが後で再登板した場合、揺り戻しごとに独立した切り替えイベントとして扱う（Aの合算はしない）', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'merged',
        adversary: { approved: true, summary: '' },
        models: { builder: 'model-a', adversary: 'x', ideation: 'x' },
      }),
      makeRun({
        iteration: 2,
        verdict: 'merged',
        adversary: { approved: true, summary: '' },
        models: { builder: 'model-b', adversary: 'x', ideation: 'x' },
      }),
      makeRun({
        iteration: 3,
        verdict: 'needs-human',
        adversary: { approved: false, summary: '' },
        models: { builder: 'model-a', adversary: 'x', ideation: 'x' },
      }),
    ];

    const result = builderModelSwitchComparisons(runs);
    expect(result).toHaveLength(2);

    expect(result[0].switchIndex).toBe(1);
    expect(result[0].before).toMatchObject({ model: 'model-a', fromIteration: 1, toIteration: 1 });
    expect(result[0].after).toMatchObject({ model: 'model-b', fromIteration: 2, toIteration: 2 });
    expect(result[0].approvalRateDelta).toBeCloseTo(0, 10);
    expect(result[0].mergeRateDelta).toBeCloseTo(0, 10);
    expect(result[0].approvalVerdict).toBe('unchanged');
    expect(result[0].mergeVerdict).toBe('unchanged');

    expect(result[1].switchIndex).toBe(2);
    expect(result[1].before).toMatchObject({ model: 'model-b', fromIteration: 2, toIteration: 2 });
    // 2回目の model-a 区間は1回目(iteration 1)と合算されず、iteration 3 のみの独立区間になる
    expect(result[1].after).toMatchObject({ model: 'model-a', fromIteration: 3, toIteration: 3, count: 1 });
    expect(result[1].after.approvalRate).toBe(0);
    expect(result[1].after.mergeRate).toBe(0);
    expect(result[1].approvalVerdict).toBe('regressed');
    expect(result[1].mergeVerdict).toBe('regressed');
  });

  it('failed run（verify未到達）は承認率の母集団から除くが、マージ率の母集団には含める', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'failed',
        adversary: { approved: false, summary: '' },
        models: { builder: 'model-a', adversary: 'x', ideation: 'x' },
      }),
      makeRun({
        iteration: 2,
        verdict: 'merged',
        adversary: { approved: true, summary: '' },
        models: { builder: 'model-a', adversary: 'x', ideation: 'x' },
      }),
      makeRun({
        iteration: 3,
        verdict: 'merged',
        adversary: { approved: true, summary: '' },
        models: { builder: 'model-b', adversary: 'x', ideation: 'x' },
      }),
    ];

    const result = builderModelSwitchComparisons(runs);
    expect(result).toHaveLength(1);
    // 承認率の分母は verify 到達済みの iteration 2 のみ → 1/1 = 1（failed は除外)
    expect(result[0].before.approvalRate).toBe(1);
    // マージ率の分母は全件(failed含む) 2件中 merged 1件 → 0.5
    expect(result[0].before.count).toBe(2);
    expect(result[0].before.mergeRate).toBe(0.5);
  });
});

describe('approvalRateTrendByModel', () => {
  it('run が0件なら空配列を返す', () => {
    expect(approvalRateTrendByModel([])).toEqual([]);
  });

  it('builder モデルごとに独立した累積承認率推移(0..100)を返す', () => {
    const runs = [
      makeRun({
        iteration: 1,
        adversary: { approved: true, summary: '' },
        models: { builder: 'claude-sonnet-5', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
      }),
      makeRun({
        iteration: 2,
        adversary: { approved: false, summary: '' },
        models: { builder: 'claude-haiku-4-5', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
      }),
      makeRun({
        iteration: 3,
        adversary: { approved: false, summary: '' },
        models: { builder: 'claude-sonnet-5', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
      }),
      makeRun({
        iteration: 4,
        adversary: { approved: true, summary: '' },
        models: { builder: 'claude-haiku-4-5', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
      }),
    ];

    const result = approvalRateTrendByModel(runs);

    // 同数(2件ずつ)なのでモデル名昇順: haiku が sonnet より先
    expect(result.map((r) => r.model)).toEqual(['claude-haiku-4-5', 'claude-sonnet-5']);

    const sonnet = result.find((r) => r.model === 'claude-sonnet-5')!;
    // sonnet: iteration1(approved)→100%, iteration3(not approved)→1/2=50%
    expect(sonnet.points).toEqual([
      { iteration: 1, value: 100 },
      { iteration: 3, value: 50 },
    ]);
    expect(sonnet.latestRate).toBe(50);
    expect(sonnet.count).toBe(2);

    const haiku = result.find((r) => r.model === 'claude-haiku-4-5')!;
    // haiku: iteration2(not approved)→0%, iteration4(approved)→1/2=50%
    expect(haiku.points).toEqual([
      { iteration: 2, value: 0 },
      { iteration: 4, value: 50 },
    ]);
    expect(haiku.latestRate).toBe(50);
    expect(haiku.count).toBe(2);
  });

  it('failed run（verify未到達）はこのmodelの推移から除外する（approvalRateTrendと同じ理由）', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'failed',
        adversary: { approved: false, summary: 'レビューに到達しなかった。' },
        models: { builder: 'claude-sonnet-5', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
      }),
      makeRun({
        iteration: 2,
        verdict: 'merged',
        adversary: { approved: true, summary: '' },
        models: { builder: 'claude-sonnet-5', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
      }),
    ];
    const result = approvalRateTrendByModel(runs);
    expect(result).toHaveLength(1);
    expect(result[0].points).toEqual([{ iteration: 2, value: 100 }]);
    expect(result[0].count).toBe(1);
  });

  it('verify到達済み反復が1件もないmodelはpoints空・latestRate 0・count 0（境界値）', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'failed',
        adversary: { approved: false, summary: '' },
        models: { builder: 'claude-sonnet-5', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
      }),
    ];
    const result = approvalRateTrendByModel(runs);
    expect(result).toEqual([{ model: 'claude-sonnet-5', points: [], latestRate: 0, count: 0 }]);
  });

  it('全て非承認ならそのmodelの推移は0%が続く（境界値）', () => {
    const runs = [
      makeRun({
        iteration: 1,
        adversary: { approved: false, summary: '' },
        models: { builder: 'claude-sonnet-5', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
      }),
      makeRun({
        iteration: 2,
        adversary: { approved: false, summary: '' },
        models: { builder: 'claude-sonnet-5', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
      }),
    ];
    const result = approvalRateTrendByModel(runs);
    expect(result[0].points).toEqual([
      { iteration: 1, value: 0 },
      { iteration: 2, value: 0 },
    ]);
    expect(result[0].latestRate).toBe(0);
  });

  it('各modelの最終点はmodelEffectiveness()が返す同じmodelのapprovalRate*100と一致する', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'merged',
        adversary: { approved: true, summary: '' },
        models: { builder: 'claude-sonnet-5', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
      }),
      makeRun({
        iteration: 2,
        verdict: 'failed',
        adversary: { approved: false, summary: 'レビューに到達しなかった。' },
        models: { builder: 'claude-sonnet-5', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
      }),
      makeRun({
        iteration: 3,
        verdict: 'needs-human',
        adversary: { approved: false, summary: '' },
        models: { builder: 'claude-sonnet-5', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
      }),
    ];
    const trendByModel = approvalRateTrendByModel(runs);
    const effectiveness = modelEffectiveness(runs);
    const sonnetTrend = trendByModel.find((r) => r.model === 'claude-sonnet-5')!;
    const sonnetEffectiveness = effectiveness.find((r) => r.model === 'claude-sonnet-5')!;
    expect(sonnetTrend.latestRate).toBeCloseTo(sonnetEffectiveness.approvalRate * 100, 10);
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

describe('e2eFailureDiffSizeCorrelation', () => {
  it('run が0件なら全て0、相関係数はnull（境界値）', () => {
    const result = e2eFailureDiffSizeCorrelation([]);
    expect(result).toEqual({
      sampleSize: 0,
      passedCount: 0,
      failedCount: 0,
      passedMeanChangedLines: 0,
      failedMeanChangedLines: 0,
      delta: 0,
      correlationCoefficient: null,
      failedIterations: [],
    });
  });

  it('verify に到達していない failed run は母集団から除外する', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'failed', verify: { unitPassed: false, e2ePassed: false, coveragePct: 0 }, changedLines: 0 }),
      makeRun({ iteration: 2, verify: { unitPassed: true, e2ePassed: true, coveragePct: 80 }, changedLines: 50 }),
    ];
    const result = e2eFailureDiffSizeCorrelation(runs);
    expect(result.sampleSize).toBe(1);
    expect(result.passedCount).toBe(1);
    expect(result.failedCount).toBe(0);
  });

  it('e2e成功群・失敗群それぞれ全て同じe2e結果（分散0）だと相関係数はnull（境界値）', () => {
    const runs = [
      makeRun({ iteration: 1, verify: { unitPassed: true, e2ePassed: true, coveragePct: 80 }, changedLines: 10 }),
      makeRun({ iteration: 2, verify: { unitPassed: true, e2ePassed: true, coveragePct: 80 }, changedLines: 90 }),
    ];
    const result = e2eFailureDiffSizeCorrelation(runs);
    expect(result.passedCount).toBe(2);
    expect(result.failedCount).toBe(0);
    expect(result.passedMeanChangedLines).toBeCloseTo(50, 10);
    expect(result.failedMeanChangedLines).toBe(0);
    expect(result.correlationCoefficient).toBeNull();
    expect(result.failedIterations).toEqual([]);
  });

  it('changedLinesが全run同値（分散0）でも相関係数はnull（境界値）', () => {
    const runs = [
      makeRun({ iteration: 1, verify: { unitPassed: true, e2ePassed: true, coveragePct: 80 }, changedLines: 42 }),
      makeRun({ iteration: 2, verify: { unitPassed: true, e2ePassed: false, coveragePct: 80 }, changedLines: 42 }),
    ];
    const result = e2eFailureDiffSizeCorrelation(runs);
    expect(result.correlationCoefficient).toBeNull();
  });

  it('e2e失敗群の変更行数が明確に多いケースで正の相関・正のdeltaを算出する', () => {
    const runs = [
      makeRun({ iteration: 1, verify: { unitPassed: true, e2ePassed: true, coveragePct: 80 }, changedLines: 20 }),
      makeRun({ iteration: 2, verify: { unitPassed: true, e2ePassed: true, coveragePct: 80 }, changedLines: 120 }),
      makeRun({ iteration: 3, verify: { unitPassed: true, e2ePassed: false, coveragePct: 80 }, changedLines: 320 }),
      makeRun({ iteration: 4, verify: { unitPassed: true, e2ePassed: false, coveragePct: 80 }, changedLines: 420 }),
    ];
    const result = e2eFailureDiffSizeCorrelation(runs);
    expect(result.sampleSize).toBe(4);
    expect(result.passedCount).toBe(2);
    expect(result.failedCount).toBe(2);
    expect(result.passedMeanChangedLines).toBeCloseTo(70, 10);
    expect(result.failedMeanChangedLines).toBeCloseTo(370, 10);
    expect(result.delta).toBeCloseTo(300, 10);
    expect(result.correlationCoefficient).not.toBeNull();
    expect(result.correlationCoefficient!).toBeCloseTo(0.9487, 4);
    expect(result.failedIterations).toEqual([3, 4]);
  });

  it('e2e失敗群の変更行数が成功群より少ないと負のdeltaになる', () => {
    const runs = [
      makeRun({ iteration: 1, verify: { unitPassed: true, e2ePassed: true, coveragePct: 80 }, changedLines: 500 }),
      makeRun({ iteration: 2, verify: { unitPassed: true, e2ePassed: false, coveragePct: 80 }, changedLines: 100 }),
    ];
    const result = e2eFailureDiffSizeCorrelation(runs);
    expect(result.delta).toBeCloseTo(-400, 10);
    expect(result.correlationCoefficient!).toBeLessThan(0);
  });
});

describe('builderVolumeApprovalCoupling', () => {
  it('run が0件なら null（比較対象が存在しない）', () => {
    expect(builderVolumeApprovalCoupling([])).toBeNull();
  });

  it('verify に到達した run が1件だけなら直前ウィンドウが取れず null（境界値）', () => {
    const runs = [makeRun({ iteration: 1, changedLines: 100 })];
    expect(builderVolumeApprovalCoupling(runs)).toBeNull();
  });

  it('verify に到達していない failed run は母集団から除外し、残り1件だけなら null', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'failed', verify: { unitPassed: false, e2ePassed: false, coveragePct: 0 }, changedLines: 0 }),
      makeRun({ iteration: 2, changedLines: 100 }),
    ];
    expect(builderVolumeApprovalCoupling(runs)).toBeNull();
  });

  it('生成量↑・承認率↓の2件で inverse 判定、相関係数は完全な負の相関(-1)になる（境界値: window=1）', () => {
    const runs = [
      makeRun({ iteration: 1, changedLines: 100, adversary: { approved: true, summary: '' } }),
      makeRun({ iteration: 2, changedLines: 200, adversary: { approved: false, summary: '' } }),
    ];
    const signal = builderVolumeApprovalCoupling(runs);
    expect(signal).not.toBeNull();
    expect(signal!.sampleSize).toBe(2);
    expect(signal!.windowSize).toBe(1);
    expect(signal!.partial).toBe(true);
    expect(signal!.recentAvgChangedLines).toBeCloseTo(200, 10);
    expect(signal!.previousAvgChangedLines).toBeCloseTo(100, 10);
    expect(signal!.recentApprovalRate).toBeCloseTo(0, 10);
    expect(signal!.previousApprovalRate).toBeCloseTo(1, 10);
    expect(signal!.volumeDeltaPct).toBeCloseTo(100, 10);
    expect(signal!.approvalRateDelta).toBeCloseTo(-1, 10);
    expect(signal!.direction).toBe('inverse');
    expect(signal!.correlationCoefficient).toBeCloseTo(-1, 10);
    expect(signal!.recentIterations).toEqual([2]);
    expect(signal!.previousIterations).toEqual([1]);
  });

  it('生成量↑・承認率↑がともに閾値を超えて動くと direct 判定になる', () => {
    const runs = [
      makeRun({ iteration: 1, changedLines: 100, adversary: { approved: false, summary: '' } }),
      makeRun({ iteration: 2, changedLines: 300, adversary: { approved: true, summary: '' } }),
    ];
    const signal = builderVolumeApprovalCoupling(runs);
    expect(signal!.volumeDeltaPct).toBeCloseTo(200, 10);
    expect(signal!.approvalRateDelta).toBeCloseTo(1, 10);
    expect(signal!.direction).toBe('direct');
  });

  it('生成量の変化率が閾値(5%)未満だと承認率が大きく動いても flat 判定になる（境界値）', () => {
    const runs = [
      makeRun({ iteration: 1, changedLines: 100, adversary: { approved: false, summary: '' } }),
      makeRun({ iteration: 2, changedLines: 104, adversary: { approved: true, summary: '' } }),
    ];
    const signal = builderVolumeApprovalCoupling(runs);
    expect(signal!.volumeDeltaPct).toBeCloseTo(4, 10);
    expect(signal!.direction).toBe('flat');
  });

  it('直前ウィンドウの平均変更行数が0だと変化率はnullになり flat 扱いになる（0除算回避、境界値）', () => {
    const runs = [
      makeRun({ iteration: 1, changedLines: 0, adversary: { approved: true, summary: '' } }),
      makeRun({ iteration: 2, changedLines: 50, adversary: { approved: false, summary: '' } }),
    ];
    const signal = builderVolumeApprovalCoupling(runs);
    expect(signal!.volumeDeltaPct).toBeNull();
    expect(signal!.direction).toBe('flat');
  });

  it('承認率の変化が閾値(0.05)未満だと生成量が大きく動いても flat 判定になる（境界値）', () => {
    const runs = [
      makeRun({ iteration: 1, changedLines: 100, adversary: { approved: true, summary: '' } }),
      makeRun({ iteration: 2, changedLines: 100, adversary: { approved: false, summary: '' } }),
      makeRun({ iteration: 3, changedLines: 100, adversary: { approved: true, summary: '' } }),
      makeRun({ iteration: 4, changedLines: 500, adversary: { approved: false, summary: '' } }),
    ];
    const signal = builderVolumeApprovalCoupling(runs);
    expect(signal!.windowSize).toBe(2);
    expect(signal!.partial).toBe(true);
    expect(signal!.previousApprovalRate).toBeCloseTo(0.5, 10);
    expect(signal!.recentApprovalRate).toBeCloseTo(0.5, 10);
    expect(signal!.approvalRateDelta).toBeCloseTo(0, 10);
    expect(signal!.volumeDeltaPct).toBeCloseTo(200, 10);
    expect(signal!.direction).toBe('flat');
  });

  it('6件・window=3で生成量3倍/承認率0への低下という明確な逆連動を検出し、r=-1/√2を算出する', () => {
    const runs = [
      makeRun({ iteration: 1, changedLines: 100, adversary: { approved: true, summary: '' } }),
      makeRun({ iteration: 2, changedLines: 100, adversary: { approved: true, summary: '' } }),
      makeRun({ iteration: 3, changedLines: 100, adversary: { approved: false, summary: '' } }),
      makeRun({ iteration: 4, changedLines: 300, adversary: { approved: false, summary: '' } }),
      makeRun({ iteration: 5, changedLines: 300, adversary: { approved: false, summary: '' } }),
      makeRun({ iteration: 6, changedLines: 300, adversary: { approved: false, summary: '' } }),
    ];
    const signal = builderVolumeApprovalCoupling(runs);
    expect(signal!.sampleSize).toBe(6);
    expect(signal!.windowSize).toBe(3);
    expect(signal!.partial).toBe(false);
    expect(signal!.previousAvgChangedLines).toBeCloseTo(100, 10);
    expect(signal!.recentAvgChangedLines).toBeCloseTo(300, 10);
    expect(signal!.previousApprovalRate).toBeCloseTo(2 / 3, 10);
    expect(signal!.recentApprovalRate).toBeCloseTo(0, 10);
    expect(signal!.direction).toBe('inverse');
    expect(signal!.correlationCoefficient).toBeCloseTo(-1 / Math.sqrt(2), 10);
    expect(signal!.recentIterations).toEqual([4, 5, 6]);
    expect(signal!.previousIterations).toEqual([1, 2, 3]);
  });

  it('changedLinesが全run同値（分散0）だと相関係数はnull（境界値）', () => {
    const runs = [
      makeRun({ iteration: 1, changedLines: 42, adversary: { approved: true, summary: '' } }),
      makeRun({ iteration: 2, changedLines: 42, adversary: { approved: false, summary: '' } }),
    ];
    const signal = builderVolumeApprovalCoupling(runs);
    expect(signal!.correlationCoefficient).toBeNull();
  });
});

describe('cycleTimeTrend', () => {
  it('iteration 昇順に durationSec(秒)をそのまま返す', () => {
    const runs = [
      makeRun({ iteration: 2, durationSec: 600 }),
      makeRun({ iteration: 1, durationSec: 300 }),
    ];
    expect(cycleTimeTrend(runs)).toEqual([
      { iteration: 1, value: 300 },
      { iteration: 2, value: 600 },
    ]);
  });

  it('failed run も除外せず含める（durationSec は verdict に関係なく必ず記録される）', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', durationSec: 300 }),
      makeRun({ iteration: 2, verdict: 'failed', durationSec: 45 }),
    ];
    expect(cycleTimeTrend(runs)).toEqual([
      { iteration: 1, value: 300 },
      { iteration: 2, value: 45 },
    ]);
  });

  it('空配列で空配列を返す', () => {
    expect(cycleTimeTrend([])).toEqual([]);
  });
});

describe('cycleTimeTrendSignal', () => {
  it('run が0件なら null（比較対象が存在しない）', () => {
    expect(cycleTimeTrendSignal([])).toBeNull();
  });

  it('run が1件だけなら直前ウィンドウが取れず null（境界値）', () => {
    const runs = [makeRun({ iteration: 1, durationSec: 300 })];
    expect(cycleTimeTrendSignal(runs)).toBeNull();
  });

  it('2件ちょうどなら window=1 で直近1件・直前1件を比較する', () => {
    const runs = [
      makeRun({ iteration: 1, durationSec: 300 }),
      makeRun({ iteration: 2, durationSec: 600 }),
    ];
    const signal = cycleTimeTrendSignal(runs);
    expect(signal).not.toBeNull();
    expect(signal!.windowSize).toBe(1);
    expect(signal!.partial).toBe(true);
    expect(signal!.recentAvgSec).toBeCloseTo(600, 10);
    expect(signal!.previousAvgSec).toBeCloseTo(300, 10);
    expect(signal!.recentIterations).toEqual([2]);
    expect(signal!.previousIterations).toEqual([1]);
    expect(signal!.direction).toBe('increasing');
  });

  it('直近平均が直前平均より閾値(CYCLE_TIME_TREND_FLAT_THRESHOLD_PCT)以上長いと increasing(悪化)', () => {
    const runs = [
      makeRun({ iteration: 1, durationSec: 100 }),
      makeRun({ iteration: 2, durationSec: 100 }),
      makeRun({ iteration: 3, durationSec: 100 }),
      makeRun({ iteration: 4, durationSec: 200 }),
      makeRun({ iteration: 5, durationSec: 200 }),
      makeRun({ iteration: 6, durationSec: 200 }),
    ];
    const signal = cycleTimeTrendSignal(runs);
    expect(signal!.windowSize).toBe(CYCLE_TIME_TREND_WINDOW);
    expect(signal!.partial).toBe(false);
    expect(signal!.previousAvgSec).toBeCloseTo(100, 10);
    expect(signal!.recentAvgSec).toBeCloseTo(200, 10);
    expect(signal!.deltaSec).toBeCloseTo(100, 10);
    expect(signal!.deltaPct).toBeCloseTo(100, 10);
    expect(signal!.direction).toBe('increasing');
    expect(signal!.recentIterations).toEqual([4, 5, 6]);
    expect(signal!.previousIterations).toEqual([1, 2, 3]);
  });

  it('直近平均が直前平均より短いと decreasing(改善)', () => {
    const runs = [
      makeRun({ iteration: 1, durationSec: 200 }),
      makeRun({ iteration: 2, durationSec: 200 }),
      makeRun({ iteration: 3, durationSec: 200 }),
      makeRun({ iteration: 4, durationSec: 100 }),
      makeRun({ iteration: 5, durationSec: 100 }),
      makeRun({ iteration: 6, durationSec: 100 }),
    ];
    const signal = cycleTimeTrendSignal(runs);
    expect(signal!.direction).toBe('decreasing');
    expect(signal!.deltaPct).toBeCloseTo(-50, 10);
  });

  it('変化率が閾値未満なら flat（僅かなブレをトレンドと誤認しない）', () => {
    expect(CYCLE_TIME_TREND_FLAT_THRESHOLD_PCT).toBe(5);
    const runs = [
      makeRun({ iteration: 1, durationSec: 100 }),
      makeRun({ iteration: 2, durationSec: 100 }),
      makeRun({ iteration: 3, durationSec: 100 }),
      // +4% は閾値(5%)未満なので flat になるはず
      makeRun({ iteration: 4, durationSec: 104 }),
      makeRun({ iteration: 5, durationSec: 104 }),
      makeRun({ iteration: 6, durationSec: 104 }),
    ];
    const signal = cycleTimeTrendSignal(runs);
    expect(signal!.direction).toBe('flat');
  });

  it('変化率がちょうど閾値と一致する場合は横ばい扱いにしない（閾値は排他的境界）', () => {
    const runs = [
      makeRun({ iteration: 1, durationSec: 100 }),
      makeRun({ iteration: 2, durationSec: 100 }),
      makeRun({ iteration: 3, durationSec: 100 }),
      // ちょうど+5%: `変化率 < 閾値` が横ばいの条件なので、5%ぴったりは flat にならない
      makeRun({ iteration: 4, durationSec: 105 }),
      makeRun({ iteration: 5, durationSec: 105 }),
      makeRun({ iteration: 6, durationSec: 105 }),
    ];
    const signal = cycleTimeTrendSignal(runs);
    expect(signal!.direction).toBe('increasing');
  });

  it('反復数が奇数(7件)でも window は CYCLE_TIME_TREND_WINDOW を超えず、直近3件・直前3件のみを見る', () => {
    const runs = [
      makeRun({ iteration: 1, durationSec: 9999 }), // window に含まれず無視されるはず
      makeRun({ iteration: 2, durationSec: 100 }),
      makeRun({ iteration: 3, durationSec: 100 }),
      makeRun({ iteration: 4, durationSec: 100 }),
      makeRun({ iteration: 5, durationSec: 200 }),
      makeRun({ iteration: 6, durationSec: 200 }),
      makeRun({ iteration: 7, durationSec: 200 }),
    ];
    const signal = cycleTimeTrendSignal(runs);
    expect(signal!.windowSize).toBe(3);
    expect(signal!.previousIterations).toEqual([2, 3, 4]);
    expect(signal!.recentIterations).toEqual([5, 6, 7]);
    expect(signal!.previousAvgSec).toBeCloseTo(100, 10);
  });

  it('failed run のdurationSecも比較対象に含める（verdictに関係なく必ず記録されるため）', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', durationSec: 100 }),
      makeRun({ iteration: 2, verdict: 'failed', durationSec: 300 }),
    ];
    const signal = cycleTimeTrendSignal(runs);
    expect(signal!.recentAvgSec).toBeCloseTo(300, 10);
    expect(signal!.previousAvgSec).toBeCloseTo(100, 10);
  });

  it('直前ウィンドウの平均が0(境界値)でも direction を安全に判定する（ゼロ除算を回避）', () => {
    const runs = [
      makeRun({ iteration: 1, durationSec: 0 }),
      makeRun({ iteration: 2, durationSec: 50 }),
    ];
    const signal = cycleTimeTrendSignal(runs);
    expect(signal!.previousAvgSec).toBe(0);
    expect(signal!.deltaPct).toBeNull();
    expect(signal!.direction).toBe('increasing');
  });

  it('直前・直近ともにdurationSecが0(境界値)ならflat', () => {
    const runs = [
      makeRun({ iteration: 1, durationSec: 0 }),
      makeRun({ iteration: 2, durationSec: 0 }),
    ];
    const signal = cycleTimeTrendSignal(runs);
    expect(signal!.direction).toBe('flat');
    expect(signal!.deltaPct).toBeNull();
  });
});

describe('timeToFirstPrTrend', () => {
  it('iteration 昇順に durationSec(秒)をそのまま返す', () => {
    const runs = [
      makeRun({ iteration: 2, durationSec: 600, prNumber: 22 }),
      makeRun({ iteration: 1, durationSec: 300, prNumber: 11 }),
    ];
    expect(timeToFirstPrTrend(runs)).toEqual([
      { iteration: 1, value: 300 },
      { iteration: 2, value: 600 },
    ]);
  });

  it('PRが一度も開かれなかった反復(prNumber: null)は除外する', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', durationSec: 300, prNumber: 11 }),
      makeRun({ iteration: 2, verdict: 'failed', durationSec: 45, prNumber: null }),
      makeRun({ iteration: 3, verdict: 'abandoned', durationSec: 90, prNumber: null }),
    ];
    expect(timeToFirstPrTrend(runs)).toEqual([{ iteration: 1, value: 300 }]);
  });

  it('全反復がprNumber: nullなら空配列を返す（cycleTimeTrendとの違い）', () => {
    const runs = [makeRun({ iteration: 1, durationSec: 300, prNumber: null })];
    expect(timeToFirstPrTrend(runs)).toEqual([]);
    // 同じ入力でも cycleTimeTrend は verdict/prNumber に関係なく全件を含める
    expect(cycleTimeTrend(runs)).toEqual([{ iteration: 1, value: 300 }]);
  });

  it('空配列で空配列を返す', () => {
    expect(timeToFirstPrTrend([])).toEqual([]);
  });
});

describe('timeToFirstPrTrendSignal', () => {
  it('run が0件なら null（比較対象が存在しない）', () => {
    expect(timeToFirstPrTrendSignal([])).toBeNull();
  });

  it('PRが作られた反復が1件だけなら直前ウィンドウが取れず null（境界値）', () => {
    const runs = [makeRun({ iteration: 1, durationSec: 300, prNumber: 11 })];
    expect(timeToFirstPrTrendSignal(runs)).toBeNull();
  });

  it('PRが作られた反復が1件しか無い場合、他にPR未作成の反復が何件あっても null のまま', () => {
    const runs = [
      makeRun({ iteration: 1, durationSec: 300, prNumber: 11 }),
      makeRun({ iteration: 2, durationSec: 45, prNumber: null, verdict: 'failed' }),
      makeRun({ iteration: 3, durationSec: 45, prNumber: null, verdict: 'failed' }),
    ];
    expect(timeToFirstPrTrendSignal(runs)).toBeNull();
  });

  it('2件ちょうどなら window=1 で直近1件・直前1件を比較する', () => {
    const runs = [
      makeRun({ iteration: 1, durationSec: 300, prNumber: 11 }),
      makeRun({ iteration: 2, durationSec: 600, prNumber: 22 }),
    ];
    const signal = timeToFirstPrTrendSignal(runs);
    expect(signal).not.toBeNull();
    expect(signal!.windowSize).toBe(1);
    expect(signal!.partial).toBe(true);
    expect(signal!.recentAvgSec).toBeCloseTo(600, 10);
    expect(signal!.previousAvgSec).toBeCloseTo(300, 10);
    expect(signal!.recentIterations).toEqual([2]);
    expect(signal!.previousIterations).toEqual([1]);
    expect(signal!.direction).toBe('increasing');
  });

  it('直近平均が直前平均より閾値(TIME_TO_FIRST_PR_TREND_FLAT_THRESHOLD_PCT)以上長いと increasing(悪化)', () => {
    const runs = [
      makeRun({ iteration: 1, durationSec: 100, prNumber: 11 }),
      makeRun({ iteration: 2, durationSec: 100, prNumber: 12 }),
      makeRun({ iteration: 3, durationSec: 100, prNumber: 13 }),
      makeRun({ iteration: 4, durationSec: 200, prNumber: 14 }),
      makeRun({ iteration: 5, durationSec: 200, prNumber: 15 }),
      makeRun({ iteration: 6, durationSec: 200, prNumber: 16 }),
    ];
    const signal = timeToFirstPrTrendSignal(runs);
    expect(signal!.windowSize).toBe(TIME_TO_FIRST_PR_TREND_WINDOW);
    expect(signal!.partial).toBe(false);
    expect(signal!.previousAvgSec).toBeCloseTo(100, 10);
    expect(signal!.recentAvgSec).toBeCloseTo(200, 10);
    expect(signal!.deltaSec).toBeCloseTo(100, 10);
    expect(signal!.deltaPct).toBeCloseTo(100, 10);
    expect(signal!.direction).toBe('increasing');
    expect(signal!.recentIterations).toEqual([4, 5, 6]);
    expect(signal!.previousIterations).toEqual([1, 2, 3]);
  });

  it('直近平均が直前平均より短いと decreasing(改善)', () => {
    const runs = [
      makeRun({ iteration: 1, durationSec: 200, prNumber: 11 }),
      makeRun({ iteration: 2, durationSec: 200, prNumber: 12 }),
      makeRun({ iteration: 3, durationSec: 200, prNumber: 13 }),
      makeRun({ iteration: 4, durationSec: 100, prNumber: 14 }),
      makeRun({ iteration: 5, durationSec: 100, prNumber: 15 }),
      makeRun({ iteration: 6, durationSec: 100, prNumber: 16 }),
    ];
    const signal = timeToFirstPrTrendSignal(runs);
    expect(signal!.direction).toBe('decreasing');
    expect(signal!.deltaPct).toBeCloseTo(-50, 10);
  });

  it('変化率が閾値未満なら flat（僅かなブレをトレンドと誤認しない）', () => {
    expect(TIME_TO_FIRST_PR_TREND_FLAT_THRESHOLD_PCT).toBe(5);
    const runs = [
      makeRun({ iteration: 1, durationSec: 100, prNumber: 11 }),
      makeRun({ iteration: 2, durationSec: 100, prNumber: 12 }),
      makeRun({ iteration: 3, durationSec: 100, prNumber: 13 }),
      // +4% は閾値(5%)未満なので flat になるはず
      makeRun({ iteration: 4, durationSec: 104, prNumber: 14 }),
      makeRun({ iteration: 5, durationSec: 104, prNumber: 15 }),
      makeRun({ iteration: 6, durationSec: 104, prNumber: 16 }),
    ];
    const signal = timeToFirstPrTrendSignal(runs);
    expect(signal!.direction).toBe('flat');
  });

  it('PR未作成の反復(prNumber: null)は比較windowの母集団から除外される', () => {
    // iteration 2 は prNumber: null なので timeToFirstPrTrend の点として現れず、
    // window=1 の比較は実質 iteration(1) vs iteration(3) になる。
    const runs = [
      makeRun({ iteration: 1, durationSec: 100, prNumber: 11 }),
      makeRun({ iteration: 2, durationSec: 99999, prNumber: null, verdict: 'failed' }),
      makeRun({ iteration: 3, durationSec: 500, prNumber: 13 }),
    ];
    const signal = timeToFirstPrTrendSignal(runs);
    expect(signal!.windowSize).toBe(1);
    expect(signal!.previousIterations).toEqual([1]);
    expect(signal!.recentIterations).toEqual([3]);
    expect(signal!.previousAvgSec).toBeCloseTo(100, 10);
    expect(signal!.recentAvgSec).toBeCloseTo(500, 10);
  });

  it('直前ウィンドウの平均が0(境界値)でも direction を安全に判定する（ゼロ除算を回避）', () => {
    const runs = [
      makeRun({ iteration: 1, durationSec: 0, prNumber: 11 }),
      makeRun({ iteration: 2, durationSec: 50, prNumber: 12 }),
    ];
    const signal = timeToFirstPrTrendSignal(runs);
    expect(signal!.previousAvgSec).toBe(0);
    expect(signal!.deltaPct).toBeNull();
    expect(signal!.direction).toBe('increasing');
  });

  it('直前・直近ともにdurationSecが0(境界値)ならflat', () => {
    const runs = [
      makeRun({ iteration: 1, durationSec: 0, prNumber: 11 }),
      makeRun({ iteration: 2, durationSec: 0, prNumber: 12 }),
    ];
    const signal = timeToFirstPrTrendSignal(runs);
    expect(signal!.direction).toBe('flat');
    expect(signal!.deltaPct).toBeNull();
  });
});

describe('leadTimeInversions', () => {
  it('空配列で空配列を返す', () => {
    expect(leadTimeInversions([])).toEqual([]);
  });

  it('PR作成反復が1件だけなら比較ペアが無く空配列', () => {
    const runs = [makeRun({ iteration: 1, durationSec: 100, prNumber: 1 })];
    expect(leadTimeInversions(runs)).toEqual([]);
  });

  it('単調に短縮している場合は逆転なし', () => {
    const runs = [
      makeRun({ iteration: 1, durationSec: 300, prNumber: 1 }),
      makeRun({ iteration: 2, durationSec: 200, prNumber: 2 }),
      makeRun({ iteration: 3, durationSec: 100, prNumber: 3 }),
    ];
    expect(leadTimeInversions(runs)).toEqual([]);
  });

  it('閾値(LEAD_TIME_INVERSION_THRESHOLD_PCT)以上長くなった隣接ペアだけを逆転として抽出する', () => {
    expect(LEAD_TIME_INVERSION_THRESHOLD_PCT).toBe(5);
    const runs = [
      makeRun({ iteration: 1, durationSec: 100, prNumber: 1 }),
      // +4% は閾値未満なのでノイズ扱い（逆転として数えない）
      makeRun({ iteration: 2, durationSec: 104, prNumber: 2 }),
      // 直前(104)から+50%は明確な逆転
      makeRun({ iteration: 3, durationSec: 156, prNumber: 3 }),
    ];
    const result = leadTimeInversions(runs);
    expect(result).toEqual([
      { iteration: 3, previousIteration: 2, value: 156, previousValue: 104, deltaSec: 52, deltaPct: 50 },
    ]);
  });

  it('直前値が0(境界値)でも増加していれば逆転として扱い、deltaPctはnull（ゼロ除算回避）', () => {
    const runs = [
      makeRun({ iteration: 1, durationSec: 0, prNumber: 1 }),
      makeRun({ iteration: 2, durationSec: 30, prNumber: 2 }),
    ];
    expect(leadTimeInversions(runs)).toEqual([
      { iteration: 2, previousIteration: 1, value: 30, previousValue: 0, deltaSec: 30, deltaPct: null },
    ]);
  });

  it('直前値が0で値も変わらない(0のまま)場合は逆転にならない', () => {
    const runs = [
      makeRun({ iteration: 1, durationSec: 0, prNumber: 1 }),
      makeRun({ iteration: 2, durationSec: 0, prNumber: 2 }),
    ];
    expect(leadTimeInversions(runs)).toEqual([]);
  });

  it('PR未作成の反復(prNumber: null)は母集団から除外され、隣接比較にも登場しない', () => {
    const runs = [
      makeRun({ iteration: 1, durationSec: 100, prNumber: 1 }),
      makeRun({ iteration: 2, durationSec: 99999, prNumber: null, verdict: 'failed' }),
      makeRun({ iteration: 3, durationSec: 100, prNumber: 3 }),
    ];
    // iteration 2 が母集団に含まれていれば 1→2 も 2→3 も巨大な逆転/改善になるはずだが、
    // 実際は 1(100) と 3(100) の隣接比較(差0)のみが行われ、逆転は検出されない。
    expect(leadTimeInversions(runs)).toEqual([]);
  });
});

describe('builderUtilizationDeclineSignal', () => {
  it('run が0件なら null（比較対象が存在しない）', () => {
    expect(builderUtilizationDeclineSignal([])).toBeNull();
  });

  it('PR作成反復が1件だけなら null（境界値）', () => {
    const runs = [makeRun({ iteration: 1, durationSec: 100, prNumber: 1 })];
    expect(builderUtilizationDeclineSignal(runs)).toBeNull();
  });

  it('BUILDER_UTILIZATION_DECLINE_STREAK_THRESHOLD は既定で2', () => {
    expect(BUILDER_UTILIZATION_DECLINE_STREAK_THRESHOLD).toBe(2);
  });

  it('逆転が1回だけなら streak=1 で未発報（閾値2に届かない）', () => {
    const runs = [
      makeRun({ iteration: 1, durationSec: 100, prNumber: 1 }),
      makeRun({ iteration: 2, durationSec: 300, prNumber: 2 }),
    ];
    const signal = builderUtilizationDeclineSignal(runs);
    expect(signal!.streak).toBe(1);
    expect(signal!.triggered).toBe(false);
    expect(signal!.totalInversions).toBe(1);
    expect(signal!.totalComparisons).toBe(1);
    expect(signal!.inversionRatePct).toBeCloseTo(100, 10);
    expect(signal!.streakInversions.map((i) => i.iteration)).toEqual([2]);
  });

  it('データ終端まで2回連続で逆転すると発報し、連続分の逆転記録をstreakInversionsに含める', () => {
    const runs = [
      makeRun({ iteration: 1, durationSec: 100, prNumber: 1 }),
      makeRun({ iteration: 2, durationSec: 200, prNumber: 2 }),
      makeRun({ iteration: 3, durationSec: 400, prNumber: 3 }),
    ];
    const signal = builderUtilizationDeclineSignal(runs);
    expect(signal!.streak).toBe(2);
    expect(signal!.triggered).toBe(true);
    expect(signal!.totalInversions).toBe(2);
    expect(signal!.totalComparisons).toBe(2);
    expect(signal!.inversionRatePct).toBeCloseTo(100, 10);
    expect(signal!.streakInversions.map((i) => i.iteration)).toEqual([2, 3]);
  });

  it('過去に逆転があってもデータ終端が改善していればstreakは0に戻り未発報（トレイリング判定）', () => {
    const runs = [
      makeRun({ iteration: 1, durationSec: 100, prNumber: 1 }),
      makeRun({ iteration: 2, durationSec: 300, prNumber: 2 }),
      makeRun({ iteration: 3, durationSec: 600, prNumber: 3 }),
      makeRun({ iteration: 4, durationSec: 60, prNumber: 4 }),
    ];
    const signal = builderUtilizationDeclineSignal(runs);
    expect(signal!.streak).toBe(0);
    expect(signal!.triggered).toBe(false);
    expect(signal!.streakInversions).toEqual([]);
    // 総逆転数は過去分を含めて2件のまま保持される（トレンドの記録自体は消えない）
    expect(signal!.totalInversions).toBe(2);
    expect(signal!.totalComparisons).toBe(3);
  });

  it('ノイズレベルの変化（閾値未満）は逆転として数えない', () => {
    const runs = [
      makeRun({ iteration: 1, durationSec: 100, prNumber: 1 }),
      makeRun({ iteration: 2, durationSec: 101, prNumber: 2 }),
      makeRun({ iteration: 3, durationSec: 102, prNumber: 3 }),
    ];
    const signal = builderUtilizationDeclineSignal(runs);
    expect(signal!.streak).toBe(0);
    expect(signal!.triggered).toBe(false);
    expect(signal!.totalInversions).toBe(0);
    expect(signal!.inversionRatePct).toBe(0);
  });
});

describe('issueResolutionTimeTrend', () => {
  it('nextIssuesに現れた反復のfinishedAtを生成時刻、merged/abandonedに達した反復のfinishedAtをクローズ時刻として解決時間(秒)を返す', () => {
    const runs = [
      makeRun({
        iteration: 1,
        issue: { number: 1, title: 'gen', labels: [] },
        finishedAt: '2026-07-20T00:00:00Z',
        nextIssues: [10],
      }),
      makeRun({
        iteration: 2,
        issue: { number: 10, title: 'x', labels: [] },
        finishedAt: '2026-07-20T00:10:00Z',
        verdict: 'merged',
      }),
    ];
    expect(issueResolutionTimeTrend(runs)).toEqual([
      { iteration: 2, issueNumber: 10, value: 600, createdIteration: 1 },
    ]);
  });

  it('abandonedもクローズとして扱う（types.tsの通りissueはクローズされる）', () => {
    const runs = [
      makeRun({ iteration: 1, issue: { number: 1, title: 'gen', labels: [] }, finishedAt: '2026-07-20T00:00:00Z', nextIssues: [10] }),
      makeRun({
        iteration: 2,
        issue: { number: 10, title: 'x', labels: [] },
        finishedAt: '2026-07-20T00:05:00Z',
        verdict: 'abandoned',
      }),
    ];
    expect(issueResolutionTimeTrend(runs)).toEqual([
      { iteration: 2, issueNumber: 10, value: 300, createdIteration: 1 },
    ]);
  });

  it.each<Verdict>(['failed', 'paused', 'dry-run', 'needs-human'])(
    'verdict:%s はクローズとみなさず対象外',
    (verdict) => {
      const runs = [
        makeRun({ iteration: 1, issue: { number: 1, title: 'gen', labels: [] }, nextIssues: [10] }),
        makeRun({ iteration: 2, issue: { number: 10, title: 'x', labels: [] }, verdict }),
      ];
      expect(issueResolutionTimeTrend(runs)).toEqual([]);
    },
  );

  it('nextIssuesにも自分自身のissue番号にも一度も現れないissue（生成元不明）は対象外', () => {
    const runs = [makeRun({ iteration: 1, issue: { number: 1, title: 'x', labels: [] }, verdict: 'merged' })];
    expect(issueResolutionTimeTrend(runs)).toEqual([]);
  });

  it('生成反復のiterationがクローズ反復以上（自己参照）の場合は対象外', () => {
    // ideationCostQualityCorrelation と同じ自己参照ケース: nextIssuesに提案元自身の番号を含む
    const runs = [
      makeRun({ iteration: 1, issue: { number: 5, title: 'x', labels: [] }, verdict: 'merged', nextIssues: [5] }),
    ];
    expect(issueResolutionTimeTrend(runs)).toEqual([]);
  });

  it('同一issue番号が複数回dispatchされても、生成後最初のクローズだけを1件として数える', () => {
    const runs = [
      makeRun({ iteration: 1, issue: { number: 1, title: 'gen', labels: [] }, finishedAt: '2026-07-20T00:00:00Z', nextIssues: [10] }),
      makeRun({
        iteration: 2,
        issue: { number: 10, title: 'x', labels: [] },
        finishedAt: '2026-07-20T00:10:00Z',
        verdict: 'merged',
      }),
      // 誤って再dispatchされた2回目。重複カウントされてはいけない
      makeRun({
        iteration: 3,
        issue: { number: 10, title: 'x', labels: [] },
        finishedAt: '2026-07-20T05:00:00Z',
        verdict: 'merged',
      }),
    ];
    const points = issueResolutionTimeTrend(runs);
    expect(points).toHaveLength(1);
    expect(points[0]).toEqual({ iteration: 2, issueNumber: 10, value: 600, createdIteration: 1 });
  });

  it('生成元の反復のnextIssuesに複数issueが含まれていても、それぞれのクローズ時に個別の点として現れる', () => {
    const runs = [
      makeRun({ iteration: 1, issue: { number: 1, title: 'gen', labels: [] }, finishedAt: '2026-07-20T00:00:00Z', nextIssues: [10, 20] }),
      makeRun({ iteration: 2, issue: { number: 10, title: 'a', labels: [] }, finishedAt: '2026-07-20T00:05:00Z', verdict: 'merged' }),
      makeRun({ iteration: 3, issue: { number: 20, title: 'b', labels: [] }, finishedAt: '2026-07-20T00:20:00Z', verdict: 'abandoned' }),
    ];
    expect(issueResolutionTimeTrend(runs)).toEqual([
      { iteration: 2, issueNumber: 10, value: 300, createdIteration: 1 },
      { iteration: 3, issueNumber: 20, value: 1200, createdIteration: 1 },
    ]);
  });

  it('空配列で空配列を返す', () => {
    expect(issueResolutionTimeTrend([])).toEqual([]);
  });
});

describe('issueResolutionTimeTrendSignal', () => {
  it('run が0件なら null（比較対象が存在しない）', () => {
    expect(issueResolutionTimeTrendSignal([])).toBeNull();
  });

  it('解決済みissueが1件だけなら直前ウィンドウが取れず null（境界値）', () => {
    const runs = [
      makeRun({ iteration: 1, issue: { number: 1, title: 'gen', labels: [] }, nextIssues: [10] }),
      makeRun({ iteration: 2, issue: { number: 10, title: 'x', labels: [] }, verdict: 'merged' }),
    ];
    expect(issueResolutionTimeTrendSignal(runs)).toBeNull();
  });

  function genAndClose(
    genIteration: number,
    closeIteration: number,
    issueNumber: number,
    resolutionSec: number,
  ): RunRecord[] {
    return [
      makeRun({
        iteration: genIteration,
        issue: { number: genIteration, title: 'gen', labels: [] },
        finishedAt: '2026-07-20T00:00:00Z',
        nextIssues: [issueNumber],
      }),
      makeRun({
        iteration: closeIteration,
        issue: { number: issueNumber, title: 'x', labels: [] },
        finishedAt: new Date(new Date('2026-07-20T00:00:00Z').getTime() + resolutionSec * 1000).toISOString(),
        verdict: 'merged',
      }),
    ];
  }

  it('解決時間の直近平均が直前平均より閾値以上長いと increasing(悪化)', () => {
    expect(ISSUE_RESOLUTION_TIME_TREND_FLAT_THRESHOLD_PCT).toBe(5);
    const runs = [
      ...genAndClose(1, 2, 101, 100),
      ...genAndClose(3, 4, 102, 100),
      ...genAndClose(5, 6, 103, 100),
      ...genAndClose(7, 8, 104, 200),
      ...genAndClose(9, 10, 105, 200),
      ...genAndClose(11, 12, 106, 200),
    ];
    const signal = issueResolutionTimeTrendSignal(runs);
    expect(signal).not.toBeNull();
    expect(signal!.windowSize).toBe(ISSUE_RESOLUTION_TIME_TREND_WINDOW);
    expect(signal!.partial).toBe(false);
    expect(signal!.previousAvgSec).toBeCloseTo(100, 10);
    expect(signal!.recentAvgSec).toBeCloseTo(200, 10);
    expect(signal!.deltaPct).toBeCloseTo(100, 10);
    expect(signal!.direction).toBe('increasing');
    expect(signal!.recentIterations).toEqual([8, 10, 12]);
    expect(signal!.previousIterations).toEqual([2, 4, 6]);
  });

  it('解決時間の直近平均が直前平均より短いと decreasing(改善)', () => {
    const runs = [
      ...genAndClose(1, 2, 101, 200),
      ...genAndClose(3, 4, 102, 200),
      ...genAndClose(5, 6, 103, 200),
      ...genAndClose(7, 8, 104, 100),
      ...genAndClose(9, 10, 105, 100),
      ...genAndClose(11, 12, 106, 100),
    ];
    const signal = issueResolutionTimeTrendSignal(runs);
    expect(signal!.direction).toBe('decreasing');
    expect(signal!.deltaPct).toBeCloseTo(-50, 10);
  });

  it('変化率が閾値未満なら flat（僅かなブレをトレンドと誤認しない）', () => {
    const runs = [
      ...genAndClose(1, 2, 101, 100),
      ...genAndClose(3, 4, 102, 100),
      ...genAndClose(5, 6, 103, 100),
      // +4% は閾値(5%)未満なので flat になるはず
      ...genAndClose(7, 8, 104, 104),
      ...genAndClose(9, 10, 105, 104),
      ...genAndClose(11, 12, 106, 104),
    ];
    const signal = issueResolutionTimeTrendSignal(runs);
    expect(signal!.direction).toBe('flat');
  });

  it('2件ちょうどならwindow=1でpartial=trueになる', () => {
    const runs = [...genAndClose(1, 2, 101, 100), ...genAndClose(3, 4, 102, 200)];
    const signal = issueResolutionTimeTrendSignal(runs);
    expect(signal!.windowSize).toBe(1);
    expect(signal!.partial).toBe(true);
    expect(signal!.recentAvgSec).toBeCloseTo(200, 10);
    expect(signal!.previousAvgSec).toBeCloseTo(100, 10);
  });

  it('直前ウィンドウの平均が0(境界値)でもゼロ除算を回避してdirectionを判定する', () => {
    const runs = [...genAndClose(1, 2, 101, 0), ...genAndClose(3, 4, 102, 50)];
    const signal = issueResolutionTimeTrendSignal(runs);
    expect(signal!.previousAvgSec).toBe(0);
    expect(signal!.deltaPct).toBeNull();
    expect(signal!.direction).toBe('increasing');
  });

  it('未解決（クローズしていない）issueは母集団から除外される', () => {
    const runs = [
      ...genAndClose(1, 2, 101, 100),
      // issue #103 は生成されたがまだクローズしていない
      makeRun({ iteration: 3, issue: { number: 3, title: 'gen', labels: [] }, nextIssues: [103] }),
    ];
    expect(issueResolutionTimeTrendSignal(runs)).toBeNull();
  });
});

describe('adversarySummaryLengthTrend', () => {
  it('iteration昇順に、前後の空白を除いたsummaryの文字数を返す', () => {
    const runs = [
      makeRun({ iteration: 2, adversary: { approved: true, summary: '  ab  ' } }),
      makeRun({ iteration: 1, adversary: { approved: true, summary: 'あいうえお' } }),
    ];
    expect(adversarySummaryLengthTrend(runs)).toEqual([
      { iteration: 1, value: 5 },
      { iteration: 2, value: 2 },
    ]);
  });

  it('failed runは除外する（summaryはレビュー未到達の定型文であり実測ではないため）', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', adversary: { approved: true, summary: '12345' } }),
      makeRun({ iteration: 2, verdict: 'failed', adversary: { approved: false, summary: 'レビューに到達しなかった。' } }),
    ];
    expect(adversarySummaryLengthTrend(runs)).toEqual([{ iteration: 1, value: 5 }]);
  });

  it('空白のみのsummaryは0文字になる（境界値）', () => {
    const runs = [makeRun({ iteration: 1, adversary: { approved: true, summary: '   ' } })];
    expect(adversarySummaryLengthTrend(runs)).toEqual([{ iteration: 1, value: 0 }]);
  });

  it('空配列で空配列を返す', () => {
    expect(adversarySummaryLengthTrend([])).toEqual([]);
  });
});

describe('adversaryCommentTrendSignal', () => {
  it('run が0件ならnull（比較対象が存在しない）', () => {
    expect(adversaryCommentTrendSignal([])).toBeNull();
  });

  it('verify到達済みrunが1件だけならnull（境界値）', () => {
    const runs = [makeRun({ iteration: 1, adversary: { approved: true, summary: 'x'.repeat(10) } })];
    expect(adversaryCommentTrendSignal(runs)).toBeNull();
  });

  it('2件ちょうどならwindow=1で直近1件・直前1件を比較する', () => {
    const runs = [
      makeRun({ iteration: 1, adversary: { approved: true, summary: 'x'.repeat(10) } }),
      makeRun({ iteration: 2, adversary: { approved: true, summary: 'x'.repeat(30) } }),
    ];
    const signal = adversaryCommentTrendSignal(runs);
    expect(signal).not.toBeNull();
    expect(signal!.windowSize).toBe(1);
    expect(signal!.partial).toBe(true);
    expect(signal!.recentAvgLength).toBeCloseTo(30, 10);
    expect(signal!.previousAvgLength).toBeCloseTo(10, 10);
    expect(signal!.recentIterations).toEqual([2]);
    expect(signal!.previousIterations).toEqual([1]);
    expect(signal!.direction).toBe('lengthening');
  });

  it('直近平均が直前平均より閾値(ADVERSARY_COMMENT_TREND_FLAT_THRESHOLD_PCT)以上長いとlengthening', () => {
    expect(ADVERSARY_COMMENT_TREND_FLAT_THRESHOLD_PCT).toBe(10);
    const runs = [
      makeRun({ iteration: 1, adversary: { approved: true, summary: 'x'.repeat(20) } }),
      makeRun({ iteration: 2, adversary: { approved: true, summary: 'x'.repeat(20) } }),
      makeRun({ iteration: 3, adversary: { approved: true, summary: 'x'.repeat(20) } }),
      makeRun({ iteration: 4, adversary: { approved: true, summary: 'x'.repeat(40) } }),
      makeRun({ iteration: 5, adversary: { approved: true, summary: 'x'.repeat(40) } }),
      makeRun({ iteration: 6, adversary: { approved: true, summary: 'x'.repeat(40) } }),
    ];
    const signal = adversaryCommentTrendSignal(runs);
    expect(signal!.windowSize).toBe(ADVERSARY_COMMENT_TREND_WINDOW);
    expect(signal!.partial).toBe(false);
    expect(signal!.previousAvgLength).toBeCloseTo(20, 10);
    expect(signal!.recentAvgLength).toBeCloseTo(40, 10);
    expect(signal!.deltaPct).toBeCloseTo(100, 10);
    expect(signal!.direction).toBe('lengthening');
    expect(signal!.recentIterations).toEqual([4, 5, 6]);
    expect(signal!.previousIterations).toEqual([1, 2, 3]);
  });

  it('直近平均が直前平均より短いとshortening', () => {
    const runs = [
      makeRun({ iteration: 1, adversary: { approved: true, summary: 'x'.repeat(40) } }),
      makeRun({ iteration: 2, adversary: { approved: true, summary: 'x'.repeat(40) } }),
      makeRun({ iteration: 3, adversary: { approved: true, summary: 'x'.repeat(40) } }),
      makeRun({ iteration: 4, adversary: { approved: true, summary: 'x'.repeat(20) } }),
      makeRun({ iteration: 5, adversary: { approved: true, summary: 'x'.repeat(20) } }),
      makeRun({ iteration: 6, adversary: { approved: true, summary: 'x'.repeat(20) } }),
    ];
    const signal = adversaryCommentTrendSignal(runs);
    expect(signal!.direction).toBe('shortening');
    expect(signal!.deltaPct).toBeCloseTo(-50, 10);
  });

  it('変化率が閾値未満ならflat（僅かなブレをトレンドと誤認しない）', () => {
    const runs = [
      makeRun({ iteration: 1, adversary: { approved: true, summary: 'x'.repeat(100) } }),
      makeRun({ iteration: 2, adversary: { approved: true, summary: 'x'.repeat(100) } }),
      makeRun({ iteration: 3, adversary: { approved: true, summary: 'x'.repeat(100) } }),
      // +5% は閾値(10%)未満なのでflatになるはず
      makeRun({ iteration: 4, adversary: { approved: true, summary: 'x'.repeat(105) } }),
      makeRun({ iteration: 5, adversary: { approved: true, summary: 'x'.repeat(105) } }),
      makeRun({ iteration: 6, adversary: { approved: true, summary: 'x'.repeat(105) } }),
    ];
    const signal = adversaryCommentTrendSignal(runs);
    expect(signal!.direction).toBe('flat');
  });

  it('failed runは母集団から除外する（summaryが実測ではないため）', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', adversary: { approved: true, summary: 'x'.repeat(10) } }),
      makeRun({ iteration: 2, verdict: 'failed', adversary: { approved: false, summary: 'x'.repeat(9999) } }),
      makeRun({ iteration: 3, verdict: 'merged', adversary: { approved: true, summary: 'x'.repeat(30) } }),
    ];
    const signal = adversaryCommentTrendSignal(runs);
    // failedのsummaryが混ざっていたらrecentAvgLengthは巨大な値になるはずだが、
    // 除外されるのでwindow=1として iteration 1 vs 3 の比較になる
    expect(signal!.windowSize).toBe(1);
    expect(signal!.recentAvgLength).toBeCloseTo(30, 10);
    expect(signal!.previousAvgLength).toBeCloseTo(10, 10);
  });

  it('直前ウィンドウの平均が0(境界値)でもdirectionを安全に判定する（ゼロ除算を回避）', () => {
    const runs = [
      makeRun({ iteration: 1, adversary: { approved: true, summary: '' } }),
      makeRun({ iteration: 2, adversary: { approved: true, summary: 'x'.repeat(10) } }),
    ];
    const signal = adversaryCommentTrendSignal(runs);
    expect(signal!.previousAvgLength).toBe(0);
    expect(signal!.deltaPct).toBeNull();
    expect(signal!.direction).toBe('lengthening');
  });

  it('直前・直近ともに文字数が0(境界値)ならflat', () => {
    const runs = [
      makeRun({ iteration: 1, adversary: { approved: true, summary: '' } }),
      makeRun({ iteration: 2, adversary: { approved: true, summary: '' } }),
    ];
    const signal = adversaryCommentTrendSignal(runs);
    expect(signal!.direction).toBe('flat');
    expect(signal!.deltaPct).toBeNull();
  });
});

describe('adversaryApprovalCommentStats', () => {
  it('承認/却下それぞれの平均・中央値・件数を分けて集計する', () => {
    const runs = [
      makeRun({ iteration: 1, adversary: { approved: true, summary: 'x'.repeat(10) } }),
      makeRun({ iteration: 2, adversary: { approved: true, summary: 'x'.repeat(20) } }),
      makeRun({ iteration: 3, adversary: { approved: false, summary: 'x'.repeat(50) } }),
      makeRun({ iteration: 4, adversary: { approved: false, summary: 'x'.repeat(70) } }),
    ];
    const stats = adversaryApprovalCommentStats(runs);
    expect(stats.approvedCount).toBe(2);
    expect(stats.rejectedCount).toBe(2);
    expect(stats.approvedAvgLength).toBeCloseTo(15, 10);
    expect(stats.rejectedAvgLength).toBeCloseTo(60, 10);
    expect(stats.approvedMedianLength).toBeCloseTo(15, 10);
    expect(stats.rejectedMedianLength).toBeCloseTo(60, 10);
    expect(stats.delta).toBeCloseTo(45, 10);
  });

  it('failed runは除外する', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', adversary: { approved: true, summary: 'x'.repeat(10) } }),
      makeRun({ iteration: 2, verdict: 'failed', adversary: { approved: false, summary: 'x'.repeat(9999) } }),
    ];
    const stats = adversaryApprovalCommentStats(runs);
    expect(stats.rejectedCount).toBe(0);
    expect(stats.rejectedAvgLength).toBe(0);
  });

  it('却下が1件も無い(境界値)場合はNaNにならずrejectedAvgLengthが0になる', () => {
    const runs = [makeRun({ iteration: 1, adversary: { approved: true, summary: 'ok' } })];
    const stats = adversaryApprovalCommentStats(runs);
    expect(stats.rejectedCount).toBe(0);
    expect(stats.rejectedAvgLength).toBe(0);
    expect(stats.rejectedMedianLength).toBe(0);
    expect(Number.isNaN(stats.delta)).toBe(false);
  });

  it('空配列でも全項目が0になる', () => {
    const stats = adversaryApprovalCommentStats([]);
    expect(stats).toEqual({
      approvedCount: 0,
      rejectedCount: 0,
      approvedAvgLength: 0,
      rejectedAvgLength: 0,
      approvedMedianLength: 0,
      rejectedMedianLength: 0,
      delta: 0,
    });
  });
});

describe('recentAdversaryComments', () => {
  it('新しい順（iteration降順）に並べ、ADVERSARY_COMMENT_DIGEST_LIMIT件を超えない', () => {
    expect(ADVERSARY_COMMENT_DIGEST_LIMIT).toBe(5);
    const runs = Array.from({ length: 8 }, (_, i) =>
      makeRun({ iteration: i + 1, adversary: { approved: true, summary: `summary-${i + 1}` } }),
    );
    const digest = recentAdversaryComments(runs);
    expect(digest).toHaveLength(5);
    expect(digest.map((d) => d.iteration)).toEqual([8, 7, 6, 5, 4]);
    expect(digest[0].summary).toBe('summary-8');
  });

  it('failed runは除外し、issue情報・approved・verdict・lengthを実データから複製する', () => {
    const runs = [
      makeRun({
        iteration: 1,
        issue: { number: 42, title: 'あるissue', labels: [] },
        verdict: 'merged',
        adversary: { approved: true, summary: '  ok です  ' },
      }),
      makeRun({ iteration: 2, verdict: 'failed', adversary: { approved: false, summary: '到達せず' } }),
    ];
    const digest = recentAdversaryComments(runs);
    expect(digest).toHaveLength(1);
    expect(digest[0]).toEqual({
      iteration: 1,
      issueNumber: 42,
      issueTitle: 'あるissue',
      approved: true,
      verdict: 'merged',
      summary: 'ok です',
      length: 5,
    });
  });

  it('件数がLIMIT未満(境界値)ならあるだけ返す', () => {
    const runs = [makeRun({ iteration: 1, adversary: { approved: true, summary: 'x' } })];
    expect(recentAdversaryComments(runs)).toHaveLength(1);
  });

  it('空配列で空配列を返す', () => {
    expect(recentAdversaryComments([])).toEqual([]);
  });
});

describe('ideationCostQualityCorrelation', () => {
  it('空配列なら batches 空・相関はnull・サンプル数0（境界値）', () => {
    const result = ideationCostQualityCorrelation([]);
    expect(result).toEqual({
      batches: [],
      costVsApprovalRateCorrelation: null,
      approvalRateSampleSize: 0,
      costVsMergeRateCorrelation: null,
      mergeRateSampleSize: 0,
    });
  });

  it('ideationUsd が0（ideation未実行）の反復は batch に含めない（境界値）', () => {
    const runs = [
      makeRun({ iteration: 1, nextIssues: [2, 3], cost: { builderUsd: 0.1, adversaryUsd: 0.01, ideationUsd: 0, totalUsd: 0.11 } }),
    ];
    expect(ideationCostQualityCorrelation(runs).batches).toEqual([]);
  });

  it('ideationUsd>0でも nextIssues が空（提案0件）の反復は batch に含めない（境界値）', () => {
    const runs = [
      makeRun({ iteration: 1, nextIssues: [], cost: { builderUsd: 0.1, adversaryUsd: 0.01, ideationUsd: 0.05, totalUsd: 0.16 } }),
    ];
    expect(ideationCostQualityCorrelation(runs).batches).toEqual([]);
  });

  it('提案issueが後続反復でまだ着手されていない場合、attemptedCount=0・承認率/マージ率ともnull', () => {
    const runs = [
      makeRun({
        iteration: 1,
        issue: { number: 1, title: 'a', labels: [] },
        nextIssues: [2, 3],
        cost: { builderUsd: 0.1, adversaryUsd: 0.01, ideationUsd: 0.1, totalUsd: 0.21 },
      }),
    ];
    const result = ideationCostQualityCorrelation(runs);
    expect(result.batches).toEqual([
      {
        iteration: 1,
        proposedCount: 2,
        costPerIssueUsd: 0.05,
        attemptedCount: 0,
        childApprovalRate: null,
        childMergeRate: null,
      },
    ]);
    expect(result.costVsApprovalRateCorrelation).toBeNull();
    expect(result.costVsMergeRateCorrelation).toBeNull();
    expect(result.approvalRateSampleSize).toBe(0);
    expect(result.mergeRateSampleSize).toBe(0);
  });

  it('提案元自身の issue番号が nextIssues に含まれていても、自分自身を着手済みにカウントしない（自己参照の境界値。data/runs/0014.json のパターン）', () => {
    const runs = [
      makeRun({
        iteration: 5,
        issue: { number: 10, title: 'self', labels: [] },
        nextIssues: [10, 11],
        cost: { builderUsd: 0.1, adversaryUsd: 0.01, ideationUsd: 0.1, totalUsd: 0.21 },
      }),
      makeRun({
        iteration: 6,
        issue: { number: 11, title: 'child', labels: [] },
        verdict: 'merged',
        adversary: { approved: true, summary: '' },
      }),
    ];
    const result = ideationCostQualityCorrelation(runs);
    expect(result.batches).toEqual([
      {
        iteration: 5,
        proposedCount: 2,
        costPerIssueUsd: 0.05,
        attemptedCount: 1,
        childApprovalRate: 1,
        childMergeRate: 1,
      },
    ]);
  });

  it('failed run（verify未到達）は childApprovalRate の母集団から除くが、childMergeRate の母集団には含める（verdictは常に記録されるため）', () => {
    const runs = [
      makeRun({
        iteration: 1,
        issue: { number: 1, title: 'a', labels: [] },
        nextIssues: [2],
        cost: { builderUsd: 0.1, adversaryUsd: 0.01, ideationUsd: 0.05, totalUsd: 0.16 },
      }),
      makeRun({
        iteration: 2,
        issue: { number: 2, title: 'c', labels: [] },
        verdict: 'failed',
        verify: { unitPassed: false, e2ePassed: false, coveragePct: 0 },
        adversary: { approved: false, summary: '' },
      }),
    ];
    const result = ideationCostQualityCorrelation(runs);
    expect(result.batches[0].attemptedCount).toBe(1);
    // verify未到達なので承認率の母集団からは除外され、着手はしたが承認結果が無い(null)
    expect(result.batches[0].childApprovalRate).toBeNull();
    // verdict自体は常に記録されるため、failedもマージ率の母集団(0/1=0)には含まれる
    expect(result.batches[0].childMergeRate).toBe(0);
  });

  it('コスト単価が高いbatchほど品質(承認率・マージ率)が低い明確なケースで相関係数 r=-1.00 を算出する（部分一致に頼らない）', () => {
    const runs = [
      makeRun({
        iteration: 1,
        issue: { number: 1, title: 'a', labels: [] },
        nextIssues: [2, 3],
        cost: { builderUsd: 0.1, adversaryUsd: 0.01, ideationUsd: 0.01, totalUsd: 0.12 },
      }),
      makeRun({ iteration: 2, issue: { number: 2, title: 'c1', labels: [] }, verdict: 'merged', adversary: { approved: true, summary: '' } }),
      makeRun({ iteration: 3, issue: { number: 3, title: 'c2', labels: [] }, verdict: 'merged', adversary: { approved: true, summary: '' } }),
      makeRun({
        iteration: 4,
        issue: { number: 4, title: 'b', labels: [] },
        nextIssues: [5, 6],
        cost: { builderUsd: 0.1, adversaryUsd: 0.01, ideationUsd: 0.2, totalUsd: 0.31 },
      }),
      makeRun({
        iteration: 5,
        issue: { number: 5, title: 'c3', labels: [] },
        verdict: 'abandoned',
        adversary: { approved: false, summary: '' },
      }),
      makeRun({
        iteration: 6,
        issue: { number: 6, title: 'c4', labels: [] },
        verdict: 'abandoned',
        adversary: { approved: false, summary: '' },
      }),
    ];
    const result = ideationCostQualityCorrelation(runs);
    expect(result.batches).toHaveLength(2);
    expect(result.batches[0].costPerIssueUsd).toBeCloseTo(0.005, 10);
    expect(result.batches[0].childApprovalRate).toBe(1);
    expect(result.batches[0].childMergeRate).toBe(1);
    expect(result.batches[1].costPerIssueUsd).toBeCloseTo(0.1, 10);
    expect(result.batches[1].childApprovalRate).toBe(0);
    expect(result.batches[1].childMergeRate).toBe(0);
    expect(result.approvalRateSampleSize).toBe(2);
    expect(result.mergeRateSampleSize).toBe(2);
    expect(result.costVsApprovalRateCorrelation).toBeCloseTo(-1, 10);
    expect(result.costVsMergeRateCorrelation).toBeCloseTo(-1, 10);
  });

  it('コスト単価が全batchで同値（分散0）だと相関係数はnull（境界値）', () => {
    const runs = [
      makeRun({
        iteration: 1,
        issue: { number: 1, title: 'a', labels: [] },
        nextIssues: [3],
        cost: { builderUsd: 0.1, adversaryUsd: 0.01, ideationUsd: 0.1, totalUsd: 0.21 },
      }),
      makeRun({ iteration: 2, issue: { number: 2, title: 'b', labels: [] }, nextIssues: [4], cost: { builderUsd: 0.1, adversaryUsd: 0.01, ideationUsd: 0.1, totalUsd: 0.21 } }),
      makeRun({ iteration: 3, issue: { number: 3, title: 'c1', labels: [] }, verdict: 'merged', adversary: { approved: true, summary: '' } }),
      makeRun({ iteration: 4, issue: { number: 4, title: 'c2', labels: [] }, verdict: 'abandoned', adversary: { approved: false, summary: '' } }),
    ];
    const result = ideationCostQualityCorrelation(runs);
    expect(result.batches.map((b) => b.costPerIssueUsd)).toEqual([0.1, 0.1]);
    expect(result.costVsApprovalRateCorrelation).toBeNull();
    expect(result.costVsMergeRateCorrelation).toBeNull();
  });
});

describe('ideationToStartLeadTimes', () => {
  it('nextIssuesに現れた反復のfinishedAtを提案時刻、issue.numberとして現れた反復のstartedAtを着手時刻としてリードタイム(秒)を返す', () => {
    const runs = [
      makeRun({
        iteration: 1,
        issue: { number: 1, title: 'gen', labels: [] },
        finishedAt: '2026-07-20T00:00:00Z',
        nextIssues: [10],
      }),
      makeRun({
        iteration: 2,
        issue: { number: 10, title: 'x', labels: [] },
        startedAt: '2026-07-20T00:10:00Z',
      }),
    ];
    expect(ideationToStartLeadTimes(runs)).toEqual([
      {
        issueNumber: 10,
        proposedIteration: 1,
        proposedAt: '2026-07-20T00:00:00Z',
        startIteration: 2,
        startedAt: '2026-07-20T00:10:00Z',
        leadTimeSec: 600,
      },
    ]);
  });

  it.each<Verdict>(['failed', 'paused', 'dry-run', 'needs-human', 'abandoned'])(
    '着手判定はverdictを問わない(%s でもissue.numberとして現れれば着手とみなす)',
    (verdict) => {
      const runs = [
        makeRun({ iteration: 1, issue: { number: 1, title: 'gen', labels: [] }, nextIssues: [10] }),
        makeRun({ iteration: 2, issue: { number: 10, title: 'x', labels: [] }, verdict }),
      ];
      expect(ideationToStartLeadTimes(runs)).toHaveLength(1);
    },
  );

  it('nextIssuesにも自分自身のissue番号にも一度も現れないissue（提案元不明）は対象外', () => {
    const runs = [makeRun({ iteration: 1, issue: { number: 1, title: 'x', labels: [] } })];
    expect(ideationToStartLeadTimes(runs)).toEqual([]);
  });

  it('提案元の反復のiterationが着手反復以上（自己参照）の場合は対象外', () => {
    const runs = [
      makeRun({ iteration: 1, issue: { number: 5, title: 'x', labels: [] }, nextIssues: [5] }),
    ];
    expect(ideationToStartLeadTimes(runs)).toEqual([]);
  });

  it('提案されただけでまだ後続反復として着手されていないissueは含めない', () => {
    const runs = [makeRun({ iteration: 1, issue: { number: 1, title: 'gen', labels: [] }, nextIssues: [10] })];
    expect(ideationToStartLeadTimes(runs)).toEqual([]);
  });

  it('同一issue番号が複数回dispatchされても、最初の着手だけを1件として数える', () => {
    const runs = [
      makeRun({
        iteration: 1,
        issue: { number: 1, title: 'gen', labels: [] },
        finishedAt: '2026-07-20T00:00:00Z',
        nextIssues: [10],
      }),
      makeRun({
        iteration: 2,
        issue: { number: 10, title: 'x', labels: [] },
        startedAt: '2026-07-20T00:10:00Z',
      }),
      // 誤って再dispatchされた2回目。重複カウントされてはいけない
      makeRun({
        iteration: 3,
        issue: { number: 10, title: 'x', labels: [] },
        startedAt: '2026-07-20T05:00:00Z',
      }),
    ];
    const points = ideationToStartLeadTimes(runs);
    expect(points).toHaveLength(1);
    expect(points[0].startIteration).toBe(2);
  });

  it('提案元の反復のnextIssuesに複数issueが含まれていても、それぞれ着手時に個別の点として現れる', () => {
    const runs = [
      makeRun({
        iteration: 1,
        issue: { number: 1, title: 'gen', labels: [] },
        finishedAt: '2026-07-20T00:00:00Z',
        nextIssues: [10, 20],
      }),
      makeRun({ iteration: 2, issue: { number: 10, title: 'a', labels: [] }, startedAt: '2026-07-20T00:05:00Z' }),
      makeRun({ iteration: 3, issue: { number: 20, title: 'b', labels: [] }, startedAt: '2026-07-20T00:20:00Z' }),
    ];
    expect(ideationToStartLeadTimes(runs).map((p) => ({ issueNumber: p.issueNumber, leadTimeSec: p.leadTimeSec }))).toEqual([
      { issueNumber: 10, leadTimeSec: 300 },
      { issueNumber: 20, leadTimeSec: 1200 },
    ]);
  });

  it('空配列で空配列を返す', () => {
    expect(ideationToStartLeadTimes([])).toEqual([]);
  });
});

describe('ideationToStartLeadTimeTrendSignal', () => {
  it('run が0件なら null（比較対象が存在しない）', () => {
    expect(ideationToStartLeadTimeTrendSignal([])).toBeNull();
  });

  it('着手済みissueが1件だけなら直前ウィンドウが取れず null（境界値）', () => {
    const runs = [
      makeRun({ iteration: 1, issue: { number: 1, title: 'gen', labels: [] }, nextIssues: [10] }),
      makeRun({ iteration: 2, issue: { number: 10, title: 'x', labels: [] } }),
    ];
    expect(ideationToStartLeadTimeTrendSignal(runs)).toBeNull();
  });

  function proposeAndStart(
    proposeIteration: number,
    startIteration: number,
    issueNumber: number,
    leadTimeSec: number,
  ): RunRecord[] {
    return [
      makeRun({
        iteration: proposeIteration,
        issue: { number: proposeIteration, title: 'gen', labels: [] },
        finishedAt: '2026-07-20T00:00:00Z',
        nextIssues: [issueNumber],
      }),
      makeRun({
        iteration: startIteration,
        issue: { number: issueNumber, title: 'x', labels: [] },
        startedAt: new Date(new Date('2026-07-20T00:00:00Z').getTime() + leadTimeSec * 1000).toISOString(),
      }),
    ];
  }

  it('リードタイムの直近平均が直前平均より閾値以上長いと increasing(悪化)', () => {
    expect(IDEATION_TO_START_LEAD_TIME_TREND_FLAT_THRESHOLD_PCT).toBe(5);
    const runs = [
      ...proposeAndStart(1, 2, 101, 100),
      ...proposeAndStart(3, 4, 102, 100),
      ...proposeAndStart(5, 6, 103, 100),
      ...proposeAndStart(7, 8, 104, 200),
      ...proposeAndStart(9, 10, 105, 200),
      ...proposeAndStart(11, 12, 106, 200),
    ];
    const signal = ideationToStartLeadTimeTrendSignal(runs);
    expect(signal).not.toBeNull();
    expect(signal!.windowSize).toBe(IDEATION_TO_START_LEAD_TIME_TREND_WINDOW);
    expect(signal!.partial).toBe(false);
    expect(signal!.previousAvgSec).toBeCloseTo(100, 10);
    expect(signal!.recentAvgSec).toBeCloseTo(200, 10);
    expect(signal!.deltaPct).toBeCloseTo(100, 10);
    expect(signal!.direction).toBe('increasing');
    expect(signal!.recentIterations).toEqual([8, 10, 12]);
    expect(signal!.previousIterations).toEqual([2, 4, 6]);
  });

  it('リードタイムの直近平均が直前平均より短いと decreasing(改善)', () => {
    const runs = [
      ...proposeAndStart(1, 2, 101, 200),
      ...proposeAndStart(3, 4, 102, 200),
      ...proposeAndStart(5, 6, 103, 200),
      ...proposeAndStart(7, 8, 104, 100),
      ...proposeAndStart(9, 10, 105, 100),
      ...proposeAndStart(11, 12, 106, 100),
    ];
    const signal = ideationToStartLeadTimeTrendSignal(runs);
    expect(signal!.direction).toBe('decreasing');
  });

  it('変化率が閾値未満なら flat(横ばい)（境界値）', () => {
    const runs = [
      ...proposeAndStart(1, 2, 101, 100),
      ...proposeAndStart(3, 4, 102, 100),
      ...proposeAndStart(5, 6, 103, 100),
      ...proposeAndStart(7, 8, 104, 103),
      ...proposeAndStart(9, 10, 105, 103),
      ...proposeAndStart(11, 12, 106, 103),
    ];
    const signal = ideationToStartLeadTimeTrendSignal(runs);
    expect(signal!.direction).toBe('flat');
  });

  it('着手済みissueが2〜4件のときはwindowSizeがWINDOW未満に縮小し partial=true になる（境界値）', () => {
    const runs = [...proposeAndStart(1, 2, 101, 100), ...proposeAndStart(3, 4, 102, 300)];
    const signal = ideationToStartLeadTimeTrendSignal(runs);
    expect(signal).not.toBeNull();
    expect(signal!.windowSize).toBe(1);
    expect(signal!.partial).toBe(true);
    expect(signal!.recentAvgSec).toBeCloseTo(300, 10);
    expect(signal!.previousAvgSec).toBeCloseTo(100, 10);
  });
});

describe('ideationStartSuccessSummary', () => {
  it('runsが空なら提案0件・着手率null（境界値）', () => {
    expect(ideationStartSuccessSummary([])).toEqual({
      proposedTotal: 0,
      startedCount: 0,
      notStartedCount: 0,
      startRate: null,
      notStartedIssueNumbers: [],
    });
  });

  it('提案issueのうち着手されたものと未着手のものを正しく分類し、着手率を算出する', () => {
    const runs = [
      makeRun({ iteration: 1, issue: { number: 1, title: 'gen', labels: [] }, nextIssues: [10, 20, 30] }),
      makeRun({ iteration: 2, issue: { number: 10, title: 'a', labels: [] } }),
    ];
    const summary = ideationStartSuccessSummary(runs);
    expect(summary.proposedTotal).toBe(3);
    expect(summary.startedCount).toBe(1);
    expect(summary.notStartedCount).toBe(2);
    expect(summary.startRate).toBeCloseTo(1 / 3, 10);
    expect(summary.notStartedIssueNumbers).toEqual([20, 30]);
  });

  it('提案issueが全て着手されると着手率100%・未着手0件', () => {
    const runs = [
      makeRun({ iteration: 1, issue: { number: 1, title: 'gen', labels: [] }, nextIssues: [10] }),
      makeRun({ iteration: 2, issue: { number: 10, title: 'a', labels: [] } }),
    ];
    const summary = ideationStartSuccessSummary(runs);
    expect(summary.startRate).toBe(1);
    expect(summary.notStartedIssueNumbers).toEqual([]);
  });

  it('提案元自身のissue番号がnextIssuesに含まれる自己参照は着手扱いにしない（未着手のまま残る）', () => {
    const runs = [
      makeRun({ iteration: 5, issue: { number: 10, title: 'self', labels: [] }, nextIssues: [10, 11] }),
    ];
    const summary = ideationStartSuccessSummary(runs);
    expect(summary.proposedTotal).toBe(2);
    expect(summary.startedCount).toBe(0);
    expect(summary.notStartedIssueNumbers).toEqual([10, 11]);
  });

  it('nextIssuesを一度も出していない反復だけの場合は提案0件（境界値）', () => {
    const runs = [makeRun({ iteration: 1, nextIssues: [] })];
    expect(ideationStartSuccessSummary(runs).proposedTotal).toBe(0);
  });
});

describe('ideationDropRateSignal', () => {
  it('runsが空ならnull（境界値）', () => {
    expect(ideationDropRateSignal([])).toBeNull();
  });

  it('nextIssuesを一度も出していない場合はnull（提案が無い）', () => {
    const runs = [makeRun({ iteration: 1, nextIssues: [] })];
    expect(ideationDropRateSignal(runs)).toBeNull();
  });

  it(`提案からの経過反復数がIDEATION_DROP_STALENESS_ITERATIONS(${IDEATION_DROP_STALENESS_ITERATIONS})未満なら猶予期間中として未判定のまま（境界値）`, () => {
    const runs = [
      makeRun({ iteration: 1, issue: { number: 1, title: 'gen', labels: [] }, nextIssues: [10] }),
      makeRun({
        iteration: 1 + IDEATION_DROP_STALENESS_ITERATIONS - 1,
        issue: { number: 2, title: 'other', labels: [] },
      }),
    ];
    const signal = ideationDropRateSignal(runs);
    expect(signal).not.toBeNull();
    expect(signal!.proposedTotal).toBe(1);
    expect(signal!.judgedTotal).toBe(0);
    expect(signal!.pendingCount).toBe(1);
    expect(signal!.droppedCount).toBe(0);
    expect(signal!.dropRate).toBeNull();
    expect(signal!.streak).toBe(0);
    expect(signal!.triggered).toBe(false);
  });

  it(`経過反復数がちょうどIDEATION_DROP_STALENESS_ITERATIONSに達すると未着手issueはドロップと判定される（境界値）`, () => {
    const runs = [
      makeRun({ iteration: 1, issue: { number: 1, title: 'gen', labels: [] }, nextIssues: [10] }),
      makeRun({
        iteration: 1 + IDEATION_DROP_STALENESS_ITERATIONS,
        issue: { number: 2, title: 'other', labels: [] },
      }),
    ];
    const signal = ideationDropRateSignal(runs);
    expect(signal!.judgedTotal).toBe(1);
    expect(signal!.droppedCount).toBe(1);
    expect(signal!.pendingCount).toBe(0);
    expect(signal!.dropRate).toBe(1);
    expect(signal!.droppedIssues[0]).toMatchObject({
      issueNumber: 10,
      proposedIteration: 1,
      status: 'dropped',
      startIteration: null,
      ageIterations: IDEATION_DROP_STALENESS_ITERATIONS,
    });
  });

  it('着手されたissueはageIterations(提案から着手までの反復差)とともにstarted判定され、ドロップに含まれない', () => {
    const runs = [
      makeRun({ iteration: 1, issue: { number: 1, title: 'gen', labels: [] }, nextIssues: [10] }),
      makeRun({ iteration: 3, issue: { number: 10, title: 'x', labels: [] } }),
    ];
    const signal = ideationDropRateSignal(runs);
    expect(signal!.judgedTotal).toBe(1);
    expect(signal!.startedCount).toBe(1);
    expect(signal!.droppedCount).toBe(0);
    expect(signal!.dropRate).toBe(0);
    expect(signal!.droppedIssues).toEqual([]);
  });

  it('提案元自身のissue番号を含む自己参照はstarted扱いにならず、猶予期間経過後にドロップと判定される', () => {
    const runs = [
      makeRun({ iteration: 1, issue: { number: 10, title: 'self', labels: [] }, nextIssues: [10] }),
      makeRun({
        iteration: 1 + IDEATION_DROP_STALENESS_ITERATIONS,
        issue: { number: 2, title: 'other', labels: [] },
      }),
    ];
    const signal = ideationDropRateSignal(runs);
    expect(signal!.droppedCount).toBe(1);
    expect(signal!.droppedIssues[0].issueNumber).toBe(10);
  });

  it('着手済みとドロップが混在する場合、判定済み件数に対するドロップ率を正しく算出する', () => {
    const runs = [
      makeRun({ iteration: 1, issue: { number: 1, title: 'gen', labels: [] }, nextIssues: [10, 20, 30, 40] }),
      makeRun({ iteration: 2, issue: { number: 10, title: 'a', labels: [] } }),
      makeRun({
        iteration: 1 + IDEATION_DROP_STALENESS_ITERATIONS,
        issue: { number: 999, title: 'filler', labels: [] },
      }),
    ];
    const signal = ideationDropRateSignal(runs);
    expect(signal!.proposedTotal).toBe(4);
    expect(signal!.judgedTotal).toBe(4);
    expect(signal!.startedCount).toBe(1);
    expect(signal!.droppedCount).toBe(3);
    expect(signal!.dropRate).toBeCloseTo(3 / 4, 10);
    expect(signal!.droppedIssues.map((d) => d.issueNumber)).toEqual([20, 30, 40]);
  });

  it(`提案順で末尾からIDEATION_DROP_RATE_STREAK_THRESHOLD(${IDEATION_DROP_RATE_STREAK_THRESHOLD})件連続でドロップすると発報する`, () => {
    const runs = [
      makeRun({ iteration: 1, issue: { number: 1, title: 'gen1', labels: [] }, nextIssues: [10] }),
      makeRun({ iteration: 2, issue: { number: 2, title: 'gen2', labels: [] }, nextIssues: [20] }),
      makeRun({
        iteration: 1 + IDEATION_DROP_STALENESS_ITERATIONS + 2,
        issue: { number: 999, title: 'filler', labels: [] },
      }),
    ];
    const signal = ideationDropRateSignal(runs);
    expect(signal!.droppedCount).toBe(2);
    expect(signal!.streak).toBe(2);
    expect(signal!.triggered).toBe(true);
    expect(signal!.streakDrops.map((d) => d.issueNumber)).toEqual([10, 20]);
  });

  it('直近1件だけドロップしても閾値未満(1回)なら未発報のまま（境界値）', () => {
    const runs = [
      makeRun({ iteration: 1, issue: { number: 1, title: 'gen1', labels: [] }, nextIssues: [10] }),
      makeRun({ iteration: 2, issue: { number: 2, title: 'gen2', labels: [] } }),
      makeRun({
        iteration: 1 + IDEATION_DROP_STALENESS_ITERATIONS,
        issue: { number: 10 + 1000, title: 'filler', labels: [] },
      }),
    ];
    const signal = ideationDropRateSignal(runs);
    expect(signal!.droppedCount).toBe(1);
    expect(signal!.streak).toBe(1);
    expect(signal!.triggered).toBe(false);
  });

  it('提案順で末尾のissueが着手済みならstreakは0に戻り、過去にドロップがあっても未発報のまま（トレイリング判定）', () => {
    const runs = [
      makeRun({ iteration: 1, issue: { number: 1, title: 'gen1', labels: [] }, nextIssues: [10] }),
      makeRun({ iteration: 2, issue: { number: 2, title: 'gen2', labels: [] }, nextIssues: [20] }),
      makeRun({ iteration: 3, issue: { number: 3, title: 'gen3', labels: [] }, nextIssues: [30] }),
      makeRun({ iteration: 5, issue: { number: 30, title: 'started-late', labels: [] } }),
      makeRun({
        iteration: 1 + IDEATION_DROP_STALENESS_ITERATIONS + 5,
        issue: { number: 999, title: 'filler', labels: [] },
      }),
    ];
    const signal = ideationDropRateSignal(runs);
    expect(signal!.droppedCount).toBe(2);
    expect(signal!.streak).toBe(0);
    expect(signal!.triggered).toBe(false);
    expect(signal!.streakDrops).toEqual([]);
  });

  it('同じ反復が複数issueを提案した場合、判定順は提案iteration→issue番号昇順で決まる（tie-break境界値）', () => {
    const runs = [
      makeRun({ iteration: 1, issue: { number: 1, title: 'gen', labels: [] }, nextIssues: [30, 10, 20] }),
      makeRun({
        iteration: 1 + IDEATION_DROP_STALENESS_ITERATIONS,
        issue: { number: 999, title: 'filler', labels: [] },
      }),
    ];
    const signal = ideationDropRateSignal(runs);
    expect(signal!.droppedIssues.map((d) => d.issueNumber)).toEqual([10, 20, 30]);
  });
});

describe('ideationProposalQualityDropCorrelation', () => {
  it('runsが空なら batches 空・相関はnull・sampleSize 0（境界値）', () => {
    const result = ideationProposalQualityDropCorrelation([]);
    expect(result).toEqual({
      batches: [],
      batchSizeVsDropRateCorrelation: null,
      costPerIssueVsDropRateCorrelation: null,
      sampleSize: 0,
    });
  });

  it('ideationUsd=0の反復、および提案0件（nextIssues空）の反復はどちらもbatchに含めない（境界値）', () => {
    const noCost = [
      makeRun({ iteration: 1, nextIssues: [10], cost: { builderUsd: 0.1, adversaryUsd: 0.01, ideationUsd: 0, totalUsd: 0.11 } }),
    ];
    expect(ideationProposalQualityDropCorrelation(noCost).batches).toEqual([]);

    const noProposal = [
      makeRun({ iteration: 1, nextIssues: [], cost: { builderUsd: 0.1, adversaryUsd: 0.01, ideationUsd: 0.05, totalUsd: 0.16 } }),
    ];
    const result = ideationProposalQualityDropCorrelation(noProposal);
    expect(result.batches).toEqual([]);
    expect(result.sampleSize).toBe(0);
  });

  it('提案issueが全て猶予期間中(未判定)ならjudgedCount/droppedCountは0でdropRateはnull、相関もnull（境界値）', () => {
    const runs = [
      makeRun({ iteration: 1, nextIssues: [10, 11], cost: { builderUsd: 0.1, adversaryUsd: 0.01, ideationUsd: 0.02, totalUsd: 0.13 } }),
    ];
    const result = ideationProposalQualityDropCorrelation(runs);
    expect(result.batches).toEqual([
      { iteration: 1, proposedCount: 2, costPerIssueUsd: 0.01, judgedCount: 0, droppedCount: 0, dropRate: null },
    ]);
    expect(result.batchSizeVsDropRateCorrelation).toBeNull();
    expect(result.costPerIssueVsDropRateCorrelation).toBeNull();
    expect(result.sampleSize).toBe(0);
  });

  it('提案元自身の自己参照issue、および後続batchでの再提案issueは、どちらも最初の提案元batchのみに帰属し二重計上しない（境界値）', () => {
    const runs = [
      // 10は自分自身のissue番号（自己参照）、50は後でbatch2に再提案される
      makeRun({ iteration: 1, issue: { number: 10, title: 'self', labels: [] }, nextIssues: [10, 50], cost: { builderUsd: 0.1, adversaryUsd: 0.01, ideationUsd: 0.02, totalUsd: 0.13 } }),
      // 50 は iteration1 が既に提案済みのため、この反復の判定には帰属しない
      makeRun({ iteration: 2, issue: { number: 2, title: 'b', labels: [] }, nextIssues: [50, 60], cost: { builderUsd: 0.1, adversaryUsd: 0.01, ideationUsd: 0.02, totalUsd: 0.13 } }),
      makeRun({ iteration: 2 + IDEATION_DROP_STALENESS_ITERATIONS, issue: { number: 999, title: 'filler', labels: [] } }),
    ];
    const result = ideationProposalQualityDropCorrelation(runs);
    const batch1 = result.batches.find((b) => b.iteration === 1);
    const batch2 = result.batches.find((b) => b.iteration === 2);
    // batch1: 10(自己参照)・50とも未着手→両方ドロップでjudgedCount=2
    expect(batch1).toEqual({ iteration: 1, proposedCount: 2, costPerIssueUsd: 0.01, judgedCount: 2, droppedCount: 2, dropRate: 1 });
    // batch2.proposedCount(見た目の提案件数)は2件だが、50は既にbatch1に帰属しているため
    // batch2のjudgedCount/droppedCountには60の1件分しか計上されない
    expect(batch2).toEqual({ iteration: 2, proposedCount: 2, costPerIssueUsd: 0.01, judgedCount: 1, droppedCount: 1, dropRate: 1 });
  });

  it('提案規模が大きいbatchほど・単価が安いbatchほどドロップ率が高い場合、それぞれ正/負の相関係数を実際に算出する（部分一致に頼らない）', () => {
    const staleIteration = 2 + IDEATION_DROP_STALENESS_ITERATIONS;
    const runs = [
      // batch1: issue10 の1件を提案。単価0.02。着手されドロップ0件→dropRate 0
      makeRun({ iteration: 1, issue: { number: 1, title: 'a', labels: [] }, nextIssues: [10], cost: { builderUsd: 0.1, adversaryUsd: 0.01, ideationUsd: 0.02, totalUsd: 0.13 } }),
      // batch2: issue20,21 の2件を提案。単価0.01（batch1より安い）。両方ドロップ→dropRate 1
      makeRun({ iteration: 2, issue: { number: 2, title: 'b', labels: [] }, nextIssues: [20, 21], cost: { builderUsd: 0.1, adversaryUsd: 0.01, ideationUsd: 0.02, totalUsd: 0.13 } }),
      makeRun({ iteration: 4, issue: { number: 10, title: 'started', labels: [] } }),
      makeRun({ iteration: staleIteration, issue: { number: 999, title: 'filler', labels: [] } }),
    ];
    const result = ideationProposalQualityDropCorrelation(runs);

    expect(result.batches.map((b) => [b.proposedCount, b.judgedCount, b.droppedCount, b.dropRate])).toEqual([
      [1, 1, 0, 0],
      [2, 2, 2, 1],
    ]);
    expect(result.batches[0].costPerIssueUsd).toBeCloseTo(0.02, 10);
    expect(result.batches[1].costPerIssueUsd).toBeCloseTo(0.01, 10);
    // 提案規模(1,2)とドロップ率(0,1)は増加、単価(0.02,0.01)は減少するので符号が逆になるはず
    expect(result.batchSizeVsDropRateCorrelation).toBeCloseTo(1, 6);
    expect(result.costPerIssueVsDropRateCorrelation).toBeCloseTo(-1, 6);
    expect(result.sampleSize).toBe(2);
  });
});

function proposeAndStart(
  proposeIteration: number,
  startIteration: number,
  issueNumber: number,
  leadTimeSec: number,
): RunRecord[] {
  return [
    makeRun({
      iteration: proposeIteration,
      issue: { number: proposeIteration, title: 'gen', labels: [] },
      finishedAt: '2026-07-20T00:00:00Z',
      nextIssues: [issueNumber],
    }),
    makeRun({
      iteration: startIteration,
      issue: { number: issueNumber, title: 'x', labels: [] },
      startedAt: new Date(new Date('2026-07-20T00:00:00Z').getTime() + leadTimeSec * 1000).toISOString(),
    }),
  ];
}

describe('ideationToStartLeadTimeDistribution', () => {
  it('runsが空ならサンプル0件・数値は全て0・bucketsは空配列（境界値）', () => {
    expect(ideationToStartLeadTimeDistribution([])).toEqual({
      sampleSize: 0,
      minSec: 0,
      maxSec: 0,
      medianSec: 0,
      p90Sec: 0,
      buckets: [],
    });
  });

  it('着手済みが1件だけなら min=max=median=p90=その値になる（境界値）', () => {
    const runs = proposeAndStart(1, 2, 101, 300);
    const d = ideationToStartLeadTimeDistribution(runs);
    expect(d.sampleSize).toBe(1);
    expect(d.minSec).toBe(300);
    expect(d.maxSec).toBe(300);
    expect(d.medianSec).toBe(300);
    expect(d.p90Sec).toBe(300);
    expect(d.buckets.find((b) => b.label === '〜10分')?.count).toBe(1);
    expect(d.buckets.filter((b) => b.count > 0)).toHaveLength(1);
  });

  it('複数サンプルから中央値・p90(線形補間)・ヒストグラムの各区間件数を正しく計算する', () => {
    const runs = [
      ...proposeAndStart(1, 2, 101, 60),
      ...proposeAndStart(3, 4, 102, 200),
      ...proposeAndStart(5, 6, 103, 700),
      ...proposeAndStart(7, 8, 104, 2000),
      ...proposeAndStart(9, 10, 105, 12000),
    ];
    const d = ideationToStartLeadTimeDistribution(runs);
    expect(d.sampleSize).toBe(5);
    expect(d.minSec).toBe(60);
    expect(d.maxSec).toBe(12000);
    expect(d.medianSec).toBe(700);
    // rank = 0.9*(5-1) = 3.6 → sorted[3] + (sorted[4]-sorted[3])*0.6 = 2000 + 6000 = 8000
    expect(d.p90Sec).toBeCloseTo(8000, 10);
    expect(d.buckets.map((b) => b.label)).toEqual(['〜10分', '10〜30分', '30〜60分', '60〜180分', '180分〜']);
    expect(d.buckets.map((b) => b.count)).toEqual([2, 1, 1, 0, 1]);
    expect(d.buckets.reduce((sum, b) => sum + b.count, 0)).toBe(5);
  });

  it('区間境界(600秒ちょうど)は下限側の区間ではなく上側の区間に入る（下限は閉区間・上限は開区間の境界値）', () => {
    const runs = proposeAndStart(1, 2, 101, 600);
    const d = ideationToStartLeadTimeDistribution(runs);
    expect(d.buckets.find((b) => b.label === '〜10分')?.count).toBe(0);
    expect(d.buckets.find((b) => b.label === '10〜30分')?.count).toBe(1);
  });
});

describe('ideationToStartBottlenecks', () => {
  it('runsが空なら空配列（境界値）', () => {
    expect(ideationToStartBottlenecks([])).toEqual([]);
  });

  it(`着手済みサンプルがIDEATION_TO_START_BOTTLENECK_MIN_SAMPLES(${IDEATION_TO_START_BOTTLENECK_MIN_SAMPLES})未満だと外れ値があってもstarted-lateを検知しない（境界値）`, () => {
    const runs = [
      ...proposeAndStart(1, 2, 101, 60),
      ...proposeAndStart(3, 4, 102, 60),
      ...proposeAndStart(5, 6, 103, 6000),
    ];
    expect(IDEATION_TO_START_BOTTLENECK_MIN_SAMPLES).toBe(4);
    const bottlenecks = ideationToStartBottlenecks(runs);
    expect(bottlenecks.filter((b) => b.kind === 'started-late')).toEqual([]);
  });

  it('サンプルが閾値件数以上のとき、閾値(p90と中央値2倍のうち大きい方)を超える突出した1件だけをstarted-lateとして検知する', () => {
    const runs = [
      ...proposeAndStart(1, 2, 101, 100),
      ...proposeAndStart(3, 4, 102, 100),
      ...proposeAndStart(5, 6, 103, 100),
      ...proposeAndStart(7, 8, 104, 1000),
    ];
    const bottlenecks = ideationToStartBottlenecks(runs);
    const startedLate = bottlenecks.filter((b) => b.kind === 'started-late');
    expect(startedLate).toHaveLength(1);
    expect(startedLate[0].issueNumber).toBe(104);
    expect(startedLate[0].leadTimeSec).toBe(1000);
    expect(startedLate[0].proposedIteration).toBe(7);
  });

  it('全サンプルが同一のリードタイムなら閾値を超える値が無いためstarted-lateは0件（誤検知が起きないことの確認）', () => {
    const runs = [
      ...proposeAndStart(1, 2, 101, 100),
      ...proposeAndStart(3, 4, 102, 100),
      ...proposeAndStart(5, 6, 103, 100),
      ...proposeAndStart(7, 8, 104, 100),
    ];
    const bottlenecks = ideationToStartBottlenecks(runs);
    expect(bottlenecks.filter((b) => b.kind === 'started-late')).toEqual([]);
  });

  it('典型ラグの2倍(最低IDEATION_TO_START_STILL_WAITING_MIN_ITERATIONS反復)以上未着手のまま放置されている提案だけをstill-waitingとして検知する', () => {
    expect(IDEATION_TO_START_STILL_WAITING_MIN_ITERATIONS).toBe(3);
    const runs = [
      // 典型ラグ(提案→着手の反復差)を1に確定させる
      ...proposeAndStart(1, 2, 101, 300),
      ...proposeAndStart(3, 4, 102, 300),
      // iteration5で提案、iteration8時点(=latest)でも未着手 → waiting = 8-5 = 3 = 閾値ちょうど(境界値)
      makeRun({ iteration: 5, issue: { number: 5, title: 'gen2', labels: [] }, nextIssues: [201, 202] }),
      // iteration6で提案 → waiting = 8-6 = 2 < 3、検知されない
      makeRun({ iteration: 6, issue: { number: 6, title: 'gen3', labels: [] }, nextIssues: [301] }),
      makeRun({ iteration: 7, issue: { number: 7, title: 'filler', labels: [] } }),
      makeRun({ iteration: 8, issue: { number: 8, title: 'filler2', labels: [] } }),
    ];
    const bottlenecks = ideationToStartBottlenecks(runs);
    const stillWaiting = bottlenecks.filter((b) => b.kind === 'still-waiting');
    const issueNumbers = stillWaiting.map((b) => b.issueNumber).sort((a, b) => a - b);
    expect(issueNumbers).toEqual([201, 202]);
    expect(stillWaiting.every((b) => b.waitingIterations === 3)).toBe(true);
    expect(stillWaiting.every((b) => b.leadTimeSec === null)).toBe(true);
    expect(stillWaiting.find((b) => b.issueNumber === 301)).toBeUndefined();
  });

  it('着手済みサンプルが1件も無い場合はIDEATION_TO_START_STILL_WAITING_MIN_ITERATIONSをそのまま閾値として使う', () => {
    const runs = [
      makeRun({ iteration: 1, issue: { number: 1, title: 'gen', labels: [] }, nextIssues: [10] }),
      makeRun({ iteration: 2, issue: { number: 2, title: 'filler', labels: [] } }),
      makeRun({ iteration: 3, issue: { number: 3, title: 'filler2', labels: [] } }),
      makeRun({ iteration: 4, issue: { number: 4, title: 'filler3', labels: [] } }),
    ];
    const bottlenecks = ideationToStartBottlenecks(runs);
    expect(bottlenecks).toHaveLength(1);
    expect(bottlenecks[0]).toMatchObject({ issueNumber: 10, kind: 'still-waiting', waitingIterations: 3 });
  });

  it('戻り値は提案iteration昇順で、started-lateとstill-waitingが混在してもソートされる', () => {
    const runs = [
      ...proposeAndStart(1, 2, 101, 100),
      ...proposeAndStart(3, 4, 102, 100),
      ...proposeAndStart(5, 6, 103, 100),
      ...proposeAndStart(20, 21, 999, 5000),
      makeRun({ iteration: 7, issue: { number: 7, title: 'gen2', labels: [] }, nextIssues: [500] }),
      makeRun({ iteration: 22, issue: { number: 22, title: 'filler', labels: [] } }),
    ];
    const bottlenecks = ideationToStartBottlenecks(runs);
    const iterations = bottlenecks.map((b) => b.proposedIteration);
    expect(iterations).toEqual([...iterations].sort((a, b) => a - b));
    expect(bottlenecks.map((b) => b.issueNumber)).toContain(999);
    expect(bottlenecks.map((b) => b.issueNumber)).toContain(500);
  });
});

describe('abandonedSummary', () => {
  it('空配列でもゼロ値を返す（境界値）', () => {
    const s = abandonedSummary([]);
    expect(s.count).toBe(0);
    expect(s.rate).toBe(0);
    expect(s.totalCostUsd).toBe(0);
    expect(s.avgReviseCycles).toBe(0);
    expect(s.topGateReasonCategory).toBeNull();
    expect(s.topGateReasonCount).toBe(0);
  });

  it('abandonedが1件も無ければ、他verdictが混在していてもゼロ値を返す（境界値）', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged' }),
      makeRun({ iteration: 2, verdict: 'failed', gateReasons: ['反復が例外で異常終了した: boom'] }),
    ];
    const s = abandonedSummary(runs);
    expect(s.count).toBe(0);
    expect(s.rate).toBe(0);
    expect(s.topGateReasonCategory).toBeNull();
  });

  it('abandoned以外のrunのコスト・revise回数・gateReasonsを集計に混ぜない', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'merged',
        reviseCycles: 9,
        cost: { builderUsd: 1, adversaryUsd: 1, ideationUsd: 1, totalUsd: 3 },
        gateReasons: [],
      }),
      makeRun({
        iteration: 2,
        verdict: 'abandoned',
        reviseCycles: 2,
        cost: { builderUsd: 0.1, adversaryUsd: 0.02, ideationUsd: 0, totalUsd: 0.12 },
        gateReasons: ['adversary が approve していない'],
      }),
      makeRun({
        iteration: 3,
        verdict: 'abandoned',
        reviseCycles: 4,
        cost: { builderUsd: 0.2, adversaryUsd: 0.03, ideationUsd: 0, totalUsd: 0.23 },
        gateReasons: ['adversary が approve していない'],
      }),
      makeRun({
        iteration: 4,
        verdict: 'failed',
        reviseCycles: 100,
        cost: { builderUsd: 5, adversaryUsd: 0, ideationUsd: 0, totalUsd: 5 },
        // failed の gateReasons は abandoned のカテゴリ集計を汚染してはいけない
        gateReasons: ['変更行数 500 が上限 400 を超えている'],
      }),
    ];
    const s = abandonedSummary(runs);
    expect(s.count).toBe(2);
    expect(s.rate).toBeCloseTo(0.5);
    // merged/failed のコストを含めず abandoned の2件のみ合算する
    expect(s.totalCostUsd).toBeCloseTo(0.35);
    // merged(9)/failed(100)を含めず abandoned の2件のみ平均する: (2+4)/2 = 3
    expect(s.avgReviseCycles).toBeCloseTo(3);
    // failed の changedLinesExceeded ではなく abandoned 側の adversaryNotApproved が最多
    expect(s.topGateReasonCategory).toBe('adversaryNotApproved');
    expect(s.topGateReasonCount).toBe(2);
  });
});

describe('abandonedReasonBreakdown', () => {
  it('空配列は空配列を返す（境界値）', () => {
    expect(abandonedReasonBreakdown([])).toEqual([]);
  });

  it('abandonedが1件も無ければ、他verdictのgateReasonsが存在しても空配列を返す（境界値）', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'failed', gateReasons: ['反復が例外で異常終了した: boom'] }),
      makeRun({ iteration: 2, verdict: 'merged', gateReasons: [] }),
    ];
    expect(abandonedReasonBreakdown(runs)).toEqual([]);
  });

  it('abandoned以外のrunのgateReasonsを混ぜず、abandonedのみをカテゴリ別に件数降順で集計する', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'abandoned', gateReasons: ['adversary が approve していない'] }),
      makeRun({ iteration: 2, verdict: 'abandoned', gateReasons: ['adversary が approve していない'] }),
      makeRun({
        iteration: 3,
        verdict: 'abandoned',
        gateReasons: ['変更行数 500 が上限 400 を超えている'],
      }),
      // failed の gateReasons は abandoned の内訳を汚染してはいけない
      makeRun({ iteration: 4, verdict: 'failed', gateReasons: ['反復が例外で異常終了した: boom'] }),
      makeRun({ iteration: 5, verdict: 'merged', gateReasons: [] }),
    ];
    const breakdown = abandonedReasonBreakdown(runs);

    expect(breakdown.map((b) => b.category)).toEqual(['adversaryNotApproved', 'changedLinesExceeded']);
    expect(breakdown.map((b) => b.count)).toEqual([2, 1]);

    const adversaryEntry = breakdown.find((b) => b.category === 'adversaryNotApproved');
    expect(adversaryEntry?.iterations).toEqual([1, 2]);

    // gateReasonBreakdown(runs) をそのまま使うと failed のカテゴリ(crashed)が混入してしまう
    expect(breakdown.some((b) => b.category === 'crashed')).toBe(false);
  });
});

describe('abandonedReasonOverrepresentation', () => {
  it('空配列は空配列を返す（境界値）', () => {
    expect(abandonedReasonOverrepresentation([])).toEqual([]);
  });

  it('abandonedが1件も無ければ空配列を返す（境界値）', () => {
    const runs = [makeRun({ iteration: 1, verdict: 'failed', gateReasons: ['反復が例外で異常終了した: boom'] })];
    expect(abandonedReasonOverrepresentation(runs)).toEqual([]);
  });

  it('abandoned以外にgateReasonsを持つ反復が無ければ、abandoned内の占有率=全体の占有率となりすべてneutral', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'abandoned', gateReasons: ['adversary が approve していない'] }),
      makeRun({
        iteration: 2,
        verdict: 'abandoned',
        gateReasons: ['変更行数 500 が上限 400 を超えている'],
      }),
    ];
    const result = abandonedReasonOverrepresentation(runs);
    expect(result).toHaveLength(2);
    for (const r of result) {
      expect(r.deltaPct).toBeCloseTo(0, 5);
      expect(r.signal).toBe('neutral');
      expect(r.abandonedSharePct).toBeCloseTo(r.overallSharePct, 5);
    }
  });

  it('abandonedで占有率が全体より閾値以上高いカテゴリはoverrepresented、低いカテゴリはunderrepresentedと判定する', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'abandoned', gateReasons: ['adversary が approve していない'] }),
      makeRun({ iteration: 2, verdict: 'abandoned', gateReasons: ['反復が例外で異常終了した: boom'] }),
      ...Array.from({ length: 8 }, (_, i) =>
        makeRun({
          iteration: 3 + i,
          verdict: 'failed',
          gateReasons: ['反復が例外で異常終了した: boom'],
        }),
      ),
    ];
    // abandoned内: adversaryNotApproved 1件(50%) / crashed 1件(50%)
    // 全体: adversaryNotApproved 1件(10%) / crashed 9件(90%)
    const result = abandonedReasonOverrepresentation(runs);

    const adversaryEntry = result.find((r) => r.category === 'adversaryNotApproved')!;
    expect(adversaryEntry.abandonedSharePct).toBeCloseTo(50, 5);
    expect(adversaryEntry.overallSharePct).toBeCloseTo(10, 5);
    expect(adversaryEntry.deltaPct).toBeCloseTo(40, 5);
    expect(adversaryEntry.signal).toBe('overrepresented');

    const crashedEntry = result.find((r) => r.category === 'crashed')!;
    expect(crashedEntry.abandonedSharePct).toBeCloseTo(50, 5);
    expect(crashedEntry.overallSharePct).toBeCloseTo(90, 5);
    expect(crashedEntry.deltaPct).toBeCloseTo(-40, 5);
    expect(crashedEntry.signal).toBe('underrepresented');

    // 母集団側の crashed の count(9件) が混ざらず、abandoned側の count(1件)のまま
    expect(crashedEntry.count).toBe(1);
    expect(crashedEntry.iterations).toEqual([2]);
  });

  it('deltaPctが閾値(ABANDONED_REASON_OVERREPRESENTATION_THRESHOLD_PT)未満ならneutralと判定する', () => {
    expect(ABANDONED_REASON_OVERREPRESENTATION_THRESHOLD_PT).toBe(10);

    const runs = [
      // abandoned: adversaryNotApproved 6件 / changedLinesExceeded 4件 (60% / 40%)
      ...Array.from({ length: 6 }, (_, i) =>
        makeRun({ iteration: i + 1, verdict: 'abandoned', gateReasons: ['adversary が approve していない'] }),
      ),
      ...Array.from({ length: 4 }, (_, i) =>
        makeRun({
          iteration: 7 + i,
          verdict: 'abandoned',
          gateReasons: ['変更行数 500 が上限 400 を超えている'],
        }),
      ),
      // failed側に adversaryNotApproved を1件だけ足す(全体: 7件/11件 ≈ 63.6% > abandoned内の60%)
      // -> delta = 60 - 63.6... ≈ -3.6pt で閾値10未満なのでneutral
      makeRun({ iteration: 11, verdict: 'failed', gateReasons: ['adversary が approve していない'] }),
    ];
    const result = abandonedReasonOverrepresentation(runs);
    const adversaryEntry = result.find((r) => r.category === 'adversaryNotApproved')!;
    expect(Math.abs(adversaryEntry.deltaPct)).toBeLessThan(ABANDONED_REASON_OVERREPRESENTATION_THRESHOLD_PT);
    expect(adversaryEntry.signal).toBe('neutral');
  });
});

describe('abandonedRateTrend', () => {
  it('空配列は空配列を返す（境界値）', () => {
    expect(abandonedRateTrend([])).toEqual([]);
  });

  it('累積abandoned率を各反復ごとに計算し、最終点はabandonedSummaryのrateと一致する', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged' }),
      makeRun({ iteration: 2, verdict: 'abandoned' }),
      makeRun({ iteration: 3, verdict: 'abandoned' }),
      makeRun({ iteration: 4, verdict: 'merged' }),
    ];
    const trend = abandonedRateTrend(runs);
    expect(trend).toEqual([
      { iteration: 1, value: 0 },
      { iteration: 2, value: 50 },
      { iteration: 3, value: (2 / 3) * 100 },
      { iteration: 4, value: 50 },
    ]);
    expect(trend[trend.length - 1].value).toBeCloseTo(abandonedSummary(runs).rate * 100);
  });
});

describe('abandonedIterationDetails', () => {
  it('空配列は空配列を返す（境界値）', () => {
    expect(abandonedIterationDetails([])).toEqual([]);
  });

  it('abandoned以外のrunを除外し、新しい反復から順に並べる', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'abandoned' }),
      makeRun({ iteration: 2, verdict: 'merged' }),
      makeRun({ iteration: 3, verdict: 'abandoned' }),
    ];
    const details = abandonedIterationDetails(runs);
    expect(details.map((d) => d.iteration)).toEqual([3, 1]);
  });

  it('各反復の詳細フィールドを元のrunと一致する値で返す', () => {
    const runs = [
      makeRun({
        iteration: 5,
        issue: { number: 42, title: '見送られたissue', labels: [] },
        verdict: 'abandoned',
        gateReasons: ['adversary が approve していない'],
        reviseCycles: 3,
        durationSec: 240,
        cost: { builderUsd: 0.1, adversaryUsd: 0.02, ideationUsd: 0, totalUsd: 0.12 },
        models: { builder: 'claude-sonnet-5', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
      }),
    ];
    const [detail] = abandonedIterationDetails(runs);
    expect(detail).toEqual({
      iteration: 5,
      issueNumber: 42,
      issueTitle: '見送られたissue',
      gateReasons: ['adversary が approve していない'],
      reviseCycles: 3,
      costUsd: 0.12,
      durationSec: 240,
      builderModel: 'claude-sonnet-5',
    });
  });
});

describe('pausedDryRunDetails', () => {
  it('空配列は空配列を返す（境界値）', () => {
    expect(pausedDryRunDetails([])).toEqual([]);
  });

  it('paused/dry-run以外のrunを除外し、新しい反復から順に並べる', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'paused' }),
      makeRun({ iteration: 2, verdict: 'merged' }),
      makeRun({ iteration: 3, verdict: 'dry-run' }),
      makeRun({ iteration: 4, verdict: 'failed' }),
    ];
    const details = pausedDryRunDetails(runs);
    expect(details.map((d) => d.iteration)).toEqual([3, 1]);
  });

  it('survivalIterationsはpaused/dry-run以外を含む全反復の最新iterationを基準に計算する', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'paused' }),
      makeRun({ iteration: 2, verdict: 'abandoned' }),
      makeRun({ iteration: 3, verdict: 'dry-run' }),
      makeRun({ iteration: 4, verdict: 'merged' }),
    ];
    const details = pausedDryRunDetails(runs);
    // 最新反復は iteration 4（merged）。paused/dry-run のみに絞った母集団の最新（3）を
    // 基準にすると誤った値になるため、全反復基準であることを検証する。
    const paused = details.find((d) => d.iteration === 1);
    const dryRun = details.find((d) => d.iteration === 3);
    expect(paused?.survivalIterations).toBe(3);
    expect(dryRun?.survivalIterations).toBe(1);
  });

  it('最新反復自体がpaused/dry-runならsurvivalIterationsは0（境界値）', () => {
    const runs = [makeRun({ iteration: 1, verdict: 'merged' }), makeRun({ iteration: 2, verdict: 'paused' })];
    const [detail] = pausedDryRunDetails(runs);
    expect(detail.survivalIterations).toBe(0);
  });

  it('各反復の詳細フィールドを元のrunと一致する値で返す（prNumberがnullの境界値含む）', () => {
    const runs = [
      makeRun({
        iteration: 5,
        issue: { number: 42, title: '止まったissue', labels: [] },
        verdict: 'paused',
        prNumber: null,
        durationSec: 240,
        cost: { builderUsd: 0.1, adversaryUsd: 0.02, ideationUsd: 0, totalUsd: 0.12 },
      }),
    ];
    const [detail] = pausedDryRunDetails(runs);
    expect(detail).toEqual({
      iteration: 5,
      issueNumber: 42,
      issueTitle: '止まったissue',
      stopReason: 'paused',
      prNumber: null,
      durationSec: 240,
      costUsd: 0.12,
      survivalIterations: 0,
    });
  });
});

describe('pausedDryRunSummary', () => {
  it('空配列は count 0・reasons 空配列・longestSurviving null を返す（境界値）', () => {
    const s = pausedDryRunSummary([]);
    expect(s).toEqual({ count: 0, reasons: [], longestSurviving: null });
  });

  it('paused/dry-runが1件も無ければ merged/failed/abandoned だけでも count 0 になる', () => {
    const runs = [makeRun({ iteration: 1, verdict: 'merged' }), makeRun({ iteration: 2, verdict: 'failed' })];
    const s = pausedDryRunSummary(runs);
    expect(s.count).toBe(0);
    expect(s.reasons).toEqual([]);
    expect(s.longestSurviving).toBeNull();
  });

  it('停止理由別に件数・平均/最大生存反復数・合計コスト・PR開設件数を分けて集計する', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'paused',
        prNumber: 10,
        cost: { builderUsd: 0.1, adversaryUsd: 0, ideationUsd: 0, totalUsd: 0.1 },
      }),
      makeRun({
        iteration: 3,
        verdict: 'paused',
        prNumber: null,
        cost: { builderUsd: 0.2, adversaryUsd: 0, ideationUsd: 0, totalUsd: 0.2 },
      }),
      makeRun({
        iteration: 5,
        verdict: 'dry-run',
        prNumber: 20,
        cost: { builderUsd: 1.0, adversaryUsd: 0, ideationUsd: 0, totalUsd: 1.0 },
      }),
      makeRun({ iteration: 6, verdict: 'merged' }),
    ];
    const s = pausedDryRunSummary(runs);
    // 最新反復は iteration 6。paused(1,3)のsurvivalIterationsは5,3 → 平均4・最大5
    expect(s.count).toBe(3);
    const paused = s.reasons.find((r) => r.stopReason === 'paused');
    const dryRun = s.reasons.find((r) => r.stopReason === 'dry-run');
    expect(paused).toEqual({
      stopReason: 'paused',
      count: 2,
      avgSurvivalIterations: 4,
      maxSurvivalIterations: 5,
      totalCostUsd: 0.30000000000000004,
      openPrCount: 1,
    });
    expect(dryRun).toEqual({
      stopReason: 'dry-run',
      count: 1,
      avgSurvivalIterations: 1,
      maxSurvivalIterations: 1,
      totalCostUsd: 1.0,
      openPrCount: 1,
    });
  });

  it('reasonsは該当件数0の停止理由を含めない', () => {
    const runs = [makeRun({ iteration: 1, verdict: 'paused' }), makeRun({ iteration: 2, verdict: 'merged' })];
    const s = pausedDryRunSummary(runs);
    expect(s.reasons.map((r) => r.stopReason)).toEqual(['paused']);
  });

  it('longestSurvivingは最も生存反復数の多いエントリを返す', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'paused', issue: { number: 1, title: '古い', labels: [] } }),
      makeRun({ iteration: 4, verdict: 'dry-run', issue: { number: 2, title: '新しい', labels: [] } }),
      makeRun({ iteration: 10, verdict: 'merged' }),
    ];
    const s = pausedDryRunSummary(runs);
    expect(s.longestSurviving?.iteration).toBe(1);
    expect(s.longestSurviving?.issueTitle).toBe('古い');
    expect(s.longestSurviving?.survivalIterations).toBe(9);
  });
});

describe('gatePauseClassifications', () => {
  it('空配列は空配列を返す（境界値）', () => {
    expect(gatePauseClassifications([])).toEqual([]);
  });

  it('paused以外（dry-run含む）を除外する', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'paused' }),
      makeRun({ iteration: 2, verdict: 'dry-run' }),
      makeRun({ iteration: 3, verdict: 'merged' }),
      makeRun({ iteration: 4, verdict: 'failed' }),
    ];
    expect(gatePauseClassifications(runs).map((c) => c.iteration)).toEqual([1]);
  });

  it('reviseCyclesが0ならclean-pause、1以上ならcontested-pauseに分類する（境界値）', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'paused', reviseCycles: 0 }),
      makeRun({ iteration: 2, verdict: 'paused', reviseCycles: 1 }),
      makeRun({ iteration: 3, verdict: 'merged' }),
    ];
    const classifications = gatePauseClassifications(runs);
    expect(classifications.find((c) => c.iteration === 1)?.pattern).toBe('clean-pause');
    expect(classifications.find((c) => c.iteration === 2)?.pattern).toBe('contested-pause');
  });

  it('同じissueが後続反復で再実行されていればreattemptedとなり、再実行反復番号を昇順で持つ', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'paused', issue: { number: 7, title: '止まったissue', labels: [] } }),
      makeRun({ iteration: 2, verdict: 'merged', issue: { number: 1, title: '別issue', labels: [] } }),
      makeRun({ iteration: 5, verdict: 'failed', issue: { number: 7, title: '止まったissue', labels: [] } }),
      makeRun({ iteration: 8, verdict: 'merged', issue: { number: 7, title: '止まったissue', labels: [] } }),
    ];
    const [classification] = gatePauseClassifications(runs);
    expect(classification.abandonmentStatus).toBe('reattempted');
    expect(classification.reattemptedAtIterations).toEqual([5, 8]);
  });

  it(
    `再実行が無くsurvivalIterationsがちょうど${GATE_PAUSE_STALE_THRESHOLD_ITERATIONS}ならstalled、1少なければpending（閾値の境界値）`,
    () => {
      const latest = GATE_PAUSE_STALE_THRESHOLD_ITERATIONS + 2;
      const runs = [
        // survival = latest - iteration。atThresholdはちょうど閾値、belowThresholdは閾値-1。
        makeRun({ iteration: latest - GATE_PAUSE_STALE_THRESHOLD_ITERATIONS, verdict: 'paused' }),
        makeRun({
          iteration: latest - GATE_PAUSE_STALE_THRESHOLD_ITERATIONS + 1,
          verdict: 'paused',
          issue: { number: 2, title: 'x', labels: [] },
        }),
        makeRun({ iteration: latest, verdict: 'merged', issue: { number: 99, title: 'latest', labels: [] } }),
      ];
      const classifications = gatePauseClassifications(runs);
      const atThreshold = classifications.find((c) => c.iteration === latest - GATE_PAUSE_STALE_THRESHOLD_ITERATIONS);
      const belowThreshold = classifications.find(
        (c) => c.iteration === latest - GATE_PAUSE_STALE_THRESHOLD_ITERATIONS + 1,
      );
      expect(atThreshold?.survivalIterations).toBe(GATE_PAUSE_STALE_THRESHOLD_ITERATIONS);
      expect(atThreshold?.abandonmentStatus).toBe('stalled');
      expect(belowThreshold?.survivalIterations).toBe(GATE_PAUSE_STALE_THRESHOLD_ITERATIONS - 1);
      expect(belowThreshold?.abandonmentStatus).toBe('pending');
    },
  );

  it('新しい反復から順に並べる', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'paused' }),
      makeRun({ iteration: 4, verdict: 'paused', issue: { number: 2, title: 'y', labels: [] } }),
      makeRun({ iteration: 10, verdict: 'merged' }),
    ];
    expect(gatePauseClassifications(runs).map((c) => c.iteration)).toEqual([4, 1]);
  });

  it('reattemptedAtIterationsが空の場合はreattemptedにならない（再実行無しの境界値）', () => {
    const runs = [makeRun({ iteration: 1, verdict: 'paused' })];
    const [classification] = gatePauseClassifications(runs);
    expect(classification.reattemptedAtIterations).toEqual([]);
    expect(classification.abandonmentStatus).not.toBe('reattempted');
  });

  it('各フィールドを元のrunと一致する値で返す（prNumberがnullの境界値含む）', () => {
    const runs = [
      makeRun({
        iteration: 3,
        issue: { number: 9, title: '止まったissue', labels: [] },
        verdict: 'paused',
        prNumber: null,
        reviseCycles: 2,
        durationSec: 180,
        cost: { builderUsd: 0.2, adversaryUsd: 0.03, ideationUsd: 0, totalUsd: 0.23 },
      }),
    ];
    const [classification] = gatePauseClassifications(runs);
    expect(classification).toEqual({
      iteration: 3,
      issueNumber: 9,
      issueTitle: '止まったissue',
      prNumber: null,
      pattern: 'contested-pause',
      reviseCycles: 2,
      survivalIterations: 0,
      abandonmentStatus: 'pending',
      reattemptedAtIterations: [],
      costUsd: 0.23,
      durationSec: 180,
    });
  });
});

describe('gatePauseSummary', () => {
  it('空配列は count 0・空配列・mostAtRisk null を返す（境界値）', () => {
    expect(gatePauseSummary([])).toEqual({ count: 0, patterns: [], abandonment: [], mostAtRisk: null });
  });

  it('pausedが1件も無ければmerged/failedだけでもcount 0になる', () => {
    const runs = [makeRun({ iteration: 1, verdict: 'merged' }), makeRun({ iteration: 2, verdict: 'failed' })];
    const s = gatePauseSummary(runs);
    expect(s.count).toBe(0);
    expect(s.patterns).toEqual([]);
    expect(s.abandonment).toEqual([]);
    expect(s.mostAtRisk).toBeNull();
  });

  it('pattern別・abandonmentStatus別の件数を、該当0件を除いて集計する', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'paused', reviseCycles: 0, issue: { number: 1, title: 'a', labels: [] } }),
      makeRun({ iteration: 2, verdict: 'paused', reviseCycles: 2, issue: { number: 2, title: 'b', labels: [] } }),
      makeRun({ iteration: 3, verdict: 'merged', issue: { number: 2, title: 'b', labels: [] } }),
      makeRun({ iteration: 20, verdict: 'merged', issue: { number: 99, title: 'latest', labels: [] } }),
    ];
    const s = gatePauseSummary(runs);
    expect(s.count).toBe(2);
    // iteration1: reviseCycles0→clean-pause、再実行無し・survival19→stalled
    // iteration2: reviseCycles2→contested-pause、issue2がiteration3で再実行→reattempted
    expect(s.patterns).toEqual([
      { pattern: 'clean-pause', count: 1 },
      { pattern: 'contested-pause', count: 1 },
    ]);
    expect(s.abandonment).toEqual([
      { status: 'reattempted', count: 1 },
      { status: 'stalled', count: 1 },
    ]);
  });

  it('mostAtRiskはstalledのうちsurvivalIterationsが最大のものを返す', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'paused', issue: { number: 1, title: '最も古い', labels: [] } }),
      makeRun({ iteration: 5, verdict: 'paused', issue: { number: 2, title: '中間', labels: [] } }),
      makeRun({ iteration: 20, verdict: 'merged', issue: { number: 99, title: 'latest', labels: [] } }),
    ];
    const s = gatePauseSummary(runs);
    expect(s.mostAtRisk?.iteration).toBe(1);
    expect(s.mostAtRisk?.issueTitle).toBe('最も古い');
  });

  it('stalledが1件も無ければmostAtRiskはnull（reattempted/pendingのみの境界値）', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'paused', issue: { number: 1, title: 'a', labels: [] } }),
      makeRun({ iteration: 2, verdict: 'merged', issue: { number: 1, title: 'a', labels: [] } }),
    ];
    const s = gatePauseSummary(runs);
    expect(s.abandonment).toEqual([{ status: 'reattempted', count: 1 }]);
    expect(s.mostAtRisk).toBeNull();
  });
});

describe('adversaryOutcomeDivergence', () => {
  it('runが無ければ空配列を返す', () => {
    expect(adversaryOutcomeDivergence([])).toEqual([]);
  });

  it('failedのみの場合はレビュー未到達のため対象0件（空配列）になる', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'failed', adversary: { approved: false, summary: '' } }),
    ];
    expect(adversaryOutcomeDivergence(runs)).toEqual([]);
  });

  it('承認して実際にmergedになったケースは乖離0件・乖離率0%として集計される', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'merged',
        adversary: { approved: true, summary: '' },
        models: { builder: 'b', adversary: 'model-a', ideation: 'i' },
      }),
    ];
    const [row] = adversaryOutcomeDivergence(runs);
    expect(row.model).toBe('model-a');
    expect(row.decidedCount).toBe(1);
    expect(row.approvedCount).toBe(1);
    expect(row.rejectedCount).toBe(0);
    expect(row.falseApproveCount).toBe(0);
    expect(row.falseApproveRatePct).toBe(0);
    expect(row.falseRejectCount).toBe(0);
    expect(row.divergenceRatePct).toBe(0);
    expect(row.falseApproveIterations).toEqual([]);
    expect(row.iterations).toEqual([1]);
  });

  it('却下して実際にmergedにならなかったケースも乖離0件として集計される（一致の別パターン）', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'abandoned',
        adversary: { approved: false, summary: '' },
        models: { builder: 'b', adversary: 'model-a', ideation: 'i' },
      }),
    ];
    const [row] = adversaryOutcomeDivergence(runs);
    expect(row.approvedCount).toBe(0);
    expect(row.rejectedCount).toBe(1);
    expect(row.falseRejectCount).toBe(0);
    expect(row.divergenceRatePct).toBe(0);
  });

  it('承認したのにmerged以外（見落とし=falseApprove）を件数・率・反復番号つきで検出する', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'merged',
        adversary: { approved: true, summary: '' },
        models: { builder: 'b', adversary: 'model-a', ideation: 'i' },
      }),
      makeRun({
        iteration: 2,
        verdict: 'abandoned',
        adversary: { approved: true, summary: '' },
        models: { builder: 'b', adversary: 'model-a', ideation: 'i' },
      }),
      makeRun({
        iteration: 3,
        verdict: 'paused',
        adversary: { approved: true, summary: '' },
        models: { builder: 'b', adversary: 'model-a', ideation: 'i' },
      }),
    ];
    const [row] = adversaryOutcomeDivergence(runs);
    expect(row.approvedCount).toBe(3);
    expect(row.falseApproveCount).toBe(2);
    expect(row.falseApproveRatePct).toBeCloseTo((2 / 3) * 100, 5);
    expect(row.falseApproveIterations).toEqual([2, 3]);
    expect(row.divergenceRatePct).toBeCloseTo((2 / 3) * 100, 5);
  });

  it('却下したのにmergedになった異常ケース（誤却下=falseReject）も対称に検出する', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'merged',
        adversary: { approved: false, summary: '' },
        models: { builder: 'b', adversary: 'model-a', ideation: 'i' },
      }),
    ];
    const [row] = adversaryOutcomeDivergence(runs);
    expect(row.rejectedCount).toBe(1);
    expect(row.falseRejectCount).toBe(1);
    expect(row.falseRejectRatePct).toBe(100);
    expect(row.falseApproveCount).toBe(0);
    expect(row.falseApproveRatePct).toBe(0); // 承認0件が分母のため0であって100/0ではない
    expect(row.divergenceRatePct).toBe(100);
  });

  it('adversaryモデルごとに独立して集計し、母集団を混同しない', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'merged',
        adversary: { approved: true, summary: '' },
        models: { builder: 'b', adversary: 'model-a', ideation: 'i' },
      }),
      makeRun({
        iteration: 2,
        verdict: 'abandoned',
        adversary: { approved: true, summary: '' },
        models: { builder: 'b', adversary: 'model-b', ideation: 'i' },
      }),
    ];
    const rows = adversaryOutcomeDivergence(runs);
    expect(rows).toHaveLength(2);
    const a = rows.find((r) => r.model === 'model-a')!;
    const b = rows.find((r) => r.model === 'model-b')!;
    expect(a.divergenceRatePct).toBe(0);
    expect(b.divergenceRatePct).toBe(100);
  });

  it('乖離率の降順で並び、同率のときはモデル名昇順で安定させる', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'merged',
        adversary: { approved: true, summary: '' },
        models: { builder: 'b', adversary: 'model-zeta', ideation: 'i' },
      }),
      makeRun({
        iteration: 2,
        verdict: 'merged',
        adversary: { approved: true, summary: '' },
        models: { builder: 'b', adversary: 'model-alpha', ideation: 'i' },
      }),
    ];
    // 両モデルとも乖離率0%で同率 → モデル名昇順
    expect(adversaryOutcomeDivergence(runs).map((r) => r.model)).toEqual(['model-alpha', 'model-zeta']);
  });
});

describe('adversaryModelVerdictMissMatrix', () => {
  it('runが無ければ空配列を返す', () => {
    expect(adversaryModelVerdictMissMatrix([])).toEqual([]);
  });

  it('failedのみの場合はレビュー未到達のため対象0件（空配列）になる', () => {
    const runs = [makeRun({ iteration: 1, verdict: 'failed', adversary: { approved: false, summary: '' } })];
    expect(adversaryModelVerdictMissMatrix(runs)).toEqual([]);
  });

  it('mergedのみの場合はnonMergedCount=0で見落としようが無く、cellsは空になる', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'merged',
        adversary: { approved: true, summary: '' },
        models: { builder: 'b', adversary: 'model-a', ideation: 'i' },
      }),
    ];
    const [row] = adversaryModelVerdictMissMatrix(runs);
    expect(row.model).toBe('model-a');
    expect(row.decidedCount).toBe(1);
    expect(row.nonMergedCount).toBe(0);
    expect(row.totalMissCount).toBe(0);
    expect(row.overallMissRatePct).toBe(0);
    expect(row.cells).toEqual([]);
  });

  it('非マージverdictで承認していれば見落としとしてセルに件数・率・反復番号を計上する', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'abandoned',
        adversary: { approved: true, summary: '' },
        models: { builder: 'b', adversary: 'model-a', ideation: 'i' },
      }),
      makeRun({
        iteration: 2,
        verdict: 'abandoned',
        adversary: { approved: false, summary: '' },
        models: { builder: 'b', adversary: 'model-a', ideation: 'i' },
      }),
    ];
    const [row] = adversaryModelVerdictMissMatrix(runs);
    expect(row.nonMergedCount).toBe(2);
    expect(row.totalMissCount).toBe(1);
    expect(row.overallMissRatePct).toBeCloseTo(50, 5);

    const [cell] = row.cells;
    expect(cell.verdict).toBe('abandoned');
    expect(cell.count).toBe(2);
    expect(cell.missCount).toBe(1);
    expect(cell.missRatePct).toBeCloseTo(50, 5);
    expect(cell.iterations).toEqual([1]);
  });

  it('同一モデルで複数の非マージverdictにまたがる見落としを列ごとに分解する（合算に潰さない）', () => {
    const runs = [
      // abandoned: 2件中2件見落とし（100%）
      makeRun({
        iteration: 1,
        verdict: 'abandoned',
        adversary: { approved: true, summary: '' },
        models: { builder: 'b', adversary: 'model-a', ideation: 'i' },
      }),
      makeRun({
        iteration: 2,
        verdict: 'abandoned',
        adversary: { approved: true, summary: '' },
        models: { builder: 'b', adversary: 'model-a', ideation: 'i' },
      }),
      // needs-human: 1件中0件見落とし（0%）
      makeRun({
        iteration: 3,
        verdict: 'needs-human',
        adversary: { approved: false, summary: '' },
        models: { builder: 'b', adversary: 'model-a', ideation: 'i' },
      }),
    ];
    const [row] = adversaryModelVerdictMissMatrix(runs);
    expect(row.cells.map((c) => c.verdict)).toEqual(['needs-human', 'abandoned']);

    const abandonedCell = row.cells.find((c) => c.verdict === 'abandoned')!;
    expect(abandonedCell.count).toBe(2);
    expect(abandonedCell.missCount).toBe(2);
    expect(abandonedCell.missRatePct).toBe(100);
    expect(abandonedCell.iterations).toEqual([1, 2]);

    const needsHumanCell = row.cells.find((c) => c.verdict === 'needs-human')!;
    expect(needsHumanCell.count).toBe(1);
    expect(needsHumanCell.missCount).toBe(0);
    expect(needsHumanCell.missRatePct).toBe(0);

    // 分母はnon-merged全体(3件)、見落としは合計2件 → 2/3
    expect(row.totalMissCount).toBe(2);
    expect(row.overallMissRatePct).toBeCloseTo((2 / 3) * 100, 5);
  });

  it('cellsは MISS_MATRIX_VERDICT_ORDER (dry-run, paused, needs-human, abandoned) の順で、出現したverdictだけを含む', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'abandoned',
        adversary: { approved: true, summary: '' },
        models: { builder: 'b', adversary: 'model-a', ideation: 'i' },
      }),
      makeRun({
        iteration: 2,
        verdict: 'dry-run',
        adversary: { approved: true, summary: '' },
        models: { builder: 'b', adversary: 'model-a', ideation: 'i' },
      }),
      makeRun({
        iteration: 3,
        verdict: 'paused',
        adversary: { approved: false, summary: '' },
        models: { builder: 'b', adversary: 'model-a', ideation: 'i' },
      }),
    ];
    const [row] = adversaryModelVerdictMissMatrix(runs);
    // needs-humanは出現していないので含まれない。出現順ではなく固定順(dry-run→paused→...→abandoned)。
    expect(row.cells.map((c) => c.verdict)).toEqual(['dry-run', 'paused', 'abandoned']);
  });

  it('adversaryモデルごとに独立して集計し、母集団を混同しない', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'abandoned',
        adversary: { approved: true, summary: '' },
        models: { builder: 'b', adversary: 'model-a', ideation: 'i' },
      }),
      makeRun({
        iteration: 2,
        verdict: 'abandoned',
        adversary: { approved: false, summary: '' },
        models: { builder: 'b', adversary: 'model-b', ideation: 'i' },
      }),
    ];
    const rows = adversaryModelVerdictMissMatrix(runs);
    expect(rows).toHaveLength(2);
    const a = rows.find((r) => r.model === 'model-a')!;
    const b = rows.find((r) => r.model === 'model-b')!;
    expect(a.overallMissRatePct).toBe(100);
    expect(b.overallMissRatePct).toBe(0);
  });

  it('overallMissRatePctの降順で並び、同率のときはモデル名昇順で安定させる', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'abandoned',
        adversary: { approved: false, summary: '' },
        models: { builder: 'b', adversary: 'model-zeta', ideation: 'i' },
      }),
      makeRun({
        iteration: 2,
        verdict: 'abandoned',
        adversary: { approved: false, summary: '' },
        models: { builder: 'b', adversary: 'model-alpha', ideation: 'i' },
      }),
    ];
    // 両モデルとも見落とし率0%で同率 → モデル名昇順
    expect(adversaryModelVerdictMissMatrix(runs).map((r) => r.model)).toEqual(['model-alpha', 'model-zeta']);
  });
});

describe('verdictTransitions / verdictTransitionSummary', () => {
  it('run が1件以下なら空配列を返す（比較対象となる隣接ペアが無い）', () => {
    expect(verdictTransitions([])).toEqual([]);
    expect(verdictTransitions([makeRun({ iteration: 1, verdict: 'merged' })])).toEqual([]);
    expect(verdictTransitionSummary([makeRun({ iteration: 1 })])).toEqual([]);
  });

  it('iteration昇順で隣接する2件ごとに from/to/kind を持つ遷移を作る（入力順に依存しない）', () => {
    const runs = [
      makeRun({ iteration: 3, verdict: 'merged' }),
      makeRun({ iteration: 1, verdict: 'failed' }),
      makeRun({ iteration: 2, verdict: 'abandoned' }),
    ];
    const transitions = verdictTransitions(runs);
    expect(transitions).toEqual([
      { fromIteration: 1, toIteration: 2, from: 'failed', to: 'abandoned', kind: 'shiftedFailure' },
      { fromIteration: 2, toIteration: 3, from: 'abandoned', to: 'merged', kind: 'recovered' },
    ]);
  });

  it('merged→非merged は regressed、非merged→merged は recovered、merged→merged は sustainedSuccess', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged' }),
      makeRun({ iteration: 2, verdict: 'merged' }),
      makeRun({ iteration: 3, verdict: 'failed' }),
      makeRun({ iteration: 4, verdict: 'merged' }),
    ];
    const kinds = verdictTransitions(runs).map((t) => t.kind);
    expect(kinds).toEqual(['sustainedSuccess', 'regressed', 'recovered']);
  });

  it('非merged→同じverdict は repeatedFailure、非merged→別verdict は shiftedFailure', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'failed' }),
      makeRun({ iteration: 2, verdict: 'failed' }),
      makeRun({ iteration: 3, verdict: 'needs-human' }),
    ];
    const kinds = verdictTransitions(runs).map((t) => t.kind);
    expect(kinds).toEqual(['repeatedFailure', 'shiftedFailure']);
  });

  it('summaryは出現した種別だけをcount降順で返し、0件の種別は含めない', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged' }),
      makeRun({ iteration: 2, verdict: 'merged' }),
      makeRun({ iteration: 3, verdict: 'merged' }),
      makeRun({ iteration: 4, verdict: 'failed' }),
    ];
    const summary = verdictTransitionSummary(runs);
    // 3遷移中: merged→merged(sustainedSuccess)×2, merged→failed(regressed)×1
    expect(summary).toEqual([
      { kind: 'sustainedSuccess', count: 2, pct: expect.closeTo(66.6666, 3) },
      { kind: 'regressed', count: 1, pct: expect.closeTo(33.3333, 3) },
    ]);
    expect(summary.some((s) => s.kind === 'recovered')).toBe(false);
  });

  it('countが同数のときはVERDICT_TRANSITION_KIND_ORDER（sustainedSuccess→recovered→repeatedFailure→shiftedFailure→regressed）で安定させる', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged' }),
      makeRun({ iteration: 2, verdict: 'failed' }), // regressed
      makeRun({ iteration: 3, verdict: 'merged' }), // recovered
      makeRun({ iteration: 4, verdict: 'merged' }), // sustainedSuccess
    ];
    // 3遷移すべてcount=1で同数 → 定義順
    expect(verdictTransitionSummary(runs).map((s) => s.kind)).toEqual(['sustainedSuccess', 'recovered', 'regressed']);
  });
});

describe('dropoutStreaks', () => {
  it('run が無ければ空配列を返す', () => {
    expect(dropoutStreaks([])).toEqual([]);
  });

  it('DROPOUT_STREAK_MIN_LENGTH(既定2)未満の単発非マージは連続として扱わない', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged' }),
      makeRun({ iteration: 2, verdict: 'failed' }),
      makeRun({ iteration: 3, verdict: 'merged' }),
    ];
    expect(DROPOUT_STREAK_MIN_LENGTH).toBe(2);
    expect(dropoutStreaks(runs)).toEqual([]);
  });

  it('非マージが2回以上連続しmergedで途切れると recovered として区切る', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'failed',
        cost: { builderUsd: 1, adversaryUsd: 0, ideationUsd: 0, totalUsd: 1 },
      }),
      makeRun({
        iteration: 2,
        verdict: 'needs-human',
        cost: { builderUsd: 2, adversaryUsd: 0, ideationUsd: 0, totalUsd: 2 },
      }),
      makeRun({ iteration: 3, verdict: 'merged' }),
    ];
    const streaks = dropoutStreaks(runs);
    expect(streaks).toHaveLength(1);
    expect(streaks[0]).toEqual({
      startIteration: 1,
      endIteration: 2,
      length: 2,
      verdicts: ['failed', 'needs-human'],
      iterations: [1, 2],
      outcome: 'recovered',
      endedInAbandonment: false,
      totalCostUsd: 3,
    });
  });

  it('連続がデータ終端まで続き最後がabandonedなら droppedOut と分類する', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged' }),
      makeRun({ iteration: 2, verdict: 'failed' }),
      makeRun({ iteration: 3, verdict: 'abandoned' }),
    ];
    const streaks = dropoutStreaks(runs);
    expect(streaks).toHaveLength(1);
    expect(streaks[0].outcome).toBe('droppedOut');
    expect(streaks[0].endedInAbandonment).toBe(true);
    expect(streaks[0].startIteration).toBe(2);
    expect(streaks[0].endIteration).toBe(3);
  });

  it('連続がデータ終端まで続くが最後がabandonedでなければ ongoing と分類する', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged' }),
      makeRun({ iteration: 2, verdict: 'failed' }),
      makeRun({ iteration: 3, verdict: 'paused' }),
    ];
    const streaks = dropoutStreaks(runs);
    expect(streaks).toHaveLength(1);
    expect(streaks[0].outcome).toBe('ongoing');
    expect(streaks[0].endedInAbandonment).toBe(false);
  });

  it('mergedを挟んで複数の独立した連続区間を検知し、それぞれ独立に分類する', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'failed' }),
      makeRun({ iteration: 2, verdict: 'failed' }),
      makeRun({ iteration: 3, verdict: 'merged' }),
      makeRun({ iteration: 4, verdict: 'merged' }),
      makeRun({ iteration: 5, verdict: 'abandoned' }),
      makeRun({ iteration: 6, verdict: 'abandoned' }),
    ];
    const streaks = dropoutStreaks(runs);
    expect(streaks.map((s) => [s.startIteration, s.endIteration, s.outcome])).toEqual([
      [1, 2, 'recovered'],
      [5, 6, 'droppedOut'],
    ]);
  });

  it('paused/dry-runもmergedではない非マージとして連続の一部にカウントする（breakerStreakとは異なる母集団）', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'paused' }),
      makeRun({ iteration: 2, verdict: 'dry-run' }),
      makeRun({ iteration: 3, verdict: 'merged' }),
    ];
    const streaks = dropoutStreaks(runs);
    expect(streaks).toHaveLength(1);
    expect(streaks[0].verdicts).toEqual(['paused', 'dry-run']);
    expect(streaks[0].outcome).toBe('recovered');
  });
});

describe('reviseSizeSuccessPatterns', () => {
  it('run が無ければ空配列を返す', () => {
    expect(reviseSizeSuccessPatterns([])).toEqual([]);
  });

  it('failed run を母集団から除外する（changedLinesが測定されなかったsentinel 0のため）', () => {
    const runs = [makeRun({ iteration: 1, verdict: 'failed', reviseCycles: 0, changedLines: 0 })];
    expect(reviseSizeSuccessPatterns(runs)).toEqual([]);
  });

  it(`changedLines境界値: ${CHANGE_SIZE_SMALL_MAX}以下はsmall、${CHANGE_SIZE_SMALL_MAX + 1}はmediumに入る`, () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', reviseCycles: 0, changedLines: CHANGE_SIZE_SMALL_MAX }),
      makeRun({ iteration: 2, verdict: 'merged', reviseCycles: 0, changedLines: CHANGE_SIZE_SMALL_MAX + 1 }),
      makeRun({ iteration: 3, verdict: 'merged', reviseCycles: 0, changedLines: CHANGE_SIZE_MEDIUM_MAX }),
      makeRun({ iteration: 4, verdict: 'merged', reviseCycles: 0, changedLines: CHANGE_SIZE_MEDIUM_MAX + 1 }),
    ];
    const result = reviseSizeSuccessPatterns(runs);
    expect(result.map((c) => c.sizeBucket)).toEqual(['small', 'medium', 'large']);
    expect(result.find((c) => c.sizeBucket === 'small')?.iterations).toEqual([1]);
    expect(result.find((c) => c.sizeBucket === 'medium')?.iterations).toEqual([2, 3]);
    expect(result.find((c) => c.sizeBucket === 'large')?.iterations).toEqual([4]);
  });

  it('reviseBucket昇順→sizeBucket昇順でソートし、出現しない組み合わせは含めない', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', reviseCycles: 2, changedLines: 500 }),
      makeRun({ iteration: 2, verdict: 'merged', reviseCycles: 0, changedLines: 10 }),
      makeRun({ iteration: 3, verdict: 'merged', reviseCycles: 0, changedLines: 200 }),
    ];
    const result = reviseSizeSuccessPatterns(runs);
    expect(result.map((c) => [c.reviseBucket, c.sizeBucket])).toEqual([
      ['0', 'small'],
      ['0', 'medium'],
      ['2', 'large'],
    ]);
  });

  it(`サンプル数が${SUCCESS_PATTERN_MIN_SAMPLES}未満の組み合わせは insufficient-data と判定する`, () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', reviseCycles: 0, changedLines: 10 }),
      makeRun({ iteration: 2, verdict: 'merged', reviseCycles: 0, changedLines: 10 }),
    ];
    const result = reviseSizeSuccessPatterns(runs);
    expect(result).toHaveLength(1);
    expect(result[0].total).toBe(2);
    expect(result[0].pattern).toBe('insufficient-data');
  });

  it('サンプル数が十分でmergeRateが高い組み合わせはhigh-successと判定する(境界値: ちょうど閾値)', () => {
    // 3件中2件merged => mergeRate = 2/3 ≈ 0.6667 >= 0.66(HIGH_THRESHOLD)
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', reviseCycles: 0, changedLines: 10 }),
      makeRun({ iteration: 2, verdict: 'merged', reviseCycles: 0, changedLines: 10 }),
      makeRun({ iteration: 3, verdict: 'abandoned', reviseCycles: 0, changedLines: 10 }),
    ];
    const result = reviseSizeSuccessPatterns(runs);
    expect(result[0].mergeRate).toBeCloseTo(2 / 3, 5);
    expect(result[0].pattern).toBe('high-success');
  });

  it('サンプル数が十分でmergeRateが低い組み合わせはlow-successと判定する', () => {
    // 3件中1件merged => mergeRate = 1/3 ≈ 0.333 <= 0.34(LOW_THRESHOLD)
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', reviseCycles: 3, changedLines: 500 }),
      makeRun({ iteration: 2, verdict: 'abandoned', reviseCycles: 3, changedLines: 500 }),
      makeRun({ iteration: 3, verdict: 'abandoned', reviseCycles: 3, changedLines: 500 }),
    ];
    const result = reviseSizeSuccessPatterns(runs);
    expect(result[0].mergeRate).toBeCloseTo(1 / 3, 5);
    expect(result[0].pattern).toBe('low-success');
  });

  it('mergeRateが閾値の間(0.34超〜0.66未満)ならmixedと判定する', () => {
    // 2件merged/2件abandoned => mergeRate = 0.5
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', reviseCycles: 1, changedLines: 200 }),
      makeRun({ iteration: 2, verdict: 'merged', reviseCycles: 1, changedLines: 200 }),
      makeRun({ iteration: 3, verdict: 'abandoned', reviseCycles: 1, changedLines: 200 }),
      makeRun({ iteration: 4, verdict: 'abandoned', reviseCycles: 1, changedLines: 200 }),
    ];
    const result = reviseSizeSuccessPatterns(runs);
    expect(result[0].mergeRate).toBeCloseTo(0.5, 5);
    expect(result[0].pattern).toBe('mixed');
  });
});

describe('reviseCyclesBySizeBucket', () => {
  it('run が無ければ空配列を返す', () => {
    expect(reviseCyclesBySizeBucket([])).toEqual([]);
  });

  it('failed run（changedLines sentinel 0）を除外し、出現した区分だけをsmall→medium→large順で平均・中央値・平均行数付きで返す', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'failed', reviseCycles: 5, changedLines: 0 }),
      // 平均(2)と中央値(0)が一致しない分布で median !== mean を検出できるようにする
      makeRun({ iteration: 2, verdict: 'merged', reviseCycles: 0, changedLines: 10 }),
      makeRun({ iteration: 3, verdict: 'merged', reviseCycles: 0, changedLines: 50 }),
      makeRun({ iteration: 4, verdict: 'merged', reviseCycles: 6, changedLines: 30 }),
      makeRun({ iteration: 5, verdict: 'merged', reviseCycles: 1, changedLines: 150 }),
    ];
    const result = reviseCyclesBySizeBucket(runs);
    expect(result.map((b) => b.sizeBucket)).toEqual(['small', 'medium']);
    expect(result[0]).toMatchObject({ total: 3, avgChangedLines: 30, avgReviseCycles: 2, medianReviseCycles: 0, iterations: [2, 3, 4] });
    expect(result[1]).toMatchObject({ total: 1, avgChangedLines: 150, avgReviseCycles: 1, iterations: [5] });
  });
});

const sizeCurveRuns = (small: number, medium: number, large: number) => [
  ...[1, 2, 3].map((i) => makeRun({ iteration: i, verdict: 'merged', reviseCycles: small, changedLines: 10 })),
  ...[4, 5, 6].map((i) => makeRun({ iteration: i, verdict: 'merged', reviseCycles: medium, changedLines: 200 })),
  ...[7, 8, 9].map((i) => makeRun({ iteration: i, verdict: 'merged', reviseCycles: large, changedLines: 400 })),
];

describe('reviseCyclesSizeCurve', () => {
  it('run が無ければ insufficient-data で傾きは null', () => {
    expect(reviseCyclesSizeCurve([])).toMatchObject({
      buckets: [],
      shape: 'insufficient-data',
      smallToMediumDelta: null,
      mediumToLargeDelta: null,
      accelerationDelta: null,
    });
  });

  it(`いずれかの区分のサンプル数がMIN_SAMPLES(${REVISE_SIZE_CURVE_MIN_SAMPLES})未満なら insufficient-data（3区分は揃っていても）`, () => {
    const runs = [
      ...sizeCurveRuns(0, 1, 0).slice(0, 6),
      makeRun({ iteration: 7, verdict: 'merged', reviseCycles: 4, changedLines: 400 }),
      makeRun({ iteration: 8, verdict: 'merged', reviseCycles: 4, changedLines: 400 }),
    ];
    const signal = reviseCyclesSizeCurve(runs);
    expect(signal.buckets.map((b) => b.sizeBucket)).toEqual(['small', 'medium', 'large']);
    expect(signal.shape).toBe('insufficient-data');
    expect(signal.smallToMediumDelta).toBeNull();
  });

  it.each([
    ['convex', 0, 1, 4, 1, 3, 2],
    ['concave', 0, 3, 4, 3, 1, -2],
    ['linear', 0, 1, 2, 1, 1, 0],
  ] as const)(
    '増分の変化パターンから傾き(delta)を算出し %s と判定する',
    (shape, small, medium, large, smallToMedium, mediumToLarge, acceleration) => {
      const signal = reviseCyclesSizeCurve(sizeCurveRuns(small, medium, large));
      expect(signal.smallToMediumDelta).toBeCloseTo(smallToMedium, 5);
      expect(signal.mediumToLargeDelta).toBeCloseTo(mediumToLarge, 5);
      expect(signal.accelerationDelta).toBeCloseTo(acceleration, 5);
      expect(signal.shape).toBe(shape);
    },
  );

  it(`accelerationDeltaがちょうど${REVISE_SIZE_CURVE_FLAT_THRESHOLD}(閾値と同値)なら境界としてlinearではなくconvex側に倒す`, () => {
    const runs = [
      ...[1, 2, 3, 10, 11, 12].map((i) => makeRun({ iteration: i, verdict: 'merged', reviseCycles: 1, changedLines: 10 })),
      ...[4, 5, 6, 13, 14, 15].map((i) => makeRun({ iteration: i, verdict: 'merged', reviseCycles: 1, changedLines: 200 })),
      // 6件中3件が2、3件が1 => avg = 1.5 (medium比 +0.5)
      ...[7, 8, 9].map((i) => makeRun({ iteration: i, verdict: 'merged', reviseCycles: 2, changedLines: 400 })),
      ...[16, 17, 18].map((i) => makeRun({ iteration: i, verdict: 'merged', reviseCycles: 1, changedLines: 400 })),
    ];
    const signal = reviseCyclesSizeCurve(runs);
    expect(signal.mediumToLargeDelta).toBeCloseTo(0.5, 5);
    expect(signal.accelerationDelta).toBeCloseTo(REVISE_SIZE_CURVE_FLAT_THRESHOLD, 5);
    expect(signal.shape).toBe('convex');
  });
});

describe('modelSkillStratification', () => {
  it('run が0件、またはfailed run（verify未到達）しかなければ空配列を返す', () => {
    expect(modelSkillStratification([])).toEqual([]);
    expect(modelSkillStratification([makeRun({ iteration: 1, verdict: 'failed', reviseCycles: 99 })])).toEqual([]);
  });

  it('モデル別に bucket(0/1/2/3+。境界値: reviseCycles=2は"2"、3は"3+")ごとの成功率とpressureDeltaPctを正確に算出する', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', reviseCycles: 0 }),
      makeRun({ iteration: 2, verdict: 'merged', reviseCycles: 0 }),
      makeRun({ iteration: 3, verdict: 'abandoned', reviseCycles: 3 }),
      makeRun({ iteration: 4, verdict: 'merged', reviseCycles: 3 }),
    ];
    const result = modelSkillStratification(runs);
    expect(result).toHaveLength(1);
    expect(result[0].model).toBe('claude-sonnet-5');
    expect(result[0].totalCount).toBe(4);
    expect(result[0].cells).toEqual([
      { bucket: '0', count: 2, mergedCount: 2, mergeRate: 1, iterations: [1, 2] },
      { bucket: '3+', count: 2, mergedCount: 1, mergeRate: 0.5, iterations: [3, 4] },
    ]);
    // 0回帯100% → 3+帯50% なので pressureDeltaPct = (0.5 - 1) * 100 = -50
    expect(result[0].pressureDeltaPct).toBeCloseTo(-50, 5);
    expect(result[0].verdict).toBe('degrades');
  });

  it(`verdict判定はbucket間の変化幅(MODEL_SKILL_PRESSURE_FLAT_THRESHOLD_PCT=${MODEL_SKILL_PRESSURE_FLAT_THRESHOLD_PCT}pt)を境に resilient/degrades/improves に分岐する`, () => {
    const stratifyPair = (lowVerdict: Verdict, highVerdict: Verdict) =>
      modelSkillStratification([
        makeRun({ iteration: 1, verdict: lowVerdict, reviseCycles: 0 }),
        makeRun({ iteration: 2, verdict: highVerdict, reviseCycles: 4 }),
      ])[0];

    const flat = stratifyPair('merged', 'merged');
    expect(flat.pressureDeltaPct).toBeCloseTo(0, 5);
    expect(flat.verdict).toBe('resilient');

    const declining = stratifyPair('merged', 'abandoned');
    expect(declining.pressureDeltaPct).toBeCloseTo(-100, 5);
    expect(declining.verdict).toBe('degrades');

    const rising = stratifyPair('abandoned', 'merged');
    expect(rising.pressureDeltaPct).toBeCloseTo(100, 5);
    expect(rising.verdict).toBe('improves');
  });

  it('観測できた bucket が1種類だけなら pressureDeltaPct は null、verdict は insufficient-data', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', reviseCycles: 0 }),
      makeRun({ iteration: 2, verdict: 'abandoned', reviseCycles: 0 }),
    ];
    const result = modelSkillStratification(runs);
    expect(result[0].pressureDeltaPct).toBeNull();
    expect(result[0].verdict).toBe('insufficient-data');
  });

  it('モデルを totalCount 降順、同数はモデル名昇順で並べる', () => {
    const models = (n: string) => ({ builder: n, adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' });
    const runs = [
      makeRun({ iteration: 1, models: models('b-model') }),
      makeRun({ iteration: 2, models: models('a-model') }),
      makeRun({ iteration: 3, models: models('a-model') }),
    ];
    const result = modelSkillStratification(runs);
    expect(result.map((r) => r.model)).toEqual(['a-model', 'b-model']);
  });
});

describe('approvedButBuilderFailedIterations', () => {
  it('空配列は空配列を返す（境界値）', () => {
    expect(approvedButBuilderFailedIterations([])).toEqual([]);
  });

  it('approve済みなのに builder が変更を生成しなかった反復を noChanges として検知する', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'abandoned',
        gateReasons: ['builder が変更を生成しなかった'],
        adversary: { approved: true, summary: '' },
      }),
    ];
    const result = approvedButBuilderFailedIterations(runs);
    expect(result).toHaveLength(1);
    expect(result[0].iteration).toBe(1);
    expect(result[0].categories).toEqual(['noChanges']);
  });

  it('approve済みなのに e2e が失敗した反復を e2eFailed として検知する（needs-human でも対象になる）', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'needs-human',
        gateReasons: ['e2e(Playwright) が失敗している'],
        adversary: { approved: true, summary: '' },
      }),
    ];
    const result = approvedButBuilderFailedIterations(runs);
    expect(result[0].categories).toEqual(['e2eFailed']);
  });

  it('1反復が複数の builder 側理由を持つ場合、全カテゴリを保持する', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'needs-human',
        gateReasons: ['verify(lint/typecheck/unit/build) が失敗している', '変更行数 500 が上限 400 を超えている'],
        adversary: { approved: true, summary: '' },
      }),
    ];
    const result = approvedButBuilderFailedIterations(runs);
    expect(result[0].categories).toEqual(['verifyFailed', 'changedLinesExceeded']);
  });

  it('verdict が merged の反復は対象外（承認どおりにマージできているため）', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'merged',
        gateReasons: [],
        adversary: { approved: true, summary: '' },
      }),
    ];
    expect(approvedButBuilderFailedIterations(runs)).toEqual([]);
  });

  it('adversary が approve していない反復は対象外（却下理由の分析は別パネルの領分）', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'abandoned',
        gateReasons: ['adversary が approve していない'],
        adversary: { approved: false, summary: '要件不適合' },
      }),
    ];
    expect(approvedButBuilderFailedIterations(runs)).toEqual([]);
  });

  it('paused/dry-run のようにゲート自体は通過し gateReasons が空の反復は対象外', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'paused',
        gateReasons: [],
        adversary: { approved: true, summary: '' },
      }),
      makeRun({
        iteration: 2,
        verdict: 'dry-run',
        gateReasons: [],
        adversary: { approved: true, summary: '' },
      }),
    ];
    expect(approvedButBuilderFailedIterations(runs)).toEqual([]);
  });

  it('approved=true なのに adversary側カテゴリしか無い不整合データは防御的に除外する', () => {
    // 本来 approved=true では出現しないはずの理由文字列が混入した異常データを想定。
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'abandoned',
        gateReasons: ['adversary が approve していない'],
        adversary: { approved: true, summary: '' },
      }),
    ];
    expect(approvedButBuilderFailedIterations(runs)).toEqual([]);
  });

  it('新しい反復から順に並ぶ', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'abandoned',
        gateReasons: ['builder が変更を生成しなかった'],
        adversary: { approved: true, summary: '' },
      }),
      makeRun({
        iteration: 5,
        verdict: 'abandoned',
        gateReasons: ['builder が変更を生成しなかった'],
        adversary: { approved: true, summary: '' },
      }),
      makeRun({
        iteration: 3,
        verdict: 'abandoned',
        gateReasons: ['builder が変更を生成しなかった'],
        adversary: { approved: true, summary: '' },
      }),
    ];
    const result = approvedButBuilderFailedIterations(runs);
    expect(result.map((d) => d.iteration)).toEqual([5, 3, 1]);
  });
});

describe('approvedButBuilderFailedSummary', () => {
  it('空配列でもゼロ値を返す（境界値）', () => {
    const s = approvedButBuilderFailedSummary([]);
    expect(s).toEqual({
      count: 0,
      approvedCount: 0,
      ratePct: 0,
      totalCostUsd: 0,
      topCategory: null,
      topCategoryCount: 0,
    });
  });

  it('approvedCount は verdict を問わず approve された全反復数を分母にする', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', adversary: { approved: true, summary: '' } }),
      makeRun({ iteration: 2, verdict: 'merged', adversary: { approved: true, summary: '' } }),
      makeRun({
        iteration: 3,
        verdict: 'abandoned',
        gateReasons: ['builder が変更を生成しなかった'],
        adversary: { approved: true, summary: '' },
        cost: { builderUsd: 1, adversaryUsd: 0.1, ideationUsd: 0, totalUsd: 1.1 },
      }),
    ];
    const s = approvedButBuilderFailedSummary(runs);
    expect(s.count).toBe(1);
    expect(s.approvedCount).toBe(3);
    expect(s.ratePct).toBeCloseTo((1 / 3) * 100, 5);
    expect(s.totalCostUsd).toBeCloseTo(1.1, 5);
    expect(s.topCategory).toBe('noChanges');
    expect(s.topCategoryCount).toBe(1);
  });

  it('最多カテゴリは件数降順、同数なら GATE_REASON_CATEGORY_ORDER の並び順で決まる', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'needs-human',
        gateReasons: ['builder が変更を生成しなかった'],
        adversary: { approved: true, summary: '' },
      }),
      makeRun({
        iteration: 2,
        verdict: 'needs-human',
        gateReasons: ['e2e(Playwright) が失敗している'],
        adversary: { approved: true, summary: '' },
      }),
    ];
    // noChanges と e2eFailed が同数(1件)。GATE_REASON_CATEGORY_ORDER では e2eFailed が先。
    const s = approvedButBuilderFailedSummary(runs);
    expect(s.topCategory).toBe('e2eFailed');
    expect(s.topCategoryCount).toBe(1);
  });
});
