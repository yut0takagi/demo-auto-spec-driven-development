import type { RunRecord } from './types';

export interface Summary {
  totalRuns: number;
  mergedRuns: number;
  /** adversary が approve した割合 0..1 */
  approvalRate: number;
  /** develop にマージされた割合 0..1 */
  mergeRate: number;
  avgCycleTimeSec: number;
  avgReviseCycles: number;
  totalCostUsd: number;
  /** 最新 iteration のカバレッジ */
  latestCoveragePct: number;
}

export interface TrendPoint {
  iteration: number;
  value: number;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function byIterationAsc(runs: RunRecord[]): RunRecord[] {
  return [...runs].sort((a, b) => a.iteration - b.iteration);
}

export function summarize(runs: RunRecord[]): Summary {
  if (runs.length === 0) {
    return {
      totalRuns: 0,
      mergedRuns: 0,
      approvalRate: 0,
      mergeRate: 0,
      avgCycleTimeSec: 0,
      avgReviseCycles: 0,
      totalCostUsd: 0,
      latestCoveragePct: 0,
    };
  }

  const sorted = byIterationAsc(runs);
  const latest = sorted[sorted.length - 1];
  const mergedRuns = runs.filter((r) => r.verdict === 'merged').length;
  const approvedRuns = runs.filter((r) => r.adversary.approved).length;

  return {
    totalRuns: runs.length,
    mergedRuns,
    approvalRate: approvedRuns / runs.length,
    mergeRate: mergedRuns / runs.length,
    avgCycleTimeSec: mean(runs.map((r) => r.durationSec)),
    avgReviseCycles: mean(runs.map((r) => r.reviseCycles)),
    totalCostUsd: runs.reduce((sum, r) => sum + r.cost.totalUsd, 0),
    latestCoveragePct: latest.verify.coveragePct,
  };
}

export function coverageTrend(runs: RunRecord[]): TrendPoint[] {
  return byIterationAsc(runs).map((r) => ({
    iteration: r.iteration,
    value: r.verify.coveragePct,
  }));
}

export function costTrend(runs: RunRecord[]): TrendPoint[] {
  let cumulative = 0;
  return byIterationAsc(runs).map((r) => {
    cumulative += r.cost.totalUsd;
    return { iteration: r.iteration, value: cumulative };
  });
}
