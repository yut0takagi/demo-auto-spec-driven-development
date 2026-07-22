import type { RunRecord, Verdict } from './types';

/**
 * ブレーカを連続させる verdict の集合（orchestrator/gates.py の should_trip_breaker が
 * 連続失敗として数える verdict と同じ）。merged はもちろん、paused / dry-run のような
 * 意図的な非マージも連続を途切れさせる（この集合に含まれない）。
 */
const BREAKER_TRIP_VERDICTS: readonly Verdict[] = ['failed', 'abandoned', 'needs-human'];

/**
 * orchestrator/config.py の circuit_breaker_fails 既定値(3)に合わせた表示用の閾値。
 * 実際に発火させる値は orchestrator 側の CIRCUIT_BREAKER_FAILS 環境変数で変わりうるが、
 * dashboard は Python 設定を読めないため既定値を表示用の目安として使う。
 */
const BREAKER_THRESHOLD = 3;

/** これを超える reviseCycles を外れ値として扱う表示用の閾値。 */
export const REVISE_CYCLES_OUTLIER_THRESHOLD = 3;

export interface Summary {
  totalRuns: number;
  mergedRuns: number;
  /** adversary が approve した割合 0..1。分母は verify に到達した run のみ（crashed run を除く） */
  approvalRate: number;
  /** develop にマージされた割合 0..1 */
  mergeRate: number;
  avgCycleTimeSec: number;
  avgReviseCycles: number;
  /** revise 回数の中央値。外れ値（極端に多い revise）に平均より引きずられない指標。 */
  medianReviseCycles: number;
  totalCostUsd: number;
  /**
   * verify に到達した最新 iteration のカバレッジ。`failed` run は verify に
   * 到達しておらず測定していないため、その場合は 1 つ前の測定済み iteration
   * までフォールバックする（＝最新 iteration の値ではないことがある）。
   */
  latestCoveragePct: number;
  /** latestCoveragePct がどの iteration の測定値か */
  latestCoverageIteration: number;
  /** true なら latestCoveragePct が最新 iteration ではなく、それ以前の測定値である */
  latestCoverageStale: boolean;
  /**
   * 直近 iteration の所要時間（秒）。
   *
   * latestCoveragePct とは異なり stale フォールバックが存在しない: durationSec は
   * verdict（merged/failed 等）に関係なく全 run で必ず記録されるため、
   * 常に最新 iteration（0005.json のような failed run を含む）の値をそのまま採用する。
   */
  latestDurationSec: number;
  /** latestDurationSec の対象 iteration。フォールバックしないので常に最新 iteration と一致する */
  latestDurationIteration: number;
  /**
   * サーキットブレーカ（orchestrator/gates.py の should_trip_breaker）が見ている
   * 「直近の連続非マージ数」。最新 iteration から遡り、failed / needs-human が
   * 連続している数。paused / dry-run や merged に当たるとそこで途切れる。
   */
  breakerStreak: number;
  /** breakerStreak がこの値に達するとブレーカが発火する（表示用の目安。既定値3） */
  breakerThreshold: number;
  /** 発火まで残り何回連続で非マージが続けられるか（0 なら次の非マージで発火） */
  breakerRemaining: number;
}

/**
 * 最新 iteration から遡って、failed / needs-human が何回連続しているかを数える。
 * merged / paused / dry-run に当たった時点で連続は途切れる。
 */
function breakerStreak(sortedAsc: RunRecord[]): number {
  let streak = 0;
  for (let i = sortedAsc.length - 1; i >= 0; i--) {
    if (!BREAKER_TRIP_VERDICTS.includes(sortedAsc[i].verdict)) break;
    streak++;
  }
  return streak;
}

export interface TrendPoint {
  iteration: number;
  value: number;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * 中央値。奇数/偶数で分岐せず、常に「中央2要素（奇数個なら同じ要素を2回）の平均」
 * という単一の式で求める。分岐による添字ずれ（off-by-one）を構造的に排除するため。
 * 例: [1,2,3] → lastIndex=2, lower=upper=1 → sorted[1] を2回平均 = 2（sorted[1]と一致）。
 */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const lastIndex = sorted.length - 1;
  const lower = Math.floor(lastIndex / 2);
  const upper = Math.ceil(lastIndex / 2);
  return (sorted[lower] + sorted[upper]) / 2;
}

function byIterationAsc(runs: RunRecord[]): RunRecord[] {
  return [...runs].sort((a, b) => a.iteration - b.iteration);
}

/**
 * その run が実際に verify まで到達したか。
 * `failed` は例外で異常終了しており、coveragePct や durationSec が
 * 「測定されなかった」ことを意味する 0 なので、平均や最新値の母集団から外す。
 */
