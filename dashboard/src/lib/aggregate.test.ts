import { describe, it, expect } from 'vitest';
import { summarize, coverageTrend, costTrend } from './aggregate';
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
    expect(s.totalCostUsd).toBe(0);
    expect(s.latestCoveragePct).toBe(0);
    expect(s.latestCoverageIteration).toBe(0);
    expect(s.latestCoverageStale).toBe(false);
    expect(s.latestDurationSec).toBe(0);
    expect(s.latestDurationIteration).toBe(0);
    expect(s.breakerStreak).toBe(0);
    expect(s.breakerThreshold).toBe(3);
    expect(s.breakerRemaining).toBe(3);
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