function reachedVerify(run: RunRecord): boolean {
  return run.verdict !== 'failed';
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
      medianReviseCycles: 0,
      totalCostUsd: 0,
      latestCoveragePct: 0,
      latestCoverageIteration: 0,
      latestCoverageStale: false,
      latestDurationSec: 0,
      latestDurationIteration: 0,
      breakerStreak: 0,
      breakerThreshold: BREAKER_THRESHOLD,
      breakerRemaining: BREAKER_THRESHOLD,
    };
  }

  const sorted = byIterationAsc(runs);
  const latest = sorted[sorted.length - 1];
  const completed = sorted.filter(reachedVerify);
  const latestMeasured = completed.length > 0 ? completed[completed.length - 1] : latest;
  const mergedRuns = runs.filter((r) => r.verdict === 'merged').length;
  const approvedRuns = completed.filter((r) => r.adversary.approved).length;
  const streak = breakerStreak(sorted);

  return {
    totalRuns: runs.length,
    mergedRuns,
    approvalRate: completed.length === 0 ? 0 : approvedRuns / completed.length,
    mergeRate: mergedRuns / runs.length,
    avgCycleTimeSec: mean(completed.map((r) => r.durationSec)),
    avgReviseCycles: mean(completed.map((r) => r.reviseCycles)),
    medianReviseCycles: reviseCyclesMedian(runs),
    totalCostUsd: runs.reduce((sum, r) => sum + r.cost.totalUsd, 0),
    latestCoveragePct: latestMeasured.verify.coveragePct,
    latestCoverageIteration: latestMeasured.iteration,
    latestCoverageStale: latestMeasured.iteration !== latest.iteration,
    latestDurationSec: latest.durationSec,
    latestDurationIteration: latest.iteration,
    breakerStreak: streak,
    breakerThreshold: BREAKER_THRESHOLD,
    breakerRemaining: Math.max(0, BREAKER_THRESHOLD - streak),
  };
}

/**
 * カバレッジ推移。`failed` run は coveragePct を測定していない（sentinel 0）ため
 * 点として含めない。含めると最新点が 0 に急落し、同じページの MetricCards
 * （measured な最新値を表示）と矛盾した「カバレッジ崩壊」に見える。
 * コストは失敗でも実際に消費されるので costTrend は全 run を含む（対称ではない）。
 */
export function coverageTrend(runs: RunRecord[]): TrendPoint[] {
  return byIterationAsc(runs)
    .filter(reachedVerify)
    .map((r) => ({
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

/**
 * revise 回数の推移。coverageTrend と同様、verify に到達しなかった `failed` run は
 * 「途中でクラッシュするまでの revise 回数」であり他の run と意味が異なるため除外する
 * （avgReviseCycles / medianReviseCycles の母集団と揃える）。
 */
export function reviseCyclesTrend(runs: RunRecord[]): TrendPoint[] {
  return byIterationAsc(runs)
    .filter(reachedVerify)
    .map((r) => ({
      iteration: r.iteration,
      value: r.reviseCycles,
    }));
}

/** reviseCyclesTrend のうち、REVISE_CYCLES_OUTLIER_THRESHOLD を超える外れ値だけを抜き出す。 */
export function reviseCyclesOutliers(runs: RunRecord[]): TrendPoint[] {
  return reviseCyclesTrend(runs).filter((p) => p.value > REVISE_CYCLES_OUTLIER_THRESHOLD);
}

/** Summary.medianReviseCycles と同じ計算を、summarize() 抜きで単体利用するための関数。 */
export function reviseCyclesMedian(runs: RunRecord[]): number {
  return median(reviseCyclesTrend(runs).map((p) => p.value));
}

/**
 * 承認率の累積推移（0..100）。iteration 昇順に見て、その時点までの
 * 「verify に到達した run のうち adversary が approve した割合」を各点に持つ。
 * Summary.approvalRate と同じ母集団定義（reachedVerify）を使うので、最終点は
 * summarize(runs).approvalRate * 100 と一致する。failed run は verify に到達して
 * いないため coverageTrend / reviseCyclesTrend と同様に点を持たない。
 */
export function approvalRateTrend(runs: RunRecord[]): TrendPoint[] {
  const completed = byIterationAsc(runs).filter(reachedVerify);
  let approvedCount = 0;
  return completed.map((r, i) => {
    if (r.adversary.approved) approvedCount++;
    return { iteration: r.iteration, value: (approvedCount / (i + 1)) * 100 };
  });
}

/**
 * マージ率の累積推移（0..100）。Summary.mergeRate と同じ母集団定義（全 run）を
 * 使うので、最終点は summarize(runs).mergeRate * 100 と一致する。costTrend と同様、
 * verdict はどの run にも必ず記録されているため failed run も点として含める。
 */
export function mergeRateTrend(runs: RunRecord[]): TrendPoint[] {
  const sorted = byIterationAsc(runs);
  let mergedCount = 0;
  return sorted.map((r, i) => {
    if (r.verdict === 'merged') mergedCount++;
    return { iteration: r.iteration, value: (mergedCount / (i + 1)) * 100 };
  });
}
