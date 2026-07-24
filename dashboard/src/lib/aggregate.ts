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
  /** e2e が失敗した割合 0..1。分母は approvalRate と同じ verify に到達した run のみ */
  e2eFailureRate: number;
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

export interface BreakerRunway {
  /** 直近の連続非マージ数（Summary.breakerStreak と同じ定義） */
  streak: number;
  /** これに達するとブレーカが発火する（表示用の目安。既定値3） */
  threshold: number;
  /** 発火まで残り何回連続で非マージが続けられるか（0 なら次の非マージで発火） */
  remaining: number;
  /** streak が threshold 以上（発火条件が既に成立している） */
  tripped: boolean;
  /** 現在の連続に含まれる反復番号（古い→新しい順） */
  iterations: number[];
}

/**
 * サーキットブレーカ発火までの「残反復数」を可視化するための集計。
 * Summary.breakerStreak/breakerThreshold/breakerRemaining と同じ値を、
 * 対象 iteration の一覧・発火済みフラグ込みで返す（BreakerRunwayPanel 専用）。
 */
export function breakerRunway(runs: RunRecord[]): BreakerRunway {
  const sorted = byIterationAsc(runs);
  const streak = breakerStreak(sorted);
  const iterations = sorted.slice(sorted.length - streak).map((r) => r.iteration);
  return {
    streak,
    threshold: BREAKER_THRESHOLD,
    remaining: Math.max(0, BREAKER_THRESHOLD - streak),
    tripped: streak >= BREAKER_THRESHOLD,
    iterations,
  };
}

export interface MergedStreak {
  /** 最新 iteration から遡って merged が連続している数（breakerStreak と同じトレイリング定義）。merged 以外に当たると途切れる。 */
  current: number;
  /** 過去全体で最長だった連続 merged 数。現在進行中の streak が最長を更新中ならそれも含む。 */
  longest: number;
  /** longest を記録した区間の反復番号（古い→新しい順）。複数区間が同じ長さで並ぶ場合は最初に出現した区間を採用する。 */
  longestIterations: number[];
  /** current 分の反復番号（古い→新しい順） */
  currentIterations: number[];
  /** current が 0 より大きく、かつ longest と等しい（＝現在の連続が過去最長に並んでいる/更新中） */
  isRecord: boolean;
}

/**
 * 連続成功（merged）ストリーク。breakerStreak/breakerRunway が「連続非マージ」を数えて
 * サーキットブレーカへの近さを見るのに対し、こちらは逆にループが連続でマージへ成功して
 * いる区間を数える。current は最新 iteration から遡った連続 merged 数、longest は
 * data/runs 全期間で最長だった連続 merged 区間（現在の streak が過去最長を更新中の場合は
 * current と一致する）。
 */
export function mergedStreak(runs: RunRecord[]): MergedStreak {
  const sorted = byIterationAsc(runs);

  let longest = 0;
  let longestStartIdx = 0;
  let runStartIdx = 0;
  let runLength = 0;

  sorted.forEach((run, i) => {
    if (run.verdict === 'merged') {
      if (runLength === 0) runStartIdx = i;
      runLength++;
      if (runLength > longest) {
        longest = runLength;
        longestStartIdx = runStartIdx;
      }
    } else {
      runLength = 0;
    }
  });

  let current = 0;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].verdict !== 'merged') break;
    current++;
  }

  return {
    current,
    longest,
    longestIterations:
      longest === 0 ? [] : sorted.slice(longestStartIdx, longestStartIdx + longest).map((r) => r.iteration),
    currentIterations: current === 0 ? [] : sorted.slice(sorted.length - current).map((r) => r.iteration),
    isRecord: current > 0 && current === longest,
  };
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
      e2eFailureRate: 0,
    };
  }

  const sorted = byIterationAsc(runs);
  const latest = sorted[sorted.length - 1];
  const completed = sorted.filter(reachedVerify);
  const latestMeasured = completed.length > 0 ? completed[completed.length - 1] : latest;
  const mergedRuns = runs.filter((r) => r.verdict === 'merged').length;
  const approvedRuns = completed.filter((r) => r.adversary.approved).length;
  const e2eFailedRuns = completed.filter((r) => !r.verify.e2ePassed).length;
  const streak = breakerStreak(sorted);

  return {
    totalRuns: runs.length,
    mergedRuns,
    approvalRate: completed.length === 0 ? 0 : approvedRuns / completed.length,
    mergeRate: mergedRuns / runs.length,
    e2eFailureRate: completed.length === 0 ? 0 : e2eFailedRuns / completed.length,
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

/**
 * E2E テスト失敗率の累積推移（0..100）。iteration 昇順に見て、その時点までの
 * 「verify に到達した run のうち e2e が失敗した割合」を各点に持つ。
 * approvalRateTrend と同じ母集団定義（reachedVerify）を使う: `failed` run の
 * `verify.e2ePassed` は「実際に測定して落ちた」のではなく verify に到達できな
 * かったための sentinel（false）なので、他の推移と同様に点を持たせない。
 * Summary.e2eFailureRate と同じ母集団定義なので、最終点は
 * summarize(runs).e2eFailureRate * 100 と一致する。
 */
export function e2eFailureRateTrend(runs: RunRecord[]): TrendPoint[] {
  const completed = byIterationAsc(runs).filter(reachedVerify);
  let failedCount = 0;
  return completed.map((r, i) => {
    if (!r.verify.e2ePassed) failedCount++;
    return { iteration: r.iteration, value: (failedCount / (i + 1)) * 100 };
  });
}

/**
 * 変更行数の推移。coverageTrend / reviseCyclesTrend と同様、`failed` run は
 * builder がコミットに到達する前に例外終了しており changedLines が「測定されなかった」
 * ことを意味する sentinel 0 なので、点として含めない（0への急落に見せない）。
 */
export function changedLinesTrend(runs: RunRecord[]): TrendPoint[] {
  return byIterationAsc(runs)
    .filter(reachedVerify)
    .map((r) => ({
      iteration: r.iteration,
      value: r.changedLines,
    }));
}

/**
 * サイクルタイム(durationSec)の時系列推移。costTrend と同様、durationSec は verdict に
 * 関係なく全 run で必ず記録される（failed run も例外終了までの経過時間として意味を持つ）
 * ため reachedVerify では絞り込まない。値は秒単位（表示側で分に換算する）。
 */
export function cycleTimeTrend(runs: RunRecord[]): TrendPoint[] {
  return byIterationAsc(runs).map((r) => ({ iteration: r.iteration, value: r.durationSec }));
}

/** トレンド判定に使う直近/直前ウィンドウの反復数（既定値）。 */
export const CYCLE_TIME_TREND_WINDOW = 3;
/**
 * 直近ウィンドウの平均が直前ウィンドウよりこの割合(%)以上変化して初めて
 * 増加/減少と判定する。これ未満のブレは「横ばい」として扱い、僅かな変動を
 * トレンドと誤認しないようにする。
 */
export const CYCLE_TIME_TREND_FLAT_THRESHOLD_PCT = 5;

/** increasing: ゲート通過までの所要時間が悪化（長期化）傾向。decreasing: 改善（短縮）傾向。 */
export type CycleTimeTrendDirection = 'increasing' | 'decreasing' | 'flat';

export interface CycleTimeTrendSignal {
  /** 実際に比較に使ったウィンドウ幅（データが少ない場合は CYCLE_TIME_TREND_WINDOW 未満になりうる） */
  windowSize: number;
  /** windowSize が CYCLE_TIME_TREND_WINDOW に満たない（信頼度が低い）かどうか */
  partial: boolean;
  recentAvgSec: number;
  previousAvgSec: number;
  /** recentAvgSec - previousAvgSec */
  deltaSec: number;
  /** deltaSec / previousAvgSec * 100。previousAvgSec が 0 のときは定義できないため null */
  deltaPct: number | null;
  direction: CycleTimeTrendDirection;
  /** 直近ウィンドウに含まれる反復番号（昇順） */
  recentIterations: number[];
  /** 直前ウィンドウに含まれる反復番号（昇順） */
  previousIterations: number[];
}

function cycleTimeDirection(deltaSec: number, previousAvgSec: number): CycleTimeTrendDirection {
  if (previousAvgSec === 0) return deltaSec === 0 ? 'flat' : 'increasing';
  const deltaPct = (deltaSec / previousAvgSec) * 100;
  if (Math.abs(deltaPct) < CYCLE_TIME_TREND_FLAT_THRESHOLD_PCT) return 'flat';
  return deltaPct > 0 ? 'increasing' : 'decreasing';
}

/**
 * CI/ゲート通過までの所要時間（durationSec）のトレンド観測。直近 window 反復の平均と、
 * その直前 window 反復の平均を比較し、増加(悪化)/減少(改善)/横ばいを判定する
 * （EarlyWarningSignal と同様、ローリング窓による前兆検知の一種）。
 * cycleTimeTrend と同じ理由で reachedVerify では絞り込まない。
 * 比較対象となる「直前」ウィンドウが取れない（run が1件以下）場合は null。
 */
export function cycleTimeTrendSignal(runs: RunRecord[]): CycleTimeTrendSignal | null {
  const sorted = byIterationAsc(runs);
  if (sorted.length < 2) return null;

  const windowSize = Math.min(CYCLE_TIME_TREND_WINDOW, Math.floor(sorted.length / 2));
  const recent = sorted.slice(sorted.length - windowSize);
  const previous = sorted.slice(sorted.length - windowSize * 2, sorted.length - windowSize);

  const recentAvgSec = mean(recent.map((r) => r.durationSec));
  const previousAvgSec = mean(previous.map((r) => r.durationSec));
  const deltaSec = recentAvgSec - previousAvgSec;

  return {
    windowSize,
    partial: windowSize < CYCLE_TIME_TREND_WINDOW,
    recentAvgSec,
    previousAvgSec,
    deltaSec,
    deltaPct: previousAvgSec === 0 ? null : (deltaSec / previousAvgSec) * 100,
    direction: cycleTimeDirection(deltaSec, previousAvgSec),
    recentIterations: recent.map((r) => r.iteration),
    previousIterations: previous.map((r) => r.iteration),
  };
}

/**
 * issue開始(startedAt)から初PR作成までの所要時間の時系列推移。RunRecord は PR が実際に
 * 開かれた時刻を個別に記録していないため、durationSec（issue開始〜反復完了）を近似値
 * として使う（cycleTimeTrend と値の出処は同じ）。cycleTimeTrend との違いは母集団: こちらは
 * 実際にPRが作られた反復（prNumber !== null）だけを対象にする。PRを一度も開けなかった
 * 反復（例: builder が変更を生成しなかった abandoned、verify到達前に例外終了した failed）は
 * 「PR作成までの時間」という定義そのものが存在しないため含めない。
 */
export function timeToFirstPrTrend(runs: RunRecord[]): TrendPoint[] {
  return byIterationAsc(runs)
    .filter((r) => r.prNumber !== null)
    .map((r) => ({ iteration: r.iteration, value: r.durationSec }));
}

/** トレンド判定に使う直近/直前ウィンドウの反復数（既定値）。cycleTimeTrendSignal と揃えている。 */
export const TIME_TO_FIRST_PR_TREND_WINDOW = 3;
/**
 * 直近ウィンドウの平均が直前ウィンドウよりこの割合(%)以上変化して初めて
 * 増加/減少と判定する。cycleTimeTrendSignal と同じ閾値・考え方。
 */
export const TIME_TO_FIRST_PR_TREND_FLAT_THRESHOLD_PCT = 5;

/** increasing: 初PR作成までの時間が悪化(長期化)傾向。decreasing: 改善(短縮)傾向。 */
export type TimeToFirstPrTrendDirection = 'increasing' | 'decreasing' | 'flat';

export interface TimeToFirstPrTrendSignal {
  /** 実際に比較に使ったウィンドウ幅（データが少ない場合は TIME_TO_FIRST_PR_TREND_WINDOW 未満になりうる） */
  windowSize: number;
  /** windowSize が TIME_TO_FIRST_PR_TREND_WINDOW に満たない（信頼度が低い）かどうか */
  partial: boolean;
  recentAvgSec: number;
  previousAvgSec: number;
  /** recentAvgSec - previousAvgSec */
  deltaSec: number;
  /** deltaSec / previousAvgSec * 100。previousAvgSec が 0 のときは定義できないため null */
  deltaPct: number | null;
  direction: TimeToFirstPrTrendDirection;
  /** 直近ウィンドウに含まれる反復番号（昇順） */
  recentIterations: number[];
  /** 直前ウィンドウに含まれる反復番号（昇順） */
  previousIterations: number[];
}

function timeToFirstPrDirection(deltaSec: number, previousAvgSec: number): TimeToFirstPrTrendDirection {
  if (previousAvgSec === 0) return deltaSec === 0 ? 'flat' : 'increasing';
  const deltaPct = (deltaSec / previousAvgSec) * 100;
  if (Math.abs(deltaPct) < TIME_TO_FIRST_PR_TREND_FLAT_THRESHOLD_PCT) return 'flat';
  return deltaPct > 0 ? 'increasing' : 'decreasing';
}

/**
 * issue開始から初PR作成までの所要時間のトレンド観測。cycleTimeTrendSignal と同じ
 * ローリング窓比較（直近window反復の平均 vs 直前window反復の平均）を、timeToFirstPrTrend
 * と同じ母集団（PRが実際に作られた反復のみ）に対して行う。比較対象となる「直前」
 * ウィンドウが取れない（対象点が1件以下）場合は null。
 */
export function timeToFirstPrTrendSignal(runs: RunRecord[]): TimeToFirstPrTrendSignal | null {
  const points = timeToFirstPrTrend(runs);
  if (points.length < 2) return null;

  const windowSize = Math.min(TIME_TO_FIRST_PR_TREND_WINDOW, Math.floor(points.length / 2));
  const recent = points.slice(points.length - windowSize);
  const previous = points.slice(points.length - windowSize * 2, points.length - windowSize);

  const recentAvgSec = mean(recent.map((p) => p.value));
  const previousAvgSec = mean(previous.map((p) => p.value));
  const deltaSec = recentAvgSec - previousAvgSec;

  return {
    windowSize,
    partial: windowSize < TIME_TO_FIRST_PR_TREND_WINDOW,
    recentAvgSec,
    previousAvgSec,
    deltaSec,
    deltaPct: previousAvgSec === 0 ? null : (deltaSec / previousAvgSec) * 100,
    direction: timeToFirstPrDirection(deltaSec, previousAvgSec),
    recentIterations: recent.map((p) => p.iteration),
    previousIterations: previous.map((p) => p.iteration),
  };
}

/**
 * 直近ウィンドウ平均が直前ウィンドウ平均よりこの割合(%)以上長くなって初めて
 * 「逆転（悪化）」とみなす閾値。ノイズ的な微増を逆転として誤検知しないための下限。
 * timeToFirstPrTrendSignal 等と同じ考え方・同じ値。
 */
export const LEAD_TIME_INVERSION_THRESHOLD_PCT = 5;

/**
 * PRが実際に作られた反復同士を iteration 昇順で隣接比較したときに、直後の反復の方が
 * 所要時間(durationSec、= timeToFirstPrTrend の値)が悪化(TREND_THRESHOLD_PCT 以上増加)
 * している箇所。「本来なら安定/短縮していくはずのリードタイムが、隣り合う反復間で
 * 逆転して長期化した」ことを表す1件分の記録。
 */
export interface LeadTimeInversion {
  /** 逆転が観測された側（後）の反復番号 */
  iteration: number;
  /** 比較元（前）の反復番号。timeToFirstPrTrend の母集団のみを対象にするため iteration との差が2以上になりうる */
  previousIteration: number;
  /** iteration 側の所要時間(秒) */
  value: number;
  /** previousIteration 側の所要時間(秒) */
  previousValue: number;
  /** value - previousValue（逆転なので必ず正） */
  deltaSec: number;
  /** deltaSec / previousValue * 100。previousValue が 0 のときは定義できないため null */
  deltaPct: number | null;
}

function isLeadTimeInversion(deltaSec: number, previousValue: number): boolean {
  if (previousValue === 0) return deltaSec > 0;
  return (deltaSec / previousValue) * 100 >= LEAD_TIME_INVERSION_THRESHOLD_PCT;
}

/**
 * timeToFirstPrTrend の点列（PRが実際に作られた反復のみ、iteration昇順）を隣接ペアで
 * 走査し、リードタイムが逆転(悪化)した箇所を全て抽出する。cycleTimeTrendSignal 等の
 * 「直近window vs 直前window」というブロック単位の比較とは異なり、こちらは隣接1件ずつの
 * 局所的な逆転を漏れなく検出する（ブロック平均では相殺されてしまう単発の逆転も拾える）。
 */
export function leadTimeInversions(runs: RunRecord[]): LeadTimeInversion[] {
  const points = timeToFirstPrTrend(runs);
  const inversions: LeadTimeInversion[] = [];
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    const deltaSec = cur.value - prev.value;
    if (isLeadTimeInversion(deltaSec, prev.value)) {
      inversions.push({
        iteration: cur.iteration,
        previousIteration: prev.iteration,
        value: cur.value,
        previousValue: prev.value,
        deltaSec,
        deltaPct: prev.value === 0 ? null : (deltaSec / prev.value) * 100,
      });
    }
  }
  return inversions;
}

/** 何回連続でリードタイムが逆転したら「Builder稼働率低下」として発報するか。 */
export const BUILDER_UTILIZATION_DECLINE_STREAK_THRESHOLD = 2;

export interface BuilderUtilizationDeclineSignal {
  /** データ終端まで連続で逆転が続いている回数（0ならデータ終端は逆転していない） */
  streak: number;
  /** streak >= BUILDER_UTILIZATION_DECLINE_STREAK_THRESHOLD */
  triggered: boolean;
  /** streak 分の逆転記録（iteration昇順） */
  streakInversions: LeadTimeInversion[];
  /** 全期間で観測された逆転の総数 */
  totalInversions: number;
  /** 全期間で比較した隣接ペアの総数（= timeToFirstPrTrend の点数 - 1） */
  totalComparisons: number;
  /** totalInversions / totalComparisons * 100。totalComparisons が 0 のときは null */
  inversionRatePct: number | null;
}

/**
 * Builder稼働率低下検知: 反復開始からPR作成までのリードタイムが、データ終端に向けて
 * 連続で逆転(悪化)し続けているかを判定する。1〜2回程度の単発の逆転はノイズとして
 * 許容し、BUILDER_UTILIZATION_DECLINE_STREAK_THRESHOLD 回以上連続して初めて
 * 「Builderの処理能力が継続的に落ちている（稼働率低下）」という強いシグナルとして扱う。
 * 比較対象となる隣接ペアが1組も無い（PR作成反復が1件以下）場合は null。
 */
export function builderUtilizationDeclineSignal(runs: RunRecord[]): BuilderUtilizationDeclineSignal | null {
  const points = timeToFirstPrTrend(runs);
  if (points.length < 2) return null;

  const inversions = leadTimeInversions(runs);
  const inversionIterations = new Set(inversions.map((inv) => inv.iteration));

  let streak = 0;
  for (let i = points.length - 1; i >= 1; i--) {
    if (!inversionIterations.has(points[i].iteration)) break;
    streak++;
  }
  const streakInversions = streak === 0 ? [] : inversions.slice(inversions.length - streak);
  const totalComparisons = points.length - 1;

  return {
    streak,
    triggered: streak >= BUILDER_UTILIZATION_DECLINE_STREAK_THRESHOLD,
    streakInversions,
    totalInversions: inversions.length,
    totalComparisons,
    inversionRatePct: totalComparisons === 0 ? null : (inversions.length / totalComparisons) * 100,
  };
}

/** issue を「クローズした」とみなす verdict。types.ts の通り merged はマージで、abandoned は再試行しても満たせず自動で見送った（issue はクローズ）。 */
const ISSUE_CLOSING_VERDICTS: readonly Verdict[] = ['merged', 'abandoned'];

export interface IssueResolutionPoint {
  /** issue をクローズした反復番号（x軸） */
  iteration: number;
  issueNumber: number;
  /** issue生成(nextIssuesに現れた反復のfinishedAt)からクローズまでの秒数 */
  value: number;
  /** issue を生成した(nextIssuesに含めて提案した)反復番号 */
  createdIteration: number;
}

/**
 * Issue生成からIssueクローズまでの解決時間(秒)の時系列推移。
 *
 * 「生成」は ideationCostQualityCorrelation と同じ考え方で、issue番号が最初にどこかの
 * 反復の nextIssues に現れた時点（その反復のfinishedAt）とする（orchestratorはnextIssuesを
 * そのままissue番号として起票するため、issue番号が実際の作業単位を一意に特定できる）。
 * 「クローズ」は ISSUE_CLOSING_VERDICTS（merged/abandoned）のいずれかに達した反復の
 * finishedAtとする。
 *
 * data/runs には同一issue番号が複数回dispatchされるケースがある（例: 敵対レビュー指摘で
 * 別反復として再修正された、既にマージ済みの issue が誤って再度着手された等）。この場合は
 * 生成後最初に到達したクローズ反復だけを1点として採用し、以降の同issue番号の反復は無視する
 * （実際にissueが「解決した」瞬間は最初のクローズだから）。
 *
 * 生成元(nextIssuesに現れた反復)が見つからないissue（例: seed issue、手動起票issue）は
 * 解決時間の起点が無いため対象外。ideationCostQualityCorrelationのコメントにある自己参照
 * ケース（nextIssuesが提案元自身のissue番号を含む）と同様、生成反復のiterationがクローズ
 * 反復のiteration以上の場合も対象外にする。
 */
export function issueResolutionTimeTrend(runs: RunRecord[]): IssueResolutionPoint[] {
  const sorted = byIterationAsc(runs);

  const createdBy = new Map<number, RunRecord>();
  for (const r of sorted) {
    for (const issueNumber of r.nextIssues) {
      if (!createdBy.has(issueNumber)) createdBy.set(issueNumber, r);
    }
  }

  const resolvedIssueNumbers = new Set<number>();
  const points: IssueResolutionPoint[] = [];

  for (const r of sorted) {
    if (!ISSUE_CLOSING_VERDICTS.includes(r.verdict)) continue;
    if (resolvedIssueNumbers.has(r.issue.number)) continue;

    const created = createdBy.get(r.issue.number);
    if (!created || created.iteration >= r.iteration) continue;

    resolvedIssueNumbers.add(r.issue.number);
    const resolutionSec = (new Date(r.finishedAt).getTime() - new Date(created.finishedAt).getTime()) / 1000;
    points.push({
      iteration: r.iteration,
      issueNumber: r.issue.number,
      value: resolutionSec,
      createdIteration: created.iteration,
    });
  }

  return points;
}

/** トレンド判定に使う直近/直前ウィンドウの解決件数(既定値)。cycleTimeTrendSignal と揃えている。 */
export const ISSUE_RESOLUTION_TIME_TREND_WINDOW = 3;
/** 直近ウィンドウの平均が直前ウィンドウよりこの割合(%)以上変化して初めて増加/減少と判定する。cycleTimeTrendSignal と同じ閾値・考え方。 */
export const ISSUE_RESOLUTION_TIME_TREND_FLAT_THRESHOLD_PCT = 5;

/** increasing: issue解決までの時間が悪化(長期化)傾向。decreasing: 改善(短縮)傾向。 */
export type IssueResolutionTimeTrendDirection = 'increasing' | 'decreasing' | 'flat';

export interface IssueResolutionTimeTrendSignal {
  /** 実際に比較に使ったウィンドウ幅（データが少ない場合は ISSUE_RESOLUTION_TIME_TREND_WINDOW 未満になりうる） */
  windowSize: number;
  /** windowSize が ISSUE_RESOLUTION_TIME_TREND_WINDOW に満たない（信頼度が低い）かどうか */
  partial: boolean;
  recentAvgSec: number;
  previousAvgSec: number;
  /** recentAvgSec - previousAvgSec */
  deltaSec: number;
  /** deltaSec / previousAvgSec * 100。previousAvgSec が 0 のときは定義できないため null */
  deltaPct: number | null;
  direction: IssueResolutionTimeTrendDirection;
  /** 直近ウィンドウに含まれるクローズ反復番号(昇順) */
  recentIterations: number[];
  /** 直前ウィンドウに含まれるクローズ反復番号(昇順) */
  previousIterations: number[];
}

function issueResolutionTimeDirection(deltaSec: number, previousAvgSec: number): IssueResolutionTimeTrendDirection {
  if (previousAvgSec === 0) return deltaSec === 0 ? 'flat' : 'increasing';
  const deltaPct = (deltaSec / previousAvgSec) * 100;
  if (Math.abs(deltaPct) < ISSUE_RESOLUTION_TIME_TREND_FLAT_THRESHOLD_PCT) return 'flat';
  return deltaPct > 0 ? 'increasing' : 'decreasing';
}

/**
 * Issue生成からIssueクローズまでの解決時間のトレンド観測。cycleTimeTrendSignal /
 * timeToFirstPrTrendSignal と同じローリング窓比較（直近window件の平均 vs 直前window件の
 * 平均）を、issueResolutionTimeTrend が返す解決済みissueの母集団に対して行う。比較対象と
 * なる「直前」ウィンドウが取れない（解決済みissueが1件以下）場合は null。
 */
export function issueResolutionTimeTrendSignal(runs: RunRecord[]): IssueResolutionTimeTrendSignal | null {
  const points = issueResolutionTimeTrend(runs);
  if (points.length < 2) return null;

  const windowSize = Math.min(ISSUE_RESOLUTION_TIME_TREND_WINDOW, Math.floor(points.length / 2));
  const recent = points.slice(points.length - windowSize);
  const previous = points.slice(points.length - windowSize * 2, points.length - windowSize);

  const recentAvgSec = mean(recent.map((p) => p.value));
  const previousAvgSec = mean(previous.map((p) => p.value));
  const deltaSec = recentAvgSec - previousAvgSec;

  return {
    windowSize,
    partial: windowSize < ISSUE_RESOLUTION_TIME_TREND_WINDOW,
    recentAvgSec,
    previousAvgSec,
    deltaSec,
    deltaPct: previousAvgSec === 0 ? null : (deltaSec / previousAvgSec) * 100,
    direction: issueResolutionTimeDirection(deltaSec, previousAvgSec),
    recentIterations: recent.map((p) => p.iteration),
    previousIterations: previous.map((p) => p.iteration),
  };
}

export type ComparisonVerdict = 'improved' | 'regressed' | 'unchanged';

export type BuilderMetricKey = 'reviseCycles' | 'changedLines' | 'coveragePct' | 'builderUsd';

export interface BuilderMetricComparison {
  key: BuilderMetricKey;
  label: string;
  previous: number;
  current: number;
  delta: number;
  verdict: ComparisonVerdict;
}

export interface BuilderComparison {
  previousIteration: number;
  currentIteration: number;
  metrics: BuilderMetricComparison[];
}

const BUILDER_METRIC_KEYS: readonly BuilderMetricKey[] = [
  'reviseCycles',
  'changedLines',
  'coveragePct',
  'builderUsd',
];

const BUILDER_METRIC_LABELS: Record<BuilderMetricKey, string> = {
  reviseCycles: 'revise回数',
  changedLines: '変更行数',
  coveragePct: 'カバレッジ',
  builderUsd: 'builderコスト',
};

/** true なら値が小さいほど改善（revise回数・変更行数・コスト）、false なら大きいほど改善（カバレッジ）。 */
const BUILDER_METRIC_LOWER_IS_BETTER: Record<BuilderMetricKey, boolean> = {
  reviseCycles: true,
  changedLines: true,
  coveragePct: false,
  builderUsd: true,
};

function builderMetricValue(run: RunRecord, key: BuilderMetricKey): number {
  switch (key) {
    case 'reviseCycles':
      return run.reviseCycles;
    case 'changedLines':
      return run.changedLines;
    case 'coveragePct':
      return run.verify.coveragePct;
    case 'builderUsd':
      return run.cost.builderUsd;
  }
}

function builderMetricVerdict(delta: number, lowerIsBetter: boolean): ComparisonVerdict {
  if (delta === 0) return 'unchanged';
  const improved = lowerIsBetter ? delta < 0 : delta > 0;
  return improved ? 'improved' : 'regressed';
}

/**
 * builder の改善状況を、直前の測定済み(verify到達済み) iteration と比較する。
 * `failed` run は changedLines/coveragePct が sentinel 0 で比較の意味を持たないため、
 * coverageTrend と同じ reachedVerify で除外してから直近2件を取り出す。
 * 測定済み run が2件未満（比較対象が無い）場合は null を返す。
 */
export function builderComparison(runs: RunRecord[]): BuilderComparison | null {
  const completed = byIterationAsc(runs).filter(reachedVerify);
  if (completed.length < 2) return null;

  const previous = completed[completed.length - 2];
  const current = completed[completed.length - 1];

  const metrics: BuilderMetricComparison[] = BUILDER_METRIC_KEYS.map((key) => {
    const prevValue = builderMetricValue(previous, key);
    const currValue = builderMetricValue(current, key);
    const delta = currValue - prevValue;
    return {
      key,
      label: BUILDER_METRIC_LABELS[key],
      previous: prevValue,
      current: currValue,
      delta,
      verdict: builderMetricVerdict(delta, BUILDER_METRIC_LOWER_IS_BETTER[key]),
    };
  });

  return {
    previousIteration: previous.iteration,
    currentIteration: current.iteration,
    metrics,
  };
}

/** 前兆検知が直近何反復を見るか。3反復未満のデータしか無い場合はあるだけの反復で計算する。 */
export const EARLY_WARNING_WINDOW = 3;
/** window 内の平均 revise 回数がこれを超えると「高 revise」とみなす。 */
export const EARLY_WARNING_REVISE_THRESHOLD = 2;
/** window 内の承認率がこれ未満だと「低 approval」とみなす。 */
export const EARLY_WARNING_APPROVAL_THRESHOLD = 0.5;

/**
 * critical: 高revise かつ 低approval の両方が揃っている（reviseCyclesが伸びているのに
 *           adversaryの承認が付いていない = builderが迷走している前兆）。
 * watch:    どちらか一方だけ該当。まだ「迷走」とは言えないが注視が要る。
 * normal:   どちらにも該当しない。
 */
export type EarlyWarningLevel = 'critical' | 'watch' | 'normal';

export interface EarlyWarningSignal {
  level: EarlyWarningLevel;
  /** 実際に計算に使った反復数（データが少ない場合は EARLY_WARNING_WINDOW 未満になりうる） */
  windowSize: number;
  /** window が EARLY_WARNING_WINDOW に満たない（信頼度が低い）かどうか */
  partial: boolean;
  windowAvgReviseCycles: number;
  /** 0..1 */
  windowApprovalRate: number;
  reviseCyclesThreshold: number;
  approvalRateThreshold: number;
  highRevise: boolean;
  lowApproval: boolean;
  /** window に含まれる iteration 番号（昇順） */
  iterations: number[];
}

/**
 * 「高 reviseCycles + 低 approval rate」の前兆パターンを検知する。
 * サーキットブレーカ（breakerStreak）が実際に非マージの連続を数える「事後」の指標なのに対し、
 * こちらは非マージにすら至っていない段階の「builderがrevise を重ねているのに承認されない」
 * という予兆を、直近 window 反復のローリング集計で見る。
 * reachedVerify で failed run を除外するのは他の trend 系関数と同じ理由
 * （failed は revise/approve が測定されなかった sentinel を持つため）。
 */
export function earlyWarningSignal(runs: RunRecord[]): EarlyWarningSignal | null {
  const completed = byIterationAsc(runs).filter(reachedVerify);
  if (completed.length === 0) return null;

  const recentWindow = completed.slice(-EARLY_WARNING_WINDOW);
  const windowAvgReviseCycles = mean(recentWindow.map((r) => r.reviseCycles));
  const approvedCount = recentWindow.filter((r) => r.adversary.approved).length;
  const windowApprovalRate = approvedCount / recentWindow.length;

  const highRevise = windowAvgReviseCycles > EARLY_WARNING_REVISE_THRESHOLD;
  const lowApproval = windowApprovalRate < EARLY_WARNING_APPROVAL_THRESHOLD;
  const level: EarlyWarningLevel =
    highRevise && lowApproval ? 'critical' : highRevise || lowApproval ? 'watch' : 'normal';

  return {
    level,
    windowSize: recentWindow.length,
    partial: recentWindow.length < EARLY_WARNING_WINDOW,
    windowAvgReviseCycles,
    windowApprovalRate,
    reviseCyclesThreshold: EARLY_WARNING_REVISE_THRESHOLD,
    approvalRateThreshold: EARLY_WARNING_APPROVAL_THRESHOLD,
    highRevise,
    lowApproval,
    iterations: recentWindow.map((r) => r.iteration),
  };
}

export interface ModelApprovalRateTrendSeries {
  model: string;
  /**
   * この model が builder として使われ、かつ verify に到達した反復での累積承認率推移(0..100)。
   * approvalRateTrend と同じ定義（reachedVerify母集団・累積計算）だが、母集団をこの model の
   * builder使用時に限定する。
   */
  points: TrendPoint[];
  /** points の最終点。points が空なら0（この model は verify に到達した反復を持たない） */
  latestRate: number;
  /** points.length と同じ（この推移の対象反復数） */
  count: number;
}

/**
 * builder に使われたモデル別の承認率トレンド観測。approvalRateTrend が全モデルを合算した
 * 1本の推移しか見せないのに対し、こちらはモデルごとに独立した累積承認率推移を返す。
 * 「モデルを切り替えた後、承認率が実際に改善/悪化しているか」を時系列で比較するのが
 * このパネル固有の役割（modelEffectiveness は期間全体の1点サマリーで、切替の前後関係が
 * 見えない）。reachedVerify で failed run を除外するのは approvalRateTrend と同じ理由
 * （failed run の adversary.approved は測定されなかった sentinel）。
 * 対象反復数（count）降順・同数はモデル名昇順で、データが豊富なモデルから並べる。
 */
export function approvalRateTrendByModel(runs: RunRecord[]): ModelApprovalRateTrendSeries[] {
  const byModel = new Map<string, RunRecord[]>();
  for (const run of byIterationAsc(runs)) {
    const model = run.models.builder;
    const list = byModel.get(model);
    if (list) {
      list.push(run);
    } else {
      byModel.set(model, [run]);
    }
  }

  return [...byModel.entries()]
    .map(([model, modelRuns]) => {
      const completed = modelRuns.filter(reachedVerify);
      let approvedCount = 0;
      const points = completed.map((r, i) => {
        if (r.adversary.approved) approvedCount++;
        return { iteration: r.iteration, value: (approvedCount / (i + 1)) * 100 };
      });
      return {
        model,
        points,
        latestRate: points.length === 0 ? 0 : points[points.length - 1].value,
        count: points.length,
      };
    })
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.model.localeCompare(b.model);
    });
}

/**
 * gateReasons の分類。orchestrator/gates.py の evaluate_gate 等が生成する文字列
 * テンプレートに合わせている。変更行数・保護パス・例外メッセージは値が動的に埋め込まれる
 * ため、完全一致ではなくプレフィックス/サフィックスで判定する。どれにも合致しなければ 'other'。
 */
export type GateReasonCategory =
  | 'verifyFailed'
  | 'e2eFailed'
  | 'adversaryNotApproved'
  | 'adversaryUnparseable'
  | 'changedLinesExceeded'
  | 'protectedPathViolation'
  | 'noChanges'
  | 'crashed'
  | 'other';

/** count 同値のときの表示順（gates.py の evaluate_gate が理由を積む順に揃えている）。 */
const GATE_REASON_CATEGORY_ORDER: readonly GateReasonCategory[] = [
  'verifyFailed',
  'e2eFailed',
  'adversaryNotApproved',
  'adversaryUnparseable',
  'changedLinesExceeded',
  'protectedPathViolation',
  'noChanges',
  'crashed',
  'other',
];

/**
 * orchestrator/review.py の parse_adversary_review が、adversary の応答を構造化
 * できなかったとき（JSON を取り出せない／`approved` が真偽値でない）に技術的棄却として
 * summary へ書き込む文言。どちらも「内容を読んで却下した」のではなく「読めなかったので
 * 安全側の棄却に倒した」ケースであり、実際に blocking な欠陥を指摘した却下（内容を伴う
 * adversaryNotApproved）と混ぜると、パス別の連鎖から「何が起きたか」が読み取れなくなる
 * （このダッシュボードの敵対レビューで指摘された曖昧さそのもの）。gateReasons 側は
 * どちらも同じ固定文言 'adversary が approve していない' しか積まないため、reason 文字列
 * だけでは区別できず、adversary.summary（RunRecord の言語間契約フィールド）を追加の
 * 手がかりに使う。
 */
const ADVERSARY_UNPARSEABLE_SUMMARY = 'adversary の出力を解釈できないため棄却として扱う';
const ADVERSARY_NON_BOOLEAN_SUMMARY_PREFIX = 'approved が真偽値でないため棄却';

function isAdversaryParseFailureSummary(summary: string): boolean {
  return summary === ADVERSARY_UNPARSEABLE_SUMMARY || summary.startsWith(ADVERSARY_NON_BOOLEAN_SUMMARY_PREFIX);
}

/**
 * adversarySummary は 'adversary が approve していない' の分類を
 * adversaryNotApproved（内容を読んで却下）と adversaryUnparseable（出力を解釈できず
 * 安全側に倒した技術的棄却）へさらに分岐させるための追加コンテキスト。呼び出し元が
 * run.adversary.summary を渡さない場合は今まで通り adversaryNotApproved に丸める
 * （後方互換）。
 */
export function classifyGateReason(reason: string, adversarySummary?: string): GateReasonCategory {
  if (reason === 'verify(lint/typecheck/unit/build) が失敗している') return 'verifyFailed';
  if (reason === 'e2e(Playwright) が失敗している') return 'e2eFailed';
  if (reason === 'adversary が approve していない') {
    return adversarySummary !== undefined && isAdversaryParseFailureSummary(adversarySummary)
      ? 'adversaryUnparseable'
      : 'adversaryNotApproved';
  }
  if (reason === 'builder が変更を生成しなかった') return 'noChanges';
  if (reason.startsWith('変更行数 ') && reason.endsWith('を超えている')) return 'changedLinesExceeded';
  if (reason.startsWith('保護パスを変更している: ')) return 'protectedPathViolation';
  if (reason.startsWith('反復が例外で異常終了した: ')) return 'crashed';
  return 'other';
}

export interface GateReasonCategorySummary {
  category: GateReasonCategory;
  /** このカテゴリの gateReasons 出現数（1 run が複数件持つ場合は複数カウント） */
  count: number;
  /** 該当した反復番号（重複なし・昇順） */
  iterations: number[];
  /** 実際に出現した理由文字列（重複除去・昇順） */
  examples: string[];
}

/** 全 run の gateReasons を分類ごとに集計する。count 降順、同数は評価順で安定させる。 */
export function gateReasonBreakdown(runs: RunRecord[]): GateReasonCategorySummary[] {
  const byCategory = new Map<GateReasonCategory, { count: number; iterations: Set<number>; examples: Set<string> }>();

  for (const run of byIterationAsc(runs)) {
    for (const reason of run.gateReasons) {
      const category = classifyGateReason(reason, run.adversary.summary);
      let entry = byCategory.get(category);
      if (!entry) {
        entry = { count: 0, iterations: new Set(), examples: new Set() };
        byCategory.set(category, entry);
      }
      entry.count++;
      entry.iterations.add(run.iteration);
      entry.examples.add(reason);
    }
  }

  return [...byCategory.entries()]
    .map(([category, entry]) => ({
      category,
      count: entry.count,
      iterations: [...entry.iterations].sort((a, b) => a - b),
      examples: [...entry.examples].sort(),
    }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return GATE_REASON_CATEGORY_ORDER.indexOf(a.category) - GATE_REASON_CATEGORY_ORDER.indexOf(b.category);
    });
}

export interface GateReasonCostSummary {
  category: GateReasonCategory;
  /** このカテゴリの gateReasons 出現数（gateReasonBreakdown と同じ定義。1 run が複数件持てば複数カウント） */
  count: number;
  /** 該当した反復番号（重複なし・昇順） */
  iterations: number[];
  /** このカテゴリが1回以上出現した run の数（cost/duration/reviseCycles の集計母数。同一 run が同一カテゴリを複数回出しても1件として数える） */
  runCount: number;
  /** runCount 件の run の cost.totalUsd 合計 */
  totalCostUsd: number;
  /** runCount 件の run の durationSec 合計 */
  totalDurationSec: number;
  /** runCount 件の run の reviseCycles 合計 */
  totalReviseCycles: number;
  /** totalCostUsd / runCount */
  avgCostUsdPerRun: number;
  /**
   * totalCostUsd / totalReviseCycles。「このカテゴリでゲートが止まったとき、
   * revise 1回あたり実際に何USDかかっているか」という実質コスト。gateReasonBreakdown の
   * count（出現回数）だけでは、revise を伴わず即abandonした安価な失敗と、何度もrevise
   * を重ねた高コストな失敗を区別できない。totalReviseCycles が0（revise せず失敗した run
   * だけのカテゴリ）のときは0除算になるため null。
   */
  avgCostUsdPerReviseCycle: number | null;
  /** totalDurationSec / totalReviseCycles。avgCostUsdPerReviseCycle と同じ理由で totalReviseCycles が0のときは null。 */
  avgDurationSecPerReviseCycle: number | null;
}

/**
 * ゲート不通過理由のカテゴリ別に、実際にかかったコスト（USD）・所要時間・revise回数を
 * 集計する。gateReasonBreakdown / gateReasonBurdenTrend が「何件起きたか」という頻度を
 * 見るのに対し、こちらは「その頻度が実際にどれだけの実質コストを伴ったか」を見る。
 * 同じ出現件数でも、revise を繰り返して初めて解消するカテゴリ（例: e2eFailed）と、
 * revise 前に即座に abandon するカテゴリ（例: crashed）とではループが払うコストの
 * 実態が大きく異なるため、頻度だけの集計では見えない負担を可視化する。
 *
 * cost/duration/reviseCycles は run 単位の値であり reason 単位の値ではないため、1 run が
 * 同じカテゴリに属する reason を複数持っていても二重計上しないよう run.iteration で
 * 重複排除する（gateReasonBreakdown の count 自体は出現件数のまま変えない）。run.id では
 * なく iteration をキーに使うのは、このファイルの他の集計関数（iterations: Set<number> 等）
 * と同じく、runs 配列内で 1 run を一意に識別できる値が iteration だから。
 */
export function gateReasonCostBreakdown(runs: RunRecord[]): GateReasonCostSummary[] {
  const byCategory = new Map<
    GateReasonCategory,
    {
      count: number;
      iterations: Set<number>;
      costRuns: Set<number>;
      totalCostUsd: number;
      totalDurationSec: number;
      totalReviseCycles: number;
    }
  >();

  for (const run of byIterationAsc(runs)) {
    for (const reason of run.gateReasons) {
      const category = classifyGateReason(reason, run.adversary.summary);
      let entry = byCategory.get(category);
      if (!entry) {
        entry = {
          count: 0,
          iterations: new Set(),
          costRuns: new Set(),
          totalCostUsd: 0,
          totalDurationSec: 0,
          totalReviseCycles: 0,
        };
        byCategory.set(category, entry);
      }
      entry.count++;
      entry.iterations.add(run.iteration);
      if (!entry.costRuns.has(run.iteration)) {
        entry.costRuns.add(run.iteration);
        entry.totalCostUsd += run.cost.totalUsd;
        entry.totalDurationSec += run.durationSec;
        entry.totalReviseCycles += run.reviseCycles;
      }
    }
  }

  return [...byCategory.entries()]
    .map(([category, entry]) => {
      const runCount = entry.costRuns.size;
      return {
        category,
        count: entry.count,
        iterations: [...entry.iterations].sort((a, b) => a - b),
        runCount,
        totalCostUsd: entry.totalCostUsd,
        totalDurationSec: entry.totalDurationSec,
        totalReviseCycles: entry.totalReviseCycles,
        avgCostUsdPerRun: runCount === 0 ? 0 : entry.totalCostUsd / runCount,
        avgCostUsdPerReviseCycle: entry.totalReviseCycles === 0 ? null : entry.totalCostUsd / entry.totalReviseCycles,
        avgDurationSecPerReviseCycle:
          entry.totalReviseCycles === 0 ? null : entry.totalDurationSec / entry.totalReviseCycles,
      };
    })
    .sort((a, b) => {
      if (b.totalCostUsd !== a.totalCostUsd) return b.totalCostUsd - a.totalCostUsd;
      return GATE_REASON_CATEGORY_ORDER.indexOf(a.category) - GATE_REASON_CATEGORY_ORDER.indexOf(b.category);
    });
}

export interface AdversaryReasonModelCell {
  model: string;
  /** この理由カテゴリ×モデルの組み合わせで gateReasons に出現した件数 */
  count: number;
  /** そのうち adversary.approved が true だった件数 */
  approvedCount: number;
  /** 0..100。count は必ず1以上（出現した組み合わせのみエントリを持つ）なので0除算は起きない。 */
  approvalRatePct: number;
  /** 該当した反復番号（重複なし・昇順） */
  iterations: number[];
}

export interface AdversaryReasonModelRow {
  category: GateReasonCategory;
  /** この理由カテゴリの全モデル合計出現数 */
  total: number;
  /** モデル別内訳。count 降順、同数はモデル名昇順 */
  cells: AdversaryReasonModelCell[];
}

/**
 * gateReasons のカテゴリ(理由)と、そのとき実際にレビューした adversary モデルという
 * 2軸で adversary 承認率を集計する。gateReasonBreakdown がカテゴリの出現件数のみを見るのに
 * 対し、こちらは「その理由でゲートが止まった反復のうち adversary が approve していた割合」を
 * モデル別に見せる。
 *
 * adversaryNotApproved / adversaryUnparseable は classifyGateReason の定義上その反復の
 * adversary.approved が常に false（そもそも却下されたから該当カテゴリになった）ため、
 * この2カテゴリの承認率は常に0%になる — バグではなく分類の定義そのものの反映。一方
 * verifyFailed / e2eFailed 等は adversary の判断と独立した失敗要因なので「adversary は
 * approve したのに verify/e2e で落ちた」というモデルごとの見落とし傾向が見える。
 * gateReasonBreakdown と同様、1 run が複数の reason を持てば複数カテゴリへ重複カウントする。
 */
export function adversaryApprovalByReasonAndModel(runs: RunRecord[]): AdversaryReasonModelRow[] {
  const byCategory = new Map<
    GateReasonCategory,
    Map<string, { count: number; approvedCount: number; iterations: Set<number> }>
  >();

  for (const run of byIterationAsc(runs)) {
    for (const reason of run.gateReasons) {
      const category = classifyGateReason(reason, run.adversary.summary);
      let models = byCategory.get(category);
      if (!models) {
        models = new Map();
        byCategory.set(category, models);
      }
      const model = run.models.adversary;
      let cell = models.get(model);
      if (!cell) {
        cell = { count: 0, approvedCount: 0, iterations: new Set() };
        models.set(model, cell);
      }
      cell.count++;
      if (run.adversary.approved) cell.approvedCount++;
      cell.iterations.add(run.iteration);
    }
  }

  return [...byCategory.entries()]
    .map(([category, models]) => {
      const cells: AdversaryReasonModelCell[] = [...models.entries()]
        .map(([model, entry]) => ({
          model,
          count: entry.count,
          approvedCount: entry.approvedCount,
          approvalRatePct: (entry.approvedCount / entry.count) * 100,
          iterations: [...entry.iterations].sort((a, b) => a - b),
        }))
        .sort((a, b) => {
          if (b.count !== a.count) return b.count - a.count;
          return a.model.localeCompare(b.model);
        });
      const total = cells.reduce((sum, c) => sum + c.count, 0);
      return { category, total, cells };
    })
    .sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total;
      return GATE_REASON_CATEGORY_ORDER.indexOf(a.category) - GATE_REASON_CATEGORY_ORDER.indexOf(b.category);
    });
}

export interface BuilderModelGateReasonCell {
  category: GateReasonCategory;
  /** この model×category の組み合わせが gateReasons に出現した件数 */
  count: number;
  /** この model 内での、全カテゴリ出現数に占める category の割合 (0..100) */
  withinModelSharePct: number;
  /** 全 model 合算での、category の割合 (0..100)。model 軸を無視した基準値 */
  baselineSharePct: number;
  /**
   * withinModelSharePct / baselineSharePct。1.0が「平均通り」、1より大きいほどこの model で
   * 当該理由が全体平均より過剰発生していることを示す（逆に1未満は平均より少ない）。
   */
  lift: number;
}

export interface BuilderModelGateReasonRow {
  model: string;
  /** この model が builder だった反復で gateReasons に出現した理由の総数（1反復が複数理由を持てば重複計上） */
  total: number;
  /** 実際に出現した (model, category) の組み合わせだけを lift 降順で持つ */
  cells: BuilderModelGateReasonCell[];
}

/**
 * builder モデル × ゲート不通過理由カテゴリの相関分析。adversaryApprovalByReasonAndModel が
 * 「理由カテゴリ→モデル別のadversary承認率」という理由起点の集計なのに対し、こちらは builder
 * モデル起点で「そのモデルが他モデルより有意に多く/少なく引き起こす理由は何か」を lift（相対
 * 発生率）として見せる。lift = (そのモデル内でのカテゴリ占有率) / (全モデル平均でのカテゴリ
 * 占有率)。単純な出現件数(count)だけだとサンプル数が多いモデルの値が全カテゴリで大きくなり
 * どのカテゴリに「偏っているか」が読み取れないため、モデル内シェアを全体シェアで正規化した
 * 相対値にしている。gateReasonsが空の反復（merged等）は対象外。
 * 行は total 降順（同値は model 名昇順）。各行内のセルは lift 降順（同値は count 降順、
 * さらに同値は GATE_REASON_CATEGORY_ORDER）。
 */
export function builderModelGateReasonCorrelation(runs: RunRecord[]): BuilderModelGateReasonRow[] {
  const overallCounts = new Map<GateReasonCategory, number>();
  let overallTotal = 0;
  const byModel = new Map<string, Map<GateReasonCategory, number>>();
  const modelTotals = new Map<string, number>();

  for (const run of byIterationAsc(runs)) {
    if (run.gateReasons.length === 0) continue;
    const model = run.models.builder;
    for (const reason of run.gateReasons) {
      const category = classifyGateReason(reason, run.adversary.summary);

      overallCounts.set(category, (overallCounts.get(category) ?? 0) + 1);
      overallTotal++;

      let categories = byModel.get(model);
      if (!categories) {
        categories = new Map();
        byModel.set(model, categories);
      }
      categories.set(category, (categories.get(category) ?? 0) + 1);
      modelTotals.set(model, (modelTotals.get(model) ?? 0) + 1);
    }
  }

  if (overallTotal === 0) return [];

  return [...byModel.entries()]
    .map(([model, categories]) => {
      const total = modelTotals.get(model) ?? 0;
      const cells: BuilderModelGateReasonCell[] = [...categories.entries()]
        .map(([category, count]) => {
          const withinModelSharePct = (count / total) * 100;
          const baselineSharePct = ((overallCounts.get(category) ?? 0) / overallTotal) * 100;
          return {
            category,
            count,
            withinModelSharePct,
            baselineSharePct,
            lift: withinModelSharePct / baselineSharePct,
          };
        })
        .sort((a, b) => {
          if (b.lift !== a.lift) return b.lift - a.lift;
          if (b.count !== a.count) return b.count - a.count;
          return GATE_REASON_CATEGORY_ORDER.indexOf(a.category) - GATE_REASON_CATEGORY_ORDER.indexOf(b.category);
        });
      return { model, total, cells };
    })
    .sort((a, b) => (b.total !== a.total ? b.total - a.total : a.model.localeCompare(b.model)));
}

export interface GateReasonBurdenPoint {
  iteration: number;
  /** カテゴリ別のこの反復での出現数（GATE_REASON_CATEGORY_ORDER の固定順）。合計は total と一致 */
  counts: Record<GateReasonCategory, number>;
  total: number;
}

/**
 * ゲート不通過理由の時系列 burden（負担）推移。gateReasonBreakdown が全期間を1つの
 * 分布に集約するのに対し、こちらは反復ごとにカテゴリ別件数を保持し、「いつ・どの
 * カテゴリの負担が重かったか」を時系列（積み上げ棒グラフ用）で見えるようにする。
 * gateReasons が空の反復（merged/paused/dry-run 等）は負担ゼロで積み上げる意味が
 * 無いため、gateFailureTypeBreakdown と同じ母集団定義（gateReasons を持つ run のみ）
 * で除外する。
 */
export function gateReasonBurdenTrend(runs: RunRecord[]): GateReasonBurdenPoint[] {
  return byIterationAsc(runs)
    .filter((r) => r.gateReasons.length > 0)
    .map((r) => {
      const counts = Object.fromEntries(
        GATE_REASON_CATEGORY_ORDER.map((category) => [category, 0]),
      ) as Record<GateReasonCategory, number>;
      for (const reason of r.gateReasons) {
        counts[classifyGateReason(reason, r.adversary.summary)]++;
      }
      return { iteration: r.iteration, counts, total: r.gateReasons.length };
    });
}

/** ゲート理由トレンド判定に使う直近/直前ウィンドウの反復数（既定値）。cycleTimeTrendSignal 等と揃えている。 */
export const GATE_REASON_TREND_WINDOW = 3;
/**
 * 直近ウィンドウの平均出現数が直前ウィンドウよりこの値（件/反復）以上変化して初めて
 * 「悪化」「改善」と判定する。カテゴリ別の出現数は0〜数件程度の小さい値を取りやすく、
 * cycleTimeTrendSignal のような%閾値だと 0件→1件 のようなノイズでも±100%扱いになり
 * 過敏に反応するため、絶対値（件数）の閾値にしている。
 */
export const GATE_REASON_TREND_FLAT_THRESHOLD = 0.5;

/** worsening: 直近の方が出現数が多い（悪化）。improving: 直近の方が少ない（改善）。 */
export type GateReasonTrendDirection = 'worsening' | 'improving' | 'flat';

export interface GateReasonCategoryTrend {
  category: GateReasonCategory;
  recentAvgCount: number;
  previousAvgCount: number;
  /** recentAvgCount - previousAvgCount。正なら悪化（出現数が増えている） */
  delta: number;
  direction: GateReasonTrendDirection;
}

export interface GateReasonTrendSignal {
  /** 実際に比較に使ったウィンドウ幅（データが少ない場合は GATE_REASON_TREND_WINDOW 未満になりうる） */
  windowSize: number;
  /** windowSize が GATE_REASON_TREND_WINDOW に満たない（信頼度が低い）かどうか */
  partial: boolean;
  /** GATE_REASON_CATEGORY_ORDER の固定順で全カテゴリを含む */
  categories: GateReasonCategoryTrend[];
  /** 直近ウィンドウに含まれる反復番号（昇順） */
  recentIterations: number[];
  /** 直前ウィンドウに含まれる反復番号（昇順） */
  previousIterations: number[];
}

function gateReasonDirection(delta: number): GateReasonTrendDirection {
  if (Math.abs(delta) < GATE_REASON_TREND_FLAT_THRESHOLD) return 'flat';
  return delta > 0 ? 'worsening' : 'improving';
}

/**
 * ゲート不通過理由のカテゴリ別トレンド観測。gateReasonBurdenTrend が反復ごとの生の
 * 内訳を返すのに対し、こちらは cycleTimeTrendSignal / adversaryCommentTrendSignal と
 * 同じローリング窓比較（直近window/直前windowの平均出現数）で、カテゴリごとに
 * 「悪化」「改善」「横ばい」を判定する。母集団は gateReasonBurdenTrend と同じ
 * （gateReasons を持つ run のみ）。比較対象となる「直前」ウィンドウが取れない
 * （対象点が1件以下）場合は null。
 */
export function gateReasonTrendSignal(runs: RunRecord[]): GateReasonTrendSignal | null {
  const points = gateReasonBurdenTrend(runs);
  if (points.length < 2) return null;

  const windowSize = Math.min(GATE_REASON_TREND_WINDOW, Math.floor(points.length / 2));
  const recent = points.slice(points.length - windowSize);
  const previous = points.slice(points.length - windowSize * 2, points.length - windowSize);

  const categories: GateReasonCategoryTrend[] = GATE_REASON_CATEGORY_ORDER.map((category) => {
    const recentAvgCount = mean(recent.map((p) => p.counts[category]));
    const previousAvgCount = mean(previous.map((p) => p.counts[category]));
    const delta = recentAvgCount - previousAvgCount;
    return {
      category,
      recentAvgCount,
      previousAvgCount,
      delta,
      direction: gateReasonDirection(delta),
    };
  });

  return {
    windowSize,
    partial: windowSize < GATE_REASON_TREND_WINDOW,
    categories,
    recentIterations: recent.map((p) => p.iteration),
    previousIterations: previous.map((p) => p.iteration),
  };
}

export interface GateReasonChain {
  iteration: number;
  issueNumber: number;
  verdict: Verdict;
  /**
   * そのパス(反復)で実際に起きたカテゴリの連鎖。gates.py の evaluate_gate が理由を
   * 積む順（GATE_REASON_CATEGORY_ORDER）そのままに、重複を除いて並べたもの。
   * 例: verify失敗 → e2e失敗 → adversary未承認 のように、1つの不通過が
   * どのカテゴリを連鎖的に巻き込んだかを示す。
   */
  categories: GateReasonCategory[];
}

/**
 * ゲート不通過理由の「連鎖」をパス（反復）単位で可視化するためのデータ。
 * gateReasonBreakdown/gateReasonBurdenTrend が全反復・全カテゴリを1つの分布/時系列に
 * 集約するのに対し、こちらは1パスごとに、その回でどのカテゴリがどの順で連鎖して
 * 発生したかをそのまま保持する。gateReasons が空のパス（merged/paused等）は対象外。
 * 新しい反復順（iteration降順）で返す（abandonedIterationDetails と同じ並び）。
 */
export function gateReasonChains(runs: RunRecord[]): GateReasonChain[] {
  return byIterationAsc(runs)
    .filter((r) => r.gateReasons.length > 0)
    .map((r) => {
      const seen = new Set<GateReasonCategory>();
      const categories: GateReasonCategory[] = [];
      for (const reason of r.gateReasons) {
        const category = classifyGateReason(reason, r.adversary.summary);
        if (!seen.has(category)) {
          seen.add(category);
          categories.push(category);
        }
      }
      return {
        iteration: r.iteration,
        issueNumber: r.issue.number,
        verdict: r.verdict,
        categories,
      };
    })
    .reverse();
}

export interface GateReasonCooccurrencePair {
  categories: [GateReasonCategory, GateReasonCategory];
  /** 同一run内でこの2カテゴリが同時出現した回数（run単位。1runにつき最大1カウント） */
  count: number;
  /** 該当した反復番号（重複なし・昇順） */
  iterations: number[];
}

/** これ未満の共起回数のペアはノイズとみなしクラスタリングの辺として採用しない。 */
export const GATE_REASON_COOCCURRENCE_MIN_COUNT = 2;

/**
 * run単位でgateReasonsを分類・重複排除し（gateReasonChainsと同じ手順）、集合内の
 * 全2要素組み合わせについて同時出現回数を集計する。ペアキーはGATE_REASON_CATEGORY_ORDER
 * 順に正規化しているため、A-BとB-Aは同一ペアとして扱われる。count降順、同数は
 * GATE_REASON_CATEGORY_ORDER準拠で安定ソートして返す。
 */
export function gateReasonCooccurrencePairs(runs: RunRecord[]): GateReasonCooccurrencePair[] {
  const byPairKey = new Map<
    string,
    { categories: [GateReasonCategory, GateReasonCategory]; count: number; iterations: Set<number> }
  >();

  for (const run of byIterationAsc(runs)) {
    const seen = new Set<GateReasonCategory>();
    for (const reason of run.gateReasons) {
      seen.add(classifyGateReason(reason, run.adversary.summary));
    }
    const categories = [...seen].sort(
      (a, b) => GATE_REASON_CATEGORY_ORDER.indexOf(a) - GATE_REASON_CATEGORY_ORDER.indexOf(b),
    );

    for (let i = 0; i < categories.length; i++) {
      for (let j = i + 1; j < categories.length; j++) {
        const pair: [GateReasonCategory, GateReasonCategory] = [categories[i], categories[j]];
        const key = pair.join('|');
        let entry = byPairKey.get(key);
        if (!entry) {
          entry = { categories: pair, count: 0, iterations: new Set() };
          byPairKey.set(key, entry);
        }
        entry.count++;
        entry.iterations.add(run.iteration);
      }
    }
  }

  return [...byPairKey.values()]
    .map((entry) => ({
      categories: entry.categories,
      count: entry.count,
      iterations: [...entry.iterations].sort((a, b) => a - b),
    }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      const aIdx = GATE_REASON_CATEGORY_ORDER.indexOf(a.categories[0]);
      const bIdx = GATE_REASON_CATEGORY_ORDER.indexOf(b.categories[0]);
      if (aIdx !== bIdx) return aIdx - bIdx;
      return (
        GATE_REASON_CATEGORY_ORDER.indexOf(a.categories[1]) - GATE_REASON_CATEGORY_ORDER.indexOf(b.categories[1])
      );
    });
}

export interface GateReasonCooccurrenceCluster {
  /** クラスタに属するカテゴリ（GATE_REASON_CATEGORY_ORDER順、2件以上） */
  categories: GateReasonCategory[];
  /** クラスタ内訳。count降順、同数はGATE_REASON_CATEGORY_ORDER順で安定ソート */
  pairs: GateReasonCooccurrencePair[];
  /** pairsのcount合計 */
  totalCooccurrences: number;
  /** クラスタ内のいずれかのペアが関与した反復番号（重複なし・昇順） */
  iterations: number[];
}

/**
 * gateReasonCooccurrencePairsのうちcount >= minCountの辺だけをUnion-Findで連結し、
 * 推移的に共起するカテゴリ群を1クラスタにまとめる。2カテゴリ未満（孤立カテゴリ）の
 * クラスタは出力しない。totalCooccurrences降順、同数は先頭カテゴリのGATE_REASON_CATEGORY_ORDER
 * 順で安定ソートして返す。
 */
export function gateReasonCooccurrenceClusters(
  runs: RunRecord[],
  minCount: number = GATE_REASON_COOCCURRENCE_MIN_COUNT,
): GateReasonCooccurrenceCluster[] {
  const pairs = gateReasonCooccurrencePairs(runs).filter((p) => p.count >= minCount);

  const parent = new Map<GateReasonCategory, GateReasonCategory>();
  function find(x: GateReasonCategory): GateReasonCategory {
    if (!parent.has(x)) parent.set(x, x);
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    let cur = x;
    while (parent.get(cur) !== cur) {
      const next = parent.get(cur)!;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  }
  function union(a: GateReasonCategory, b: GateReasonCategory) {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent.set(rootA, rootB);
  }

  for (const pair of pairs) {
    union(pair.categories[0], pair.categories[1]);
  }

  const groups = new Map<GateReasonCategory, GateReasonCategory[]>();
  for (const category of parent.keys()) {
    const root = find(category);
    let group = groups.get(root);
    if (!group) {
      group = [];
      groups.set(root, group);
    }
    group.push(category);
  }

  const clusters: GateReasonCooccurrenceCluster[] = [];
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    const memberSet = new Set(members);
    const clusterPairs = pairs.filter((p) => memberSet.has(p.categories[0]) && memberSet.has(p.categories[1]));
    const iterations = new Set<number>();
    for (const p of clusterPairs) {
      for (const it of p.iterations) iterations.add(it);
    }
    clusters.push({
      categories: members.sort(
        (a, b) => GATE_REASON_CATEGORY_ORDER.indexOf(a) - GATE_REASON_CATEGORY_ORDER.indexOf(b),
      ),
      pairs: clusterPairs,
      totalCooccurrences: clusterPairs.reduce((sum, p) => sum + p.count, 0),
      iterations: [...iterations].sort((a, b) => a - b),
    });
  }

  return clusters.sort((a, b) => {
    if (b.totalCooccurrences !== a.totalCooccurrences) return b.totalCooccurrences - a.totalCooccurrences;
    return GATE_REASON_CATEGORY_ORDER.indexOf(a.categories[0]) - GATE_REASON_CATEGORY_ORDER.indexOf(b.categories[0]);
  });
}

/** これ未満のstreak（gateReasonsを持つ反復の連続）は「連続」とみなさない（DROPOUT_STREAK_MIN_LENGTHと同じ2）。 */
export const GATE_REASON_CHAOS_STREAK_MIN_LENGTH = 2;

/** switchCount/(length-1) の判定: 0=毎回同じ原因(stable)、1=毎回変わる(chaotic)、間はmixed。 */
export type GateReasonConsecutiveFailureChaosLevel = 'stable' | 'mixed' | 'chaotic';

export interface GateReasonConsecutiveFailureStreak {
  startIteration: number;
  endIteration: number;
  /** streakに含まれる反復数（GATE_REASON_CHAOS_STREAK_MIN_LENGTH以上のみstreakとして扱う） */
  length: number;
  /** streakに含まれる反復番号（古い→新しい順、length件） */
  iterations: number[];
  /** 各反復の根本原因カテゴリ（古い→新しい順）。gateReasons[0]（最初にブロックした条件）だけを採用する */
  rootCauses: GateReasonCategory[];
  switchCount: number;
  chaosScore: number;
  chaosLevel: GateReasonConsecutiveFailureChaosLevel;
  /** streak内で最多の根本原因カテゴリ（同数はGATE_REASON_CATEGORY_ORDER順） */
  dominantRootCause: GateReasonCategory;
  dominantRootCauseCount: number;
}

function rootCauseCategory(run: RunRecord): GateReasonCategory {
  return classifyGateReason(run.gateReasons[0], run.adversary.summary);
}

function buildChaosStreak(streakRuns: readonly RunRecord[]): GateReasonConsecutiveFailureStreak {
  const rootCauses = streakRuns.map(rootCauseCategory);
  let switchCount = 0;
  for (let i = 1; i < rootCauses.length; i++) {
    if (rootCauses[i] !== rootCauses[i - 1]) switchCount++;
  }
  const chaosScore = switchCount / (rootCauses.length - 1);
  const chaosLevel: GateReasonConsecutiveFailureChaosLevel =
    chaosScore === 0 ? 'stable' : chaosScore === 1 ? 'chaotic' : 'mixed';

  const counts = new Map<GateReasonCategory, number>();
  for (const category of rootCauses) counts.set(category, (counts.get(category) ?? 0) + 1);
  let dominantRootCause = rootCauses[0];
  let dominantRootCauseCount = 0;
  for (const category of GATE_REASON_CATEGORY_ORDER) {
    const count = counts.get(category) ?? 0;
    if (count > dominantRootCauseCount) {
      dominantRootCauseCount = count;
      dominantRootCause = category;
    }
  }

  return {
    startIteration: streakRuns[0].iteration,
    endIteration: streakRuns[streakRuns.length - 1].iteration,
    length: streakRuns.length,
    iterations: streakRuns.map((r) => r.iteration),
    rootCauses,
    switchCount,
    chaosScore,
    chaosLevel,
    dominantRootCause,
    dominantRootCauseCount,
  };
}

/**
 * gateReasonsを持つ反復がiteration番号で途切れずに連続した区間（streak、2反復以上）ごとに、
 * 根本原因カテゴリの入れ替わり（chaosScore/chaosLevel）を集計する。gateReasonsが空の反復や
 * iteration番号の欠落はstreakを区切る。新しいstreakから返す。
 */
export function gateReasonConsecutiveFailureChaos(runs: RunRecord[]): GateReasonConsecutiveFailureStreak[] {
  const sorted = byIterationAsc(runs);
  const streaks: GateReasonConsecutiveFailureStreak[] = [];
  let current: RunRecord[] = [];

  const flush = () => {
    if (current.length >= GATE_REASON_CHAOS_STREAK_MIN_LENGTH) streaks.push(buildChaosStreak(current));
    current = [];
  };

  for (const run of sorted) {
    if (run.gateReasons.length === 0) {
      flush();
      continue;
    }
    if (current.length > 0 && run.iteration !== current[current.length - 1].iteration + 1) {
      flush();
    }
    current.push(run);
  }
  flush();

  return streaks.reverse();
}

/**
 * gateReasonConsecutiveFailureChaos の streak を「終盤、根本原因が一つに絞られたか」で
 * さらに分類する。chaosLevel は switchCount（入れ替わり回数）を streak 全体で1つの
 * 指標に集約するため、「mixed」判定の中に「前半は原因が入れ替わったが後半は同じ原因が
 * 居座るようになった（収束しつつある）」streak と「最後まで入れ替わり続けた」streak が
 * 混在してしまい、reviseがそろそろ的を絞れてきたのか判別できない。こちらは streak の
 * 末尾から見て根本原因カテゴリが何反復連続しているか（tailRunLength）だけを見て、
 * 3水準に分ける:
 * - unified-from-start: 最初から最後まで同じ原因（tailRunLength === length。chaosLevel
 *   'stable' と対応する）
 * - converged: 途中までは原因が入れ替わったが、末尾2反復以上は同じ原因で終わった
 * - not-unified: 最後の反復の原因がその直前と異なる（末尾が孤立しており、収束したとは
 *   言えない）
 */
export type GateReasonUnificationPattern = 'unified-from-start' | 'converged' | 'not-unified';

export interface GateReasonUnificationStreak {
  startIteration: number;
  endIteration: number;
  length: number;
  /** streakに含まれる反復番号（古い→新しい順、length件） */
  iterations: number[];
  /** 各反復の根本原因カテゴリ（古い→新しい順）。gateReasonConsecutiveFailureChaosと同じ定義 */
  rootCauses: GateReasonCategory[];
  pattern: GateReasonUnificationPattern;
  /** streak終端で持続していた（or最初から一貫していた）根本原因カテゴリ。'not-unified'ならnull */
  unifiedRootCause: GateReasonCategory | null;
  /** unifiedRootCauseがstreak終端まで連続した反復数。'not-unified'なら0 */
  unifiedRunLength: number;
  /** unifiedRootCauseの連続が始まった反復番号。'not-unified'ならnull */
  unifiedSinceIteration: number | null;
}

export function gateReasonUnificationPatterns(runs: RunRecord[]): GateReasonUnificationStreak[] {
  return gateReasonConsecutiveFailureChaos(runs).map((streak) => {
    const { rootCauses, iterations, length } = streak;
    const lastCategory = rootCauses[rootCauses.length - 1];
    let tailRunLength = 1;
    for (let i = rootCauses.length - 2; i >= 0 && rootCauses[i] === lastCategory; i--) {
      tailRunLength++;
    }

    const pattern: GateReasonUnificationPattern =
      tailRunLength === length ? 'unified-from-start' : tailRunLength >= 2 ? 'converged' : 'not-unified';

    return {
      startIteration: streak.startIteration,
      endIteration: streak.endIteration,
      length,
      iterations,
      rootCauses,
      pattern,
      unifiedRootCause: pattern === 'not-unified' ? null : lastCategory,
      unifiedRunLength: pattern === 'not-unified' ? 0 : tailRunLength,
      unifiedSinceIteration: pattern === 'not-unified' ? null : iterations[length - tailRunLength],
    };
  });
}

export interface GateReasonRecoveryStep {
  reasonCategory: GateReasonCategory;
  /** 同じ根本原因が連続した反復番号（古い→新しい順、unifiedRunLength件） */
  iterations: number[];
  /** 同一理由での再試行回数（gateReasonUnificationPatternsのunifiedRunLengthと同義） */
  retryCount: number;
  /** 連続の直後に来た反復番号。データ終端で次反復が無ければnull */
  nextIteration: number | null;
  /** 直後の反復のverdict。nextIterationがnullならnull */
  nextVerdict: Verdict | null;
  /** 直後の反復がmergedだったか（同理由の連続から回復できたか） */
  recovered: boolean;
  /** 回復した場合、同一理由が始まった反復から成功反復までの総ステップ数（retryCount + 1）。未回復ならnull */
  stepsToSuccess: number | null;
}

/**
 * gateReasonUnificationPatterns が「streakの末尾で根本原因が一つに絞られたか」を判定する
 * ところまでで止まっているのに対し、こちらは「その絞られた同一理由の連続が、実際に何ステップで
 * 成功（merged）にたどり着いたか」を可視化する。not-unified（末尾まで原因が入れ替わり続けた）は
 * 「同一理由の再試行」自体が存在しないため対象外。unifiedRunLength件の同一理由連続の直後の
 * 反復がmergedならrecovered=trueとし、stepsToSuccessに「同一理由の初回失敗から成功反復まで」の
 * 総試行数（unifiedRunLength + 1）を記録する。直後の反復がmerged以外、またはデータ終端で
 * 直後の反復が無ければrecovered=falseでstepsToSuccessはnull（まだ回復できていない、または
 * このデータの範囲では結末が分からない）。新しい反復から返す。
 */
export function gateReasonRecoverySteps(runs: RunRecord[]): GateReasonRecoveryStep[] {
  const byIteration = new Map(runs.map((r) => [r.iteration, r]));

  return gateReasonUnificationPatterns(runs)
    .filter((p) => p.pattern !== 'not-unified')
    .map((p) => {
      const reasonIterations = p.iterations.slice(p.length - p.unifiedRunLength);
      const next = byIteration.get(p.endIteration + 1) ?? null;
      const recovered = next !== null && next.verdict === 'merged';
      return {
        reasonCategory: p.unifiedRootCause as GateReasonCategory,
        iterations: reasonIterations,
        retryCount: p.unifiedRunLength,
        nextIteration: next ? next.iteration : null,
        nextVerdict: next ? next.verdict : null,
        recovered,
        stepsToSuccess: recovered ? p.unifiedRunLength + 1 : null,
      };
    });
}

/** count 同値のときの表示順（クラッシュ→自動見送り→旧経路、の深刻度順）。 */
const GATE_FAILURE_TYPE_ORDER: readonly Verdict[] = ['failed', 'abandoned', 'needs-human', 'paused', 'dry-run'];

export interface GateFailureTypeSummary {
  /** この verdict に該当した run 数 */
  verdict: Verdict;
  count: number;
  /** 該当した反復番号（重複なし・昇順） */
  iterations: number[];
}

/**
 * gateReasonBreakdown が「なぜゲートを通らなかったか」という理由文字列を分類するのに
 * 対し、こちらは「ゲートを通らなかった結果どう扱われたか」という verdict の類型
 * （failed=クラッシュ / abandoned=自動見送り / needs-human=旧経路）を集計する。
 * paused・dry-run は evaluate_gate が reasons を積まない意図的な非マージ（orchestrator/gates.py）
 * であり実際には gateReasons が常に空なので、gateReasons を持つ run だけを対象にすることで
 * 「ゲート不通過」の対象 run 集合を gateReasonBreakdown と一致させる（count の単位は異なる:
 * gateReasonBreakdown は理由の出現数、こちらは run 数なので、1 run が複数 gateReasons を
 * 持つ場合は合計件数が一致しないことがある）。
 */
export function gateFailureTypeBreakdown(runs: RunRecord[]): GateFailureTypeSummary[] {
  const byType = new Map<Verdict, { count: number; iterations: Set<number> }>();

  for (const run of byIterationAsc(runs)) {
    if (run.gateReasons.length === 0) continue;
    let entry = byType.get(run.verdict);
    if (!entry) {
      entry = { count: 0, iterations: new Set() };
      byType.set(run.verdict, entry);
    }
    entry.count++;
    entry.iterations.add(run.iteration);
  }

  return [...byType.entries()]
    .map(([verdict, entry]) => ({
      verdict,
      count: entry.count,
      iterations: [...entry.iterations].sort((a, b) => a - b),
    }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return GATE_FAILURE_TYPE_ORDER.indexOf(a.verdict) - GATE_FAILURE_TYPE_ORDER.indexOf(b.verdict);
    });
}

/**
 * severity（重大さ）を測る対象になる verdict のみ。paused・dry-run は
 * gateFailureTypeBreakdown と同じ理由で常に gateReasons が空なので対象外
 * （データ上は到達しないが、契約違反の防御として below でも明示的に除外する）。
 * 並び順は GATE_FAILURE_TYPE_ORDER の深刻度順（クラッシュ→自動見送り→旧経路）の
 * 先頭3件をそのまま使う。1つの判断基準を2箇所で食い違わせないための踏襲。
 */
const SEVERITY_TIER_VERDICTS: readonly Verdict[] = GATE_FAILURE_TYPE_ORDER.slice(0, 3);

/** 深刻な順（配列の先頭）ほど大きい重みを返す。範囲は 1..SEVERITY_TIER_VERDICTS.length。 */
function severityWeight(verdict: Verdict): number {
  return SEVERITY_TIER_VERDICTS.length - SEVERITY_TIER_VERDICTS.indexOf(verdict);
}

export interface GateReasonSeverityTierSummary {
  verdict: Verdict;
  /** このカテゴリ×verdictに該当したrun数（重複なし） */
  runCount: number;
  totalCostUsd: number;
  avgCostUsdPerRun: number;
  totalReviseCycles: number;
  avgReviseCyclesPerRun: number;
}

export interface GateReasonSeveritySpectrumSummary {
  category: GateReasonCategory;
  /** このカテゴリが（SEVERITY_TIER_VERDICTSのいずれかの verdict で）出現した run 数の合計 */
  runCount: number;
  /** 該当した反復番号（重複なし・昇順、全tier合算） */
  iterations: number[];
  /**
   * severityWeight を runCount で加重平均したもの。1（全てneeds-human）〜
   * SEVERITY_TIER_VERDICTS.length（全てfailed）の範囲。「このカテゴリでゲートが
   * 止まったとき、ループがどれだけ深刻な形で手放したか」を1つの値に集約する。
   */
  severityScore: number;
  /** 全tier合計 totalCostUsd / runCount */
  avgCostUsdPerRun: number;
  /** 出現した verdict のみ。SEVERITY_TIER_VERDICTS の深刻度順 */
  tiers: GateReasonSeverityTierSummary[];
}

/**
 * gateReasonCostBreakdown は verdict を区別せずカテゴリ単位でコストを合算するため、
 * 「同じ量のコストでも、自動で見送れた（abandoned）のか、クラッシュ（failed）や旧経路の
 * 人間対応（needs-human）にまでエスカレーションしたのか」が埋もれてしまう。こちらは
 * カテゴリ×verdictの2軸でコスト・revise回数を分け、severityWeight で加重した
 * severityScore によってカテゴリを「軽度〜重度」のスペクトラム上に並べる
 * （＝ Gate Reason Severity Spectrum）。severityScoreが高いカテゴリほど、
 * ゲートが止まったときにより深刻な形（クラッシュ寄り）で終わりやすいことを示す。
 * cost/reviseCyclesの二重計上防止（run.iterationでの重複排除）はgateReasonCostBreakdownと同じ。
 */
export function gateReasonSeveritySpectrum(runs: RunRecord[]): GateReasonSeveritySpectrumSummary[] {
  const byCategory = new Map<
    GateReasonCategory,
    Map<Verdict, { iterations: Set<number>; totalCostUsd: number; totalReviseCycles: number }>
  >();

  for (const run of byIterationAsc(runs)) {
    if (run.gateReasons.length === 0) continue;
    if (!SEVERITY_TIER_VERDICTS.includes(run.verdict)) continue;

    const seenCategories = new Set<GateReasonCategory>();
    for (const reason of run.gateReasons) {
      const category = classifyGateReason(reason, run.adversary.summary);
      if (seenCategories.has(category)) continue;
      seenCategories.add(category);

      let tiers = byCategory.get(category);
      if (!tiers) {
        tiers = new Map();
        byCategory.set(category, tiers);
      }
      let entry = tiers.get(run.verdict);
      if (!entry) {
        entry = { iterations: new Set(), totalCostUsd: 0, totalReviseCycles: 0 };
        tiers.set(run.verdict, entry);
      }
      entry.iterations.add(run.iteration);
      entry.totalCostUsd += run.cost.totalUsd;
      entry.totalReviseCycles += run.reviseCycles;
    }
  }

  return [...byCategory.entries()]
    .map(([category, tiersMap]) => {
      const tiers: GateReasonSeverityTierSummary[] = SEVERITY_TIER_VERDICTS.filter((v) => tiersMap.has(v)).map(
        (verdict) => {
          const entry = tiersMap.get(verdict)!;
          const runCount = entry.iterations.size;
          return {
            verdict,
            runCount,
            totalCostUsd: entry.totalCostUsd,
            avgCostUsdPerRun: entry.totalCostUsd / runCount,
            totalReviseCycles: entry.totalReviseCycles,
            avgReviseCyclesPerRun: entry.totalReviseCycles / runCount,
          };
        },
      );

      const runCount = tiers.reduce((sum, t) => sum + t.runCount, 0);
      const totalCostUsd = tiers.reduce((sum, t) => sum + t.totalCostUsd, 0);
      const weightedSum = tiers.reduce((sum, t) => sum + severityWeight(t.verdict) * t.runCount, 0);
      const iterations = [...tiersMap.values()].flatMap((entry) => [...entry.iterations]).sort((a, b) => a - b);

      return {
        category,
        runCount,
        iterations,
        severityScore: weightedSum / runCount,
        avgCostUsdPerRun: totalCostUsd / runCount,
        tiers,
      };
    })
    .sort((a, b) => {
      if (b.severityScore !== a.severityScore) return b.severityScore - a.severityScore;
      return GATE_REASON_CATEGORY_ORDER.indexOf(a.category) - GATE_REASON_CATEGORY_ORDER.indexOf(b.category);
    });
}

export type CostRole = 'builder' | 'adversary' | 'ideation' | 'planner';

const COST_ROLES: readonly CostRole[] = ['builder', 'adversary', 'ideation', 'planner'];

/**
 * byModel（モデル別内訳）に含める役割。planner はコストは記録されるが、どのモデルが
 * 計画したかを RunRecord.models に持たない（models は builder/adversary/ideation の固定キー）。
 * そのため byModel はモデル帰属可能なこの3役割のみを対象にする（byRole には planner も含む）。
 * 将来 models に planner を記録したら、ここに planner を足すだけで byModel も点灯する。
 */
const MODEL_ATTRIBUTED_ROLES: readonly Exclude<CostRole, 'planner'>[] = [
  'builder',
  'adversary',
  'ideation',
];

export interface RoleCostBreakdown {
  role: CostRole;
  totalUsd: number;
  /** 0..100。totalUsd が 0 なら NaN を避けて 0 にする。 */
  pct: number;
}

export interface ModelCostEntry {
  model: string;
  totalUsd: number;
  /** 0..100。totalUsd が 0 なら NaN を避けて 0 にする。 */
  pct: number;
}

export interface CostBreakdown {
  totalUsd: number;
  /** builder → adversary → ideation → planner の固定順。Summary.totalCostUsd と一致する合計の内訳。 */
  byRole: RoleCostBreakdown[];
  /** モデル名でまとめた内訳。同じモデルが複数の役割（例: adversary と ideation）で
   *  使われている場合は合算する。totalUsd 降順。 */
  byModel: ModelCostEntry[];
}

/**
 * モデルコストの内訳。costTrend と同様、コストは verdict に関係なく実際に消費
 * されているため failed run も含める（除外すると Summary.totalCostUsd と食い違う）。
 */
export function costBreakdown(runs: RunRecord[]): CostBreakdown {
  const totalUsd = runs.reduce((sum, r) => sum + r.cost.totalUsd, 0);
  const pctOf = (value: number) => (totalUsd === 0 ? 0 : (value / totalUsd) * 100);

  const roleTotals: Record<CostRole, number> = { builder: 0, adversary: 0, ideation: 0, planner: 0 };
  const modelTotals = new Map<string, number>();

  for (const r of runs) {
    const roleCost: Record<CostRole, number> = {
      builder: r.cost.builderUsd,
      adversary: r.cost.adversaryUsd,
      ideation: r.cost.ideationUsd,
      // plannerUsd は任意フィールド（planner 休眠時の旧レコードには無い）。?? 0 で NaN を防ぐ。
      planner: r.cost.plannerUsd ?? 0,
    };
    for (const role of COST_ROLES) {
      roleTotals[role] += roleCost[role];
    }
    // byModel はモデル名が記録されている役割のみ。planner は models に対応キーが無いため除外。
    for (const role of MODEL_ATTRIBUTED_ROLES) {
      const model = r.models[role];
      modelTotals.set(model, (modelTotals.get(model) ?? 0) + roleCost[role]);
    }
  }

  const byRole: RoleCostBreakdown[] = COST_ROLES.map((role) => ({
    role,
    totalUsd: roleTotals[role],
    pct: pctOf(roleTotals[role]),
  }));

  const byModel: ModelCostEntry[] = [...modelTotals.entries()]
    .map(([model, cost]) => ({ model, totalUsd: cost, pct: pctOf(cost) }))
    .sort((a, b) => b.totalUsd - a.totalUsd);

  return { totalUsd, byRole, byModel };
}

/**
 * 「承認PR」= adversary が approve し、かつ実際に PR が開かれた（prNumber が null でない）反復。
 * `adversary.approved` だけでは不十分: builder が変更を生成しなかった反復（例: 0022.json）は
 * approved=true でも prNumber が null のままゲートで見送られており、PR自体が存在しない。
 * 逆に merged 以外でも paused/dry-run は承認済みで PR が開いた状態なので含める
 * （gateFailureTypeBreakdown が verdict の類型を見るのとは異なり、こちらは
 * 「コストに見合う成果物が出たか」を見るため verdict ではなく承認+PR存在で判定する）。
 */
function isApprovedPr(run: RunRecord): boolean {
  return run.prNumber !== null && run.adversary.approved;
}

export interface CostEfficiency {
  totalCostUsd: number;
  approvedPrCount: number;
  /** 承認PR 1件あたりの平均コスト(USD)。approvedPrCount が 0 だと分母が無いため null。 */
  usdPerApprovedPr: number | null;
}

/**
 * Cost効率（USD per 承認PR）。costBreakdown と同様、コストは verdict に関係なく
 * 実際に消費されているため failed/abandoned run のコストも分子に含める。
 * 承認に至らなかった反復の失敗コストも「1件の承認PRを得るための実コスト」に
 * 含めることで、単純な「マージ済みPRのbuilderコスト」より実態に近い効率を示す。
 */
export function costEfficiency(runs: RunRecord[]): CostEfficiency {
  const totalCostUsd = runs.reduce((sum, r) => sum + r.cost.totalUsd, 0);
  const approvedPrCount = runs.filter(isApprovedPr).length;
  return {
    totalCostUsd,
    approvedPrCount,
    usdPerApprovedPr: approvedPrCount === 0 ? null : totalCostUsd / approvedPrCount,
  };
}

export interface PlannerActivityTrendPoint {
  iteration: number;
  /** plannerUsd > 0（その反復で planner が実際に動いた） */
  active: boolean;
  usd: number;
}

export interface PlannerActivity {
  /** cost.plannerUsd フィールドが記録されている反復数（旧レコードは対象外） */
  trackedCount: number;
  /** trackedCount のうち plannerUsd > 0 だった反復数 */
  activeCount: number;
  /** アクティブ反復の比率(0..100)。trackedCount が0ならnull */
  activationRatePct: number | null;
  /** アクティブ反復1件あたりの平均コスト(USD)。activeCountが0ならnull */
  avgUsdPerActiveRun: number | null;
  /** 計測対象反復の総コストに占める planner コストの割合(0..100)。計測対象総コストが0ならnull */
  pctOfTrackedCost: number | null;
  /** 計測対象反復ごとの推移（iteration昇順） */
  trend: PlannerActivityTrendPoint[];
}

/**
 * Planner（自律 spec+plan 生成、既定 OFF）の稼働状況とコスト効率。
 * cost.plannerUsd は Plan 3 で追加された任意フィールドで、旧い反復には存在しない。
 * フィールド未記録の反復を0扱いにすると稼働率が不当に薄まるため、plannerUsd が
 * 記録されている反復だけを分母（trackedCount）にする。costEfficiency/costBreakdown
 * と同じ方針で、verdict による絞り込みはせず failed run のコストも含める。
 */
export function plannerActivity(runs: RunRecord[]): PlannerActivity {
  const tracked = byIterationAsc(runs).filter((r) => r.cost.plannerUsd !== undefined);
  const trend: PlannerActivityTrendPoint[] = tracked.map((r) => {
    const usd = r.cost.plannerUsd ?? 0;
    return { iteration: r.iteration, active: usd > 0, usd };
  });

  const trackedCount = tracked.length;
  const activeCount = trend.filter((p) => p.active).length;
  const totalTrackedCostUsd = tracked.reduce((sum, r) => sum + r.cost.totalUsd, 0);
  const totalPlannerCostUsd = trend.reduce((sum, p) => sum + p.usd, 0);

  return {
    trackedCount,
    activeCount,
    activationRatePct: trackedCount === 0 ? null : (activeCount / trackedCount) * 100,
    avgUsdPerActiveRun: activeCount === 0 ? null : totalPlannerCostUsd / activeCount,
    pctOfTrackedCost: totalTrackedCostUsd === 0 ? null : (totalPlannerCostUsd / totalTrackedCostUsd) * 100,
    trend,
  };
}

export interface ModelReviseCyclesSummary {
  model: string;
  /** この model が builder として使われ、かつ verify に到達した反復数 */
  count: number;
  mean: number;
  median: number;
  min: number;
  max: number;
  /** 該当した反復番号（昇順） */
  iterations: number[];
}

/**
 * Builder に使われたモデル別の revise 回数分布。reviseCyclesTrend と同じ理由
 * （failed run は verify に到達しておらず revise 回数が「途中でクラッシュするまでの値」
 * で意味が異なる）で reachedVerify を通してから集計する。
 * revise 回数は adversary の棄却により builder が繰り返した回数であり、実際に
 * revise 作業を行うのは builder なので、costBreakdown.byModel（builder/adversary/
 * ideation の全役割を合算）とは異なり、ここでは run.models.builder のみで集計する。
 * 平均 revise 回数の降順（同値はモデル名の昇順）で、負担の大きいモデルから並べる。
 */
export function reviseCyclesByModel(runs: RunRecord[]): ModelReviseCyclesSummary[] {
  const completed = byIterationAsc(runs).filter(reachedVerify);
  const byModel = new Map<string, { values: number[]; iterations: number[] }>();

  for (const run of completed) {
    const model = run.models.builder;
    let entry = byModel.get(model);
    if (!entry) {
      entry = { values: [], iterations: [] };
      byModel.set(model, entry);
    }
    entry.values.push(run.reviseCycles);
    entry.iterations.push(run.iteration);
  }

  return [...byModel.entries()]
    .map(([model, entry]) => ({
      model,
      count: entry.values.length,
      mean: mean(entry.values),
      median: median(entry.values),
      min: Math.min(...entry.values),
      max: Math.max(...entry.values),
      iterations: entry.iterations,
    }))
    .sort((a, b) => {
      if (b.mean !== a.mean) return b.mean - a.mean;
      return a.model.localeCompare(b.model);
    });
}

export interface ModelReviseStopPatternSummary {
  model: string;
  /** この model が builder として使われ、かつ verify に到達した反復数 */
  count: number;
  /** adversary が approve し、revise 上限を使い切る前に打ち止めた件数（early-exit） */
  earlyExitCount: number;
  /** 内容を読んだ上で承認されないまま revise 上限を使い切って打ち止めた件数（枯渇） */
  exhaustedCount: number;
  /** adversary 出力が解釈できず安全側で棄却された件数。内容に基づく枯渇ではないため exhaustedCount から分離する */
  unparseableCount: number;
  /** exhaustedCount / count。0件のときは0（unparseableCount は分子に含めない） */
  exhaustionRate: number;
  /** early-exit した反復の平均revise回数 */
  earlyExitMeanReviseCycles: number;
  /** 枯渇した反復の平均revise回数 */
  exhaustedMeanReviseCycles: number;
  /** 該当した反復番号（昇順） */
  iterations: number[];
}

/**
 * Builder に使われたモデル別に、revise ループがどう打ち止まったかを分類する。
 * round.py の retry-to-comply ループは (verify・e2e・adversary が全て通って承認された)
 * か (revise 上限 max_revise_cycles を使い切った) のいずれかでしか止まらないため、
 * `adversary.approved` の真偽だけで「早期に承認されて止まった(early-exit)」か
 * 「承認されないまま上限を使い切って止まった(枯渇)」かを一意に判定できる
 * （reachedVerify を通した母集団のみ。failed run は打ち止め理由が「途中クラッシュ」で
 * 意味が異なるため除外する）。
 * ただし `adversary.approved === false` は「内容を読んで却下した」場合と「出力を解釈できず
 * 安全側で棄却した」場合の両方で起こり得る（classifyGateReason の adversaryNotApproved /
 * adversaryUnparseable の区別と同じ）。後者はモデルの再現性の問題ではなく orchestrator 側の
 * パース失敗なので、`isAdversaryParseFailureSummary` で判定し unparseableCount として
 * exhaustedCount から分離する。両者を混ぜると exhaustionRate が「粘っても承認されにくい
 * モデル」ではなく「パース事故に当たりやすいモデル」を表してしまう。
 * 枯渇率(exhaustionRate)の降順で、粘っても承認されにくいモデルから並べる。
 */
export function reviseStopPatternByModel(runs: RunRecord[]): ModelReviseStopPatternSummary[] {
  const completed = byIterationAsc(runs).filter(reachedVerify);
  const byModel = new Map<
    string,
    { early: number[]; exhausted: number[]; unparseable: number[]; iterations: number[] }
  >();

  for (const run of completed) {
    const model = run.models.builder;
    let entry = byModel.get(model);
    if (!entry) {
      entry = { early: [], exhausted: [], unparseable: [], iterations: [] };
      byModel.set(model, entry);
    }
    if (run.adversary.approved) {
      entry.early.push(run.reviseCycles);
    } else if (isAdversaryParseFailureSummary(run.adversary.summary)) {
      entry.unparseable.push(run.reviseCycles);
    } else {
      entry.exhausted.push(run.reviseCycles);
    }
    entry.iterations.push(run.iteration);
  }

  return [...byModel.entries()]
    .map(([model, entry]) => {
      const count = entry.early.length + entry.exhausted.length + entry.unparseable.length;
      return {
        model,
        count,
        earlyExitCount: entry.early.length,
        exhaustedCount: entry.exhausted.length,
        unparseableCount: entry.unparseable.length,
        exhaustionRate: count === 0 ? 0 : entry.exhausted.length / count,
        earlyExitMeanReviseCycles: mean(entry.early),
        exhaustedMeanReviseCycles: mean(entry.exhausted),
        iterations: entry.iterations,
      };
    })
    .sort((a, b) => {
      if (b.exhaustionRate !== a.exhaustionRate) return b.exhaustionRate - a.exhaustionRate;
      return a.model.localeCompare(b.model);
    });
}

export interface VerdictReviseCyclesSummary {
  verdict: Verdict;
  /** この verdict に該当した反復数 */
  count: number;
  mean: number;
  median: number;
  min: number;
  max: number;
  /** 該当した反復番号（昇順） */
  iterations: number[];
}

/** 平均revise回数が同値のときの表示順（GATE_FAILURE_TYPE_ORDER と同じ深刻度順に合わせる）。 */
const VERDICT_REVISE_ORDER: readonly Verdict[] = [
  'failed',
  'abandoned',
  'needs-human',
  'paused',
  'dry-run',
  'merged',
];

/**
 * verdict別のrevise回数分布。reviseCyclesByModel は failed run を reachedVerify で
 * 除外するが（複数 verdict を1モデルのグループに混ぜて平均するため、意味の異なる
 * sentinel を持ち込むと平均が歪む）、こちらは verdict そのものを分割キーにしている
 * ので事情が異なる: failed グループの reviseCycles は「クラッシュするまでの値」という
 * 一貫した意味を保ったまま、failed という1グループ内だけで平均される。つまり
 * 「failed に至った反復は何回revise した末にクラッシュしたか」を merged 等と並べて
 * 比較すること自体がこのパネルの目的であり、除外すると比較対象が消えてしまう。
 */
export function reviseCyclesByVerdict(runs: RunRecord[]): VerdictReviseCyclesSummary[] {
  const byVerdict = new Map<Verdict, { values: number[]; iterations: number[] }>();

  for (const run of byIterationAsc(runs)) {
    let entry = byVerdict.get(run.verdict);
    if (!entry) {
      entry = { values: [], iterations: [] };
      byVerdict.set(run.verdict, entry);
    }
    entry.values.push(run.reviseCycles);
    entry.iterations.push(run.iteration);
  }

  return [...byVerdict.entries()]
    .map(([verdict, entry]) => ({
      verdict,
      count: entry.values.length,
      mean: mean(entry.values),
      median: median(entry.values),
      min: Math.min(...entry.values),
      max: Math.max(...entry.values),
      iterations: entry.iterations,
    }))
    .sort((a, b) => {
      if (b.mean !== a.mean) return b.mean - a.mean;
      return VERDICT_REVISE_ORDER.indexOf(a.verdict) - VERDICT_REVISE_ORDER.indexOf(b.verdict);
    });
}

/** revise 回数の分類。3回以上は '3+' にまとめ、桁数の異なる少数サンプルでbucketが乱立するのを防ぐ。 */
export type ReviseVerdictBucketLabel = '0' | '1' | '2' | '3+';

const REVISE_VERDICT_BUCKET_ORDER: readonly ReviseVerdictBucketLabel[] = ['0', '1', '2', '3+'];

export function reviseVerdictBucket(reviseCycles: number): ReviseVerdictBucketLabel {
  if (reviseCycles <= 0) return '0';
  if (reviseCycles === 1) return '1';
  if (reviseCycles === 2) return '2';
  return '3+';
}

export interface ReviseVerdictMatrixRow {
  bucket: ReviseVerdictBucketLabel;
  /** このbucketに属した反復数（全verdict合計） */
  total: number;
  /** verdict別の件数。Verdict の全メンバーをキーに持つ（0件のverdictも0で入る） */
  byVerdict: Record<Verdict, number>;
  /** 該当した反復番号（昇順） */
  iterations: number[];
}

/**
 * revise回数(bucket化: 0/1/2/3+) × verdict のクロス集計。reviseCyclesByVerdict が
 * verdictごとのrevise回数を平均・中央値等の要約統計に潰すのに対し、こちらは
 * 「revise回数がN回だった反復のうち、実際にどのverdictへ何件分岐したか」という分布
 * そのものを見せる（＝revise回数とverdictの関連図）。例えば「revise 0回はほぼ全部
 * merged だが、3回以上になるとabandonedが増える」といった閾値付近の傾向は、平均値
 * だけを見る reviseCyclesByVerdict では読み取れない。
 * reviseCyclesByVerdict と同じ理由で failed run も除外しない（failed グループの
 * reviseCyclesは「クラッシュするまでの値」として意味を持つ）。
 * bucketはデータに実際に出現したものだけを、少ない方から多い方の順で返す
 * （空bucketは含めない）。
 */
export function reviseVerdictMatrix(runs: RunRecord[]): ReviseVerdictMatrixRow[] {
  const byBucket = new Map<ReviseVerdictBucketLabel, { byVerdict: Record<Verdict, number>; iterations: number[] }>();

  for (const run of byIterationAsc(runs)) {
    const bucket = reviseVerdictBucket(run.reviseCycles);
    let entry = byBucket.get(bucket);
    if (!entry) {
      entry = {
        byVerdict: { merged: 0, abandoned: 0, 'needs-human': 0, paused: 0, 'dry-run': 0, failed: 0 },
        iterations: [],
      };
      byBucket.set(bucket, entry);
    }
    entry.byVerdict[run.verdict]++;
    entry.iterations.push(run.iteration);
  }

  return [...byBucket.entries()]
    .map(([bucket, entry]) => ({
      bucket,
      total: entry.iterations.length,
      byVerdict: entry.byVerdict,
      iterations: entry.iterations,
    }))
    .sort((a, b) => REVISE_VERDICT_BUCKET_ORDER.indexOf(a.bucket) - REVISE_VERDICT_BUCKET_ORDER.indexOf(b.bucket));
}

/**
 * changedLines(変更行数)を3段階に分類する。閾値は data/runs に実際に出現する分布
 * （0〜900行程度）を3等分の目安にした表示用の区分であり、orchestrator側の
 * changedLinesExceeded 判定閾値（gates.py）とは無関係。
 */
export type ChangeSizeBucketLabel = 'small' | 'medium' | 'large';

const CHANGE_SIZE_BUCKET_ORDER: readonly ChangeSizeBucketLabel[] = ['small', 'medium', 'large'];

/** この行数以下を 'small' とする。 */
export const CHANGE_SIZE_SMALL_MAX = 100;
/** この行数以下を 'medium'、超えたら 'large' とする。 */
export const CHANGE_SIZE_MEDIUM_MAX = 300;

function changeSizeBucket(changedLines: number): ChangeSizeBucketLabel {
  if (changedLines <= CHANGE_SIZE_SMALL_MAX) return 'small';
  if (changedLines <= CHANGE_SIZE_MEDIUM_MAX) return 'medium';
  return 'large';
}

/**
 * revise回数(bucket) × 変更サイズ(bucket) の組み合わせを「成功パターン」に分類する
 * しきい値。件数が少ない組み合わせは1件のverdictでmergeRateが0%/100%に振れ切れる
 * ため、SUCCESS_PATTERN_MIN_SAMPLES未満は判定を保留("insufficient-data")する。
 */
export const SUCCESS_PATTERN_MIN_SAMPLES = 3;
/** merge到達率がこれ以上なら 'high-success' と判定する。 */
export const SUCCESS_PATTERN_HIGH_THRESHOLD = 0.66;
/**
 * merge到達率がこれ以下なら 'low-success' と判定する（この間は 'mixed'）。
 * SUCCESS_PATTERN_HIGH_THRESHOLD(0.66) と対称になる 0.34 にしている（1 - 0.66 = 0.34）。
 * 例えば3件中1件mergeのケース(1/3 ≈ 0.333)を確実に 'low-success' 側へ倒すため。
 */
export const SUCCESS_PATTERN_LOW_THRESHOLD = 0.34;

export type SuccessPatternLabel = 'high-success' | 'mixed' | 'low-success' | 'insufficient-data';

function classifySuccessPattern(mergedCount: number, total: number): SuccessPatternLabel {
  if (total < SUCCESS_PATTERN_MIN_SAMPLES) return 'insufficient-data';
  const rate = mergedCount / total;
  if (rate >= SUCCESS_PATTERN_HIGH_THRESHOLD) return 'high-success';
  if (rate <= SUCCESS_PATTERN_LOW_THRESHOLD) return 'low-success';
  return 'mixed';
}

export interface ReviseSizeSuccessCell {
  reviseBucket: ReviseVerdictBucketLabel;
  sizeBucket: ChangeSizeBucketLabel;
  /** このセル(revise bucket × size bucket)に属した反復数 */
  total: number;
  mergedCount: number;
  /** 0..1 */
  mergeRate: number;
  pattern: SuccessPatternLabel;
  /** 該当した反復番号（昇順） */
  iterations: number[];
}

/**
 * revise回数(0/1/2/3+) × 変更サイズ(small/medium/large) の2軸クロス集計で、
 * どの組み合わせがmergeに至りやすい「成功パターン」かを分類する。
 * reviseVerdictMatrix がrevise回数単独でverdict分布を見るのに対し、こちらは
 * 変更サイズを掛け合わせることで「小さい変更ならrevise回数が多くてもmergeしやすいが、
 * 大きい変更はrevise回数が増えるほどmergeしにくい」といった、revise回数単体では
 * 見えないサイズ依存の傾向を切り分ける。
 * changedLinesTrend と同じ理由で failed run（verifyに到達せずchangedLinesが
 * 測定されなかったsentinel 0）は母集団から除外する。
 * 出現した組み合わせだけを、reviseBucket昇順→sizeBucket昇順で返す（空セルは含めない）。
 */
export function reviseSizeSuccessPatterns(runs: RunRecord[]): ReviseSizeSuccessCell[] {
  const completed = byIterationAsc(runs).filter(reachedVerify);
  const byKey = new Map<
    string,
    {
      reviseBucket: ReviseVerdictBucketLabel;
      sizeBucket: ChangeSizeBucketLabel;
      mergedCount: number;
      iterations: number[];
    }
  >();

  for (const run of completed) {
    const reviseBucket = reviseVerdictBucket(run.reviseCycles);
    const sizeBucket = changeSizeBucket(run.changedLines);
    const key = `${reviseBucket}|${sizeBucket}`;
    let entry = byKey.get(key);
    if (!entry) {
      entry = { reviseBucket, sizeBucket, mergedCount: 0, iterations: [] };
      byKey.set(key, entry);
    }
    if (run.verdict === 'merged') entry.mergedCount++;
    entry.iterations.push(run.iteration);
  }

  return [...byKey.values()]
    .map((entry) => {
      const total = entry.iterations.length;
      return {
        reviseBucket: entry.reviseBucket,
        sizeBucket: entry.sizeBucket,
        total,
        mergedCount: entry.mergedCount,
        mergeRate: entry.mergedCount / total,
        pattern: classifySuccessPattern(entry.mergedCount, total),
        iterations: entry.iterations,
      };
    })
    .sort((a, b) => {
      const reviseDiff =
        REVISE_VERDICT_BUCKET_ORDER.indexOf(a.reviseBucket) - REVISE_VERDICT_BUCKET_ORDER.indexOf(b.reviseBucket);
      if (reviseDiff !== 0) return reviseDiff;
      return CHANGE_SIZE_BUCKET_ORDER.indexOf(a.sizeBucket) - CHANGE_SIZE_BUCKET_ORDER.indexOf(b.sizeBucket);
    });
}

export interface SizeBucketReviseStat {
  sizeBucket: ChangeSizeBucketLabel;
  total: number;
  /** 区分内の平均変更行数（表示用の代表値） */
  avgChangedLines: number;
  avgReviseCycles: number;
  medianReviseCycles: number;
  /** 該当した反復番号（昇順） */
  iterations: number[];
}

/** サイズ区分ごとの revise 回数の平均・中央値。failed run（changedLines sentinel 0）は除外し、出現した区分だけを順に返す。 */
export function reviseCyclesBySizeBucket(runs: RunRecord[]): SizeBucketReviseStat[] {
  const completed = byIterationAsc(runs).filter(reachedVerify);

  return CHANGE_SIZE_BUCKET_ORDER.map((bucket) => {
    const bucketRuns = completed.filter((r) => changeSizeBucket(r.changedLines) === bucket);
    return {
      sizeBucket: bucket,
      total: bucketRuns.length,
      avgChangedLines: mean(bucketRuns.map((r) => r.changedLines)),
      avgReviseCycles: mean(bucketRuns.map((r) => r.reviseCycles)),
      medianReviseCycles: median(bucketRuns.map((r) => r.reviseCycles)),
      iterations: bucketRuns.map((r) => r.iteration).sort((a, b) => a - b),
    };
  }).filter((stat) => stat.total > 0);
}

/** 区分ごとの反復数がこの値未満ならカーブ形状は判定しない（外れ値ノイズを避ける） */
export const REVISE_SIZE_CURVE_MIN_SAMPLES = 3;

/** 2区間の傾き差の絶対値がこの値未満なら「ほぼ比例（線形）」とみなす */
export const REVISE_SIZE_CURVE_FLAT_THRESHOLD = 0.5;

/**
 * convex: 増分が拡大（非線形に悪化） / concave: 増分が縮小（伸びが頭打ち） / linear: 増分がほぼ一定
 * insufficient-data: 区分が欠けている、または REVISE_SIZE_CURVE_MIN_SAMPLES 未満の区分がある
 */
export type ReviseSizeCurveShape = 'convex' | 'concave' | 'linear' | 'insufficient-data';

export interface ReviseSizeCurveSignal {
  buckets: SizeBucketReviseStat[];
  shape: ReviseSizeCurveShape;
  /** medium.avgReviseCycles - small.avgReviseCycles。判定不能なら null */
  smallToMediumDelta: number | null;
  /** large.avgReviseCycles - medium.avgReviseCycles。判定不能なら null */
  mediumToLargeDelta: number | null;
  /** mediumToLargeDelta - smallToMediumDelta。正なら convex、負なら concave */
  accelerationDelta: number | null;
}

function reviseSizeCurveShape(accelerationDelta: number): ReviseSizeCurveShape {
  if (Math.abs(accelerationDelta) < REVISE_SIZE_CURVE_FLAT_THRESHOLD) return 'linear';
  return accelerationDelta > 0 ? 'convex' : 'concave';
}

/**
 * small→medium→large の増分（傾き）を比較し、revise回数の伸びが加速/減速/比例のどれかを判定する。
 * 3区分すべてが REVISE_SIZE_CURVE_MIN_SAMPLES 以上のサンプルを持つ場合のみ判定する。
 */
export function reviseCyclesSizeCurve(runs: RunRecord[]): ReviseSizeCurveSignal {
  const buckets = reviseCyclesBySizeBucket(runs);
  const byLabel = new Map(buckets.map((b) => [b.sizeBucket, b]));
  const small = byLabel.get('small');
  const medium = byLabel.get('medium');
  const large = byLabel.get('large');
  const insufficient = { buckets, shape: 'insufficient-data' as const, smallToMediumDelta: null, mediumToLargeDelta: null, accelerationDelta: null };

  if (!small || !medium || !large) return insufficient;
  if ([small, medium, large].some((b) => b.total < REVISE_SIZE_CURVE_MIN_SAMPLES)) return insufficient;

  const smallToMediumDelta = medium.avgReviseCycles - small.avgReviseCycles;
  const mediumToLargeDelta = large.avgReviseCycles - medium.avgReviseCycles;
  const accelerationDelta = mediumToLargeDelta - smallToMediumDelta;

  return {
    buckets,
    shape: reviseSizeCurveShape(accelerationDelta),
    smallToMediumDelta,
    mediumToLargeDelta,
    accelerationDelta,
  };
}

export interface ReviseCycleCostRecoveryBucket {
  bucket: ReviseVerdictBucketLabel;
  /** このbucketに属した反復数 */
  count: number;
  totalCostUsd: number;
  meanCostUsd: number;
  medianCostUsd: number;
  minCostUsd: number;
  maxCostUsd: number;
  p90CostUsd: number;
  /** verdict === 'merged' だった件数 */
  mergedCount: number;
  /** 0..1. mergedCount / count。「このbucketで消費したコストのうちmergeに到達した割合」＝回収効率 */
  recoveryRate: number;
  /** merge到達1件あたりの平均コスト(USD)。totalCostUsd / mergedCount。mergedCount=0ならnull（回収実績なし） */
  usdPerMergedIteration: number | null;
  /** 該当した反復番号（昇順） */
  iterations: number[];
}

/**
 * revise回数(bucket: 0/1/2/3+)ごとの API 呼び出しコスト(cost.totalUsd)分布と、
 * そのコストが実際に merge へ回収された割合（回収効率）。
 * reviseVerdictMatrix は revise回数×verdictの「件数」分布を見るのに対し、こちらは
 * 件数ではなくコスト（金額）そのものの分布を見る。costEfficiency/costBreakdown は
 * revise回数で束ねずコスト全体を集計するため、「revise回数が多い反復ほどコストが
 * 嵩み、かつmergeに至る割合(回収効率)が下がる」という revise回数依存の傾向を
 * 読み取れない。cost は cost.totalUsd（builder+adversary+ideation合算）を使う。
 * costEfficiency と同じ理由で、verdictに関係なく実際に消費された金額をそのまま
 * 分子に含める（failed/abandoned のコストも「回収できなかった支出」として bucket の
 * 分布に含める必要があるため）。
 * bucketはデータに実際に出現したものだけを、reviseVerdictMatrix と同じ順序で返す。
 */
export function reviseCycleCostRecovery(runs: RunRecord[]): ReviseCycleCostRecoveryBucket[] {
  const byBucket = new Map<ReviseVerdictBucketLabel, { costs: number[]; mergedCount: number; iterations: number[] }>();

  for (const run of byIterationAsc(runs)) {
    const bucket = reviseVerdictBucket(run.reviseCycles);
    let entry = byBucket.get(bucket);
    if (!entry) {
      entry = { costs: [], mergedCount: 0, iterations: [] };
      byBucket.set(bucket, entry);
    }
    entry.costs.push(run.cost.totalUsd);
    if (run.verdict === 'merged') entry.mergedCount++;
    entry.iterations.push(run.iteration);
  }

  return [...byBucket.entries()]
    .map(([bucket, entry]) => {
      const sorted = [...entry.costs].sort((a, b) => a - b);
      const totalCostUsd = entry.costs.reduce((a, b) => a + b, 0);
      const count = entry.costs.length;
      return {
        bucket,
        count,
        totalCostUsd,
        meanCostUsd: mean(entry.costs),
        medianCostUsd: median(entry.costs),
        minCostUsd: sorted[0],
        maxCostUsd: sorted[sorted.length - 1],
        p90CostUsd: percentile(sorted, 90),
        mergedCount: entry.mergedCount,
        recoveryRate: count === 0 ? 0 : entry.mergedCount / count,
        usdPerMergedIteration: entry.mergedCount === 0 ? null : totalCostUsd / entry.mergedCount,
        iterations: entry.iterations,
      };
    })
    .sort((a, b) => REVISE_VERDICT_BUCKET_ORDER.indexOf(a.bucket) - REVISE_VERDICT_BUCKET_ORDER.indexOf(b.bucket));
}

export interface VerdictDurationSummary {
  verdict: Verdict;
  /** この verdict に該当した反復数 */
  count: number;
  /** 秒 */
  mean: number;
  /** 秒 */
  median: number;
  /** 秒 */
  min: number;
  /** 秒 */
  max: number;
  /** 該当した反復番号（昇順） */
  iterations: number[];
}

/** 平均所要時間が同値のときの表示順（VERDICT_REVISE_ORDER と同じ深刻度順に合わせる）。 */
const VERDICT_DURATION_ORDER: readonly Verdict[] = [
  'failed',
  'abandoned',
  'needs-human',
  'paused',
  'dry-run',
  'merged',
];

/**
 * verdict別のCI/ゲート通過時間(durationSec)の分布。CycleTimeTrendPanel は全反復を通した
 * 時系列トレンドしか見せないため、「どの verdict に落ち着いた反復が時間を要しているか」を
 * 比較できない。reviseCyclesByVerdict と同様、durationSec は verdict に関係なく全 run で
 * 必ず記録される（failed でもクラッシュするまでの経過時間として意味を持つ）ため、
 * reviseCyclesByModel と異なり failed run も除外せず独立したグループとして扱う。
 */
export function durationByVerdict(runs: RunRecord[]): VerdictDurationSummary[] {
  const byVerdict = new Map<Verdict, { values: number[]; iterations: number[] }>();

  for (const run of byIterationAsc(runs)) {
    let entry = byVerdict.get(run.verdict);
    if (!entry) {
      entry = { values: [], iterations: [] };
      byVerdict.set(run.verdict, entry);
    }
    entry.values.push(run.durationSec);
    entry.iterations.push(run.iteration);
  }

  return [...byVerdict.entries()]
    .map(([verdict, entry]) => ({
      verdict,
      count: entry.values.length,
      mean: mean(entry.values),
      median: median(entry.values),
      min: Math.min(...entry.values),
      max: Math.max(...entry.values),
      iterations: entry.iterations,
    }))
    .sort((a, b) => {
      if (b.mean !== a.mean) return b.mean - a.mean;
      return VERDICT_DURATION_ORDER.indexOf(a.verdict) - VERDICT_DURATION_ORDER.indexOf(b.verdict);
    });
}

export interface VerdictMergePathLengthSummary {
  verdict: Verdict;
  /** この verdict に該当し、かつ後続に merged 反復が存在した(経路長を計算できた)反復数 */
  count: number;
  mean: number;
  median: number;
  min: number;
  max: number;
  /** 該当した反復番号（昇順） */
  iterations: number[];
}

/** 平均経路長が同値のときの表示順（VERDICT_REVISE_ORDER と同じ深刻度順に合わせる）。 */
const VERDICT_MERGE_PATH_LENGTH_ORDER: readonly Verdict[] = [
  'failed',
  'abandoned',
  'needs-human',
  'paused',
  'dry-run',
  'merged',
];

/**
 * merged 以外の verdict で終わった反復から、次に merged が現れる反復まで何反復かかったか
 * （＝「マージまでの経路長」）を、その反復自身の verdict別に集計する。durationByVerdict/
 * reviseCyclesByVerdict が「その反復自身の実測値」をverdict別に比較するのに対し、
 * こちらは「そこからどれだけ経路を辿れば merge に辿り着くか」という前方参照の指標であり、
 * まだ merged に至っていない末尾の反復（このデータの範囲内に後続の merged が一つも
 * 存在しない反復）は経路長を計算できないため対象外とする（gateReasonRecoverySteps の
 * recovered=false と同じ理由: 結末がまだ分からないものを混ぜると平均が意味を持たない）。
 * merged 自身は既に merge 済みであり経路長という概念が適用されないため、集計対象にも
 * 結果にも現れない。
 * 経路長は iteration 番号の差ではなく sorted 配列上の位置の差で数える。これにより
 * 不正レコードの読み飛ばし等で iteration 番号に欠番があっても実際に挟まった反復数と
 * 一致する。平均経路長が長い（＝mergeから遠い）verdictほど上に表示される。
 */
export function mergePathLengthByVerdict(runs: RunRecord[]): VerdictMergePathLengthSummary[] {
  const sorted = byIterationAsc(runs);
  const byVerdict = new Map<Verdict, { values: number[]; iterations: number[] }>();

  for (let i = 0; i < sorted.length; i++) {
    const run = sorted[i];
    if (run.verdict === 'merged') continue;

    let nextMergedIdx = -1;
    for (let j = i + 1; j < sorted.length; j++) {
      if (sorted[j].verdict === 'merged') {
        nextMergedIdx = j;
        break;
      }
    }
    if (nextMergedIdx === -1) continue;

    let entry = byVerdict.get(run.verdict);
    if (!entry) {
      entry = { values: [], iterations: [] };
      byVerdict.set(run.verdict, entry);
    }
    entry.values.push(nextMergedIdx - i);
    entry.iterations.push(run.iteration);
  }

  return [...byVerdict.entries()]
    .map(([verdict, entry]) => ({
      verdict,
      count: entry.values.length,
      mean: mean(entry.values),
      median: median(entry.values),
      min: Math.min(...entry.values),
      max: Math.max(...entry.values),
      iterations: entry.iterations,
    }))
    .sort((a, b) => {
      if (b.mean !== a.mean) return b.mean - a.mean;
      return VERDICT_MERGE_PATH_LENGTH_ORDER.indexOf(a.verdict) - VERDICT_MERGE_PATH_LENGTH_ORDER.indexOf(b.verdict);
    });
}

export interface ModelEffectivenessSummary {
  model: string;
  /** この model が builder として使われた反復数（verdict に関係なく全件） */
  count: number;
  /** develop にマージされた割合 0..1。分母は全件（verdict は必ず記録されるため） */
  mergeRate: number;
  /** adversary が approve した割合 0..1。分母は verify に到達した反復のみ */
  approvalRate: number;
  /** e2e が失敗した割合 0..1。分母は approvalRate と同じ母集団 */
  e2eFailureRate: number;
  /** verify に到達した反復での平均 revise 回数 */
  avgReviseCycles: number;
  /** verify に到達した反復での平均カバレッジ(%) */
  avgCoveragePct: number;
  /** 反復1件あたりの平均コスト(USD)。コストは verdict に関係なく発生するため全件が母集団 */
  avgCostUsd: number;
  /** 該当した反復番号（昇順） */
  iterations: number[];
}

/**
 * builder に使われたモデル別の「効果」測定（モデル選択の意思決定に使う比較指標）。
 * reviseCyclesByModel が revise 回数の分布だけを見るのに対し、こちらはマージ率・承認率・
 * e2e失敗率・コストまで含めた総合比較を行う。builder が実際にコードを書き、verdict/
 * cost/reviseCycles を左右する役割であるため、costBreakdown.byModel（builder/adversary/
 * ideation の全役割を合算）とは異なり run.models.builder のみで集計する。
 * マージ率の降順（同値はモデル名の昇順）で、効果が高いモデルから並べる。
 */
export function modelEffectiveness(runs: RunRecord[]): ModelEffectivenessSummary[] {
  const byModel = new Map<string, RunRecord[]>();

  for (const run of byIterationAsc(runs)) {
    const model = run.models.builder;
    const list = byModel.get(model);
    if (list) {
      list.push(run);
    } else {
      byModel.set(model, [run]);
    }
  }

  return [...byModel.entries()]
    .map(([model, modelRuns]) => {
      const completed = modelRuns.filter(reachedVerify);
      const mergedCount = modelRuns.filter((r) => r.verdict === 'merged').length;
      const approvedCount = completed.filter((r) => r.adversary.approved).length;
      const e2eFailedCount = completed.filter((r) => !r.verify.e2ePassed).length;
      return {
        model,
        count: modelRuns.length,
        mergeRate: mergedCount / modelRuns.length,
        approvalRate: completed.length === 0 ? 0 : approvedCount / completed.length,
        e2eFailureRate: completed.length === 0 ? 0 : e2eFailedCount / completed.length,
        avgReviseCycles: mean(completed.map((r) => r.reviseCycles)),
        avgCoveragePct: mean(completed.map((r) => r.verify.coveragePct)),
        avgCostUsd: mean(modelRuns.map((r) => r.cost.totalUsd)),
        iterations: modelRuns.map((r) => r.iteration),
      };
    })
    .sort((a, b) => {
      if (b.mergeRate !== a.mergeRate) return b.mergeRate - a.mergeRate;
      return a.model.localeCompare(b.model);
    });
}

export interface IssueLabelSuccessRate {
  label: string;
  /** この label が付いた issue を扱った反復数（1つの issue が複数 label を持つ場合、各labelの分母にそれぞれ数える） */
  count: number;
  /** developへマージされた件数 */
  mergedCount: number;
  /** マージされた割合 0..1 */
  successRate: number;
  /** 該当した反復番号（昇順） */
  iterations: number[];
}

/**
 * issue に付与された GitHub label 別に、その label を持つ issue を扱った反復が
 * 実際に develop へマージされた割合（成功率）を集計する。1つの issue は複数の
 * label を持ちうるため、該当する全ての label のバケットにその反復を数える。
 * 例外で issue を特定できず label が空配列の反復（data/runs/0018.json 等）は、
 * どのカテゴリにも属さないためどのバケットにも数えない。
 * 成功率降順（同値は label 名の昇順）で、成功しやすいカテゴリから並べる。
 */
export function issueLabelSuccessRates(runs: RunRecord[]): IssueLabelSuccessRate[] {
  const byLabel = new Map<string, RunRecord[]>();

  for (const run of byIterationAsc(runs)) {
    for (const label of run.issue.labels) {
      const list = byLabel.get(label);
      if (list) {
        list.push(run);
      } else {
        byLabel.set(label, [run]);
      }
    }
  }

  return [...byLabel.entries()]
    .map(([label, labelRuns]) => {
      const mergedCount = labelRuns.filter((r) => r.verdict === 'merged').length;
      return {
        label,
        count: labelRuns.length,
        mergedCount,
        successRate: mergedCount / labelRuns.length,
        iterations: labelRuns.map((r) => r.iteration),
      };
    })
    .sort((a, b) => {
      if (b.successRate !== a.successRate) return b.successRate - a.successRate;
      return a.label.localeCompare(b.label);
    });
}

export interface IssueLabelQualityRecoveryRow {
  label: string;
  /** この label が付いた issue を扱った反復数（issueLabelSuccessRates と同じ数え方） */
  count: number;
  /** verify まで到達した反復数（reachedVerify）。approvalRate の分母 */
  completedCount: number;
  /** adversary が approve した割合 0..1 ＝「提案品質」。completedCount=0ならnull（測定不可） */
  approvalRate: number | null;
  /** developへマージされた件数 */
  mergedCount: number;
  /** 0..1. mergedCount / count。reviseCycleCostRecoveryと同じ定義の「回収効率」 */
  recoveryRate: number;
  /** この label の反復が消費した合計コスト(USD) */
  totalCostUsd: number;
  /** マージ1件あたりの平均コスト(USD)。totalCostUsd / mergedCount。mergedCount=0ならnull（回収実績なし） */
  usdPerMergedIteration: number | null;
  /** 該当した反復番号（昇順） */
  iterations: number[];
}

/**
 * issueLabelSuccessRates が issue label（課題型）別のマージ率だけを見ていたのに対し、
 * こちらは同じ label 単位に「提案品質」（adversary の approval rate）と「回収効率」
 * （reviseCycleCostRecovery と同じ定義の mergedCount/count、および merge 1件あたりの
 * コスト）を組み合わせたマトリクスにする。label が空配列の反復（issue を特定できな
 * かった反復。data/runs/0018.json 等）はissueLabelSuccessRatesと同じ理由でどのバケット
 * にも属さない。approvalRateはmodelEffectivenessと同じ理由でreachedVerifyな反復のみ
 * 対象にする（adversary.approvedはfailed runでは測定されなかったsentinel値のため）。
 * mergedCount/recoveryRate/totalCostUsdはverdictに関係なく全反復を対象にする
 * （failed/abandonedのコストも「回収できなかった支出」として含める必要があるため）。
 * 回収効率降順、同値はlabel名昇順で並べる。
 */
export function issueLabelQualityRecoveryMatrix(runs: RunRecord[]): IssueLabelQualityRecoveryRow[] {
  const byLabel = new Map<string, RunRecord[]>();

  for (const run of byIterationAsc(runs)) {
    for (const label of run.issue.labels) {
      const list = byLabel.get(label);
      if (list) {
        list.push(run);
      } else {
        byLabel.set(label, [run]);
      }
    }
  }

  return [...byLabel.entries()]
    .map(([label, labelRuns]) => {
      const completed = labelRuns.filter(reachedVerify);
      const mergedCount = labelRuns.filter((r) => r.verdict === 'merged').length;
      const totalCostUsd = labelRuns.reduce((sum, r) => sum + r.cost.totalUsd, 0);
      return {
        label,
        count: labelRuns.length,
        completedCount: completed.length,
        approvalRate:
          completed.length === 0 ? null : completed.filter((r) => r.adversary.approved).length / completed.length,
        mergedCount,
        recoveryRate: mergedCount / labelRuns.length,
        totalCostUsd,
        usdPerMergedIteration: mergedCount === 0 ? null : totalCostUsd / mergedCount,
        iterations: labelRuns.map((r) => r.iteration),
      };
    })
    .sort((a, b) =>
      b.recoveryRate !== a.recoveryRate ? b.recoveryRate - a.recoveryRate : a.label.localeCompare(b.label),
    );
}

export interface ModelIssueLabelSuccessCell {
  label: string;
  /** このmodel×labelの組み合わせを扱った反復数 */
  count: number;
  mergedCount: number;
  /** 0..1 */
  successRate: number;
  /** 該当した反復番号（昇順） */
  iterations: number[];
}

export interface ModelIssueLabelSuccessRow {
  model: string;
  /** このmodelがbuilderとして扱った、label付きissueの反復数（cellsのcount合計とは、1反復が複数labelを持てば一致しない） */
  totalCount: number;
  /** 実際に出現した(model,label)の組み合わせだけを、成功率降順（同値はlabel名昇順）で持つ */
  cells: ModelIssueLabelSuccessCell[];
}

/**
 * builder モデル × issue label の2次元クロス集計。modelEffectiveness が builder モデル別、
 * issueLabelSuccessRates が issue label 別と、それぞれ1次元でしか見ていなかった成功率
 * （developへのマージ率）を掛け合わせ、「どのモデルが、どの課題型（label）で強い/弱いか」を
 * 一望できるようにする。issueLabelSuccessRates と同じ理由で、labelが空配列の反復
 * （例外でissueを特定できなかった反復。data/runs/0018.json等）はどの(model,label)セルにも
 * 属さない。この関数ではさらにmodel行自体からも除外する。もし含めてしまうと、その反復が
 * どのcellにも現れないのにtotalCountだけ加算され、「内訳(cells)の合計と行全体の総数が
 * 食い違う行」に見えてしまうため。
 * 行はtotalCount降順（同値はmodel名昇順）。各行内のセルは成功率降順（同値はlabel名昇順）で、
 * issueLabelSuccessRatesと同じ並び方を踏襲する。
 */
export function modelIssueLabelSuccessMatrix(runs: RunRecord[]): ModelIssueLabelSuccessRow[] {
  const byModel = new Map<string, RunRecord[]>();

  for (const run of byIterationAsc(runs)) {
    if (run.issue.labels.length === 0) continue;
    const model = run.models.builder;
    const list = byModel.get(model);
    if (list) {
      list.push(run);
    } else {
      byModel.set(model, [run]);
    }
  }

  return [...byModel.entries()]
    .map(([model, modelRuns]) => {
      const byLabel = new Map<string, RunRecord[]>();
      for (const run of modelRuns) {
        for (const label of run.issue.labels) {
          const list = byLabel.get(label);
          if (list) {
            list.push(run);
          } else {
            byLabel.set(label, [run]);
          }
        }
      }

      const cells: ModelIssueLabelSuccessCell[] = [...byLabel.entries()]
        .map(([label, labelRuns]) => {
          const mergedCount = labelRuns.filter((r) => r.verdict === 'merged').length;
          return {
            label,
            count: labelRuns.length,
            mergedCount,
            successRate: mergedCount / labelRuns.length,
            iterations: labelRuns.map((r) => r.iteration),
          };
        })
        .sort((a, b) =>
          b.successRate !== a.successRate ? b.successRate - a.successRate : a.label.localeCompare(b.label),
        );

      return { model, totalCount: modelRuns.length, cells };
    })
    .sort((a, b) => (b.totalCount !== a.totalCount ? b.totalCount - a.totalCount : a.model.localeCompare(b.model)));
}

export interface ModelConfidenceWeightedScore {
  model: string;
  /** この model が builder として使われた反復数（verdict に関係なく全件） */
  count: number;
  /** 観測されたマージ率 0..1。母数が小さいほど1件の結果で暴れる（例: 1件でmerged なら100%） */
  rawMergeRate: number;
  /**
   * 信頼度加重（ベイズ平均）後のマージ率 0..1。
   * (count * rawMergeRate + CONFIDENCE_PRIOR_WEIGHT * globalMeanMergeRate) / (count + CONFIDENCE_PRIOR_WEIGHT)
   * で計算し、件数が少ないモデルほど全体平均（事前分布）側に引き寄せる。
   */
  weightedScore: number;
  /**
   * rawMergeRate をどれだけ信用できるかの目安 0..1。count / (count + CONFIDENCE_PRIOR_WEIGHT)。
   * count が CONFIDENCE_PRIOR_WEIGHT と同数のとき 0.5（生の値と事前平均を五分五分で混ぜている状態）。
   */
  confidence: number;
  /** 該当した反復番号（昇順） */
  iterations: number[];
}

/**
 * modelEffectiveness の rawMergeRate（マージ率の単純比率）は、反復数が少ないモデルほど
 * 1件の結果で大きく振れる（1件しかない新モデルが merged 1件なら「マージ率100%」と表示され、
 * 実績十分な既存モデルより優れて見えてしまう）。これを緩和するため、件数が少ないモデルの
 * スコアを全体平均（事前分布）側にベイズ的に縮約した重み付きスコアを算出する。
 * CONFIDENCE_PRIOR_WEIGHT は「全体平均と同じ重みを持たせる仮想サンプル数」。値が大きいほど
 * 縮約が強くかかる。runs が空なら空配列を返す。
 * weightedScore の降順（同値はモデル名の昇順）で、信頼して良い順に並べる。
 */
const CONFIDENCE_PRIOR_WEIGHT = 5;

export function modelConfidenceWeightedScores(
  runs: RunRecord[],
  priorWeight: number = CONFIDENCE_PRIOR_WEIGHT,
): ModelConfidenceWeightedScore[] {
  if (runs.length === 0) return [];

  const byModel = new Map<string, RunRecord[]>();
  for (const run of byIterationAsc(runs)) {
    const model = run.models.builder;
    const list = byModel.get(model);
    if (list) {
      list.push(run);
    } else {
      byModel.set(model, [run]);
    }
  }

  const globalMergedCount = runs.filter((r) => r.verdict === 'merged').length;
  const globalMeanMergeRate = globalMergedCount / runs.length;

  return [...byModel.entries()]
    .map(([model, modelRuns]) => {
      const count = modelRuns.length;
      const mergedCount = modelRuns.filter((r) => r.verdict === 'merged').length;
      const rawMergeRate = mergedCount / count;
      const weightedScore =
        (count * rawMergeRate + priorWeight * globalMeanMergeRate) / (count + priorWeight);
      return {
        model,
        count,
        rawMergeRate,
        weightedScore,
        confidence: count / (count + priorWeight),
        iterations: modelRuns.map((r) => r.iteration),
      };
    })
    .sort((a, b) => {
      if (b.weightedScore !== a.weightedScore) return b.weightedScore - a.weightedScore;
      return a.model.localeCompare(b.model);
    });
}

export interface ModelEfficiencyEntry {
  model: string;
  /** この role でこの model が使われた反復数（verdict に関係なく全件） */
  count: number;
  /** develop にマージされた割合 0..1。全 role 共通で verdict === 'merged' の定義を使うため role 間で横並び比較できる */
  mergeRate: number;
  /**
   * この role・この model が実際に消費したコスト(USD)合計。costBreakdown.byModel は
   * 役割をまたいで同じモデルのコストを合算するが、こちらは role 単体のコストのみを見る
   * （同じモデルが builder と adversary の両方で使われていても混ぜない）。
   */
  totalCostUsd: number;
  /** totalCostUsd / count */
  avgCostUsd: number;
  /** totalCostUsd / マージ件数。マージ件数が0のときは0除算を避けて null */
  costPerMergedRunUsd: number | null;
  /** 該当した反復番号（昇順） */
  iterations: number[];
}

export interface ModelEfficiencyByRole {
  role: CostRole;
  entries: ModelEfficiencyEntry[];
}

function roleCostOf(run: RunRecord, role: CostRole): number {
  switch (role) {
    case 'builder':
      return run.cost.builderUsd;
    case 'adversary':
      return run.cost.adversaryUsd;
    case 'ideation':
      return run.cost.ideationUsd;
    case 'planner':
      return run.cost.plannerUsd ?? 0;
  }
}

/**
 * モデルの「コスト」と「成功率」を role(builder/adversary/ideation) × model という
 * 2軸で分解する。costBreakdown.byModel は役割をまたいで同じモデル名のコストを合算して
 * しまい、modelEffectiveness は builder 役割の反復しか見ない。この2つの隙間を埋め、
 * 「その role でその model が使われた反復のうちどれだけ merged に到達したか(成功率)」と
 * 「その role が実際に消費したコスト(役割別。他roleと合算しない)」を role ごとに分解して
 * 並べる。mergeRate は全 role で同じ verdict 定義を使うため role 間でも横並び比較できる
 * （builder の成功=直接コード生成の成否、adversary/ideation の成功=そのモデルが関わった
 * 反復が結果的に merged まで到達した割合、という間接指標になる）。
 * runs が空なら空配列を返す（role を3件返しても中身が空で無意味なため）。
 * role ごとの entries は mergeRate 降順・同値はモデル名昇順。
 */
export function modelEfficiencyByRole(runs: RunRecord[]): ModelEfficiencyByRole[] {
  if (runs.length === 0) return [];

  const sorted = byIterationAsc(runs);

  // モデル別（run.models[role]）に集計するため、モデル名が記録されている役割のみ対象。
  // planner は models に対応キーを持たないので含めない（byRole 総額には costBreakdown で計上済み）。
  return MODEL_ATTRIBUTED_ROLES.map((role) => {
    const byModel = new Map<
      string,
      { count: number; mergedCount: number; costUsd: number; iterations: number[] }
    >();

    for (const run of sorted) {
      const model = run.models[role];
      let entry = byModel.get(model);
      if (!entry) {
        entry = { count: 0, mergedCount: 0, costUsd: 0, iterations: [] };
        byModel.set(model, entry);
      }
      entry.count++;
      if (run.verdict === 'merged') entry.mergedCount++;
      entry.costUsd += roleCostOf(run, role);
      entry.iterations.push(run.iteration);
    }

    const entries: ModelEfficiencyEntry[] = [...byModel.entries()]
      .map(([model, e]) => ({
        model,
        count: e.count,
        mergeRate: e.mergedCount / e.count,
        totalCostUsd: e.costUsd,
        avgCostUsd: e.costUsd / e.count,
        costPerMergedRunUsd: e.mergedCount === 0 ? null : e.costUsd / e.mergedCount,
        iterations: e.iterations,
      }))
      .sort((a, b) => {
        if (b.mergeRate !== a.mergeRate) return b.mergeRate - a.mergeRate;
        return a.model.localeCompare(b.model);
      });

    return { role, entries };
  });
}

export type CostRoleBiasLevel = 'high' | 'moderate' | 'none';

export interface ModelCostRoleBiasEntry {
  model: string;
  /** builder役でこのmodelが使われた反復数 */
  builderCount: number;
  /** builder役での平均コスト(USD)。builderCount===0のときは0 */
  builderAvgUsd: number;
  /** adversary役でこのmodelが使われた反復数 */
  adversaryCount: number;
  /** adversary役での平均コスト(USD)。adversaryCount===0のときは0 */
  adversaryAvgUsd: number;
  /** builderAvgUsd - adversaryAvgUsd */
  deltaUsd: number;
  /** 大きい方÷小さい方。両役割とも1件以上でなければ比較不能として null */
  ratio: number | null;
  /** 平均コストが高い側の役割。ratioがnullなら null */
  biasedRole: 'builder' | 'adversary' | null;
  level: CostRoleBiasLevel;
}

/**
 * 同一モデルが builder 役と adversary 役の両方で使われた実績を突き合わせ、
 * 役割間で実コストに偏りが無いかを検出する。片方の役割でしか登場しないモデルは
 * 比較不能として ratio=null, level='none' で返す（データが無いことを「偏りなし」と
 * 混同しないよう biasedRole も null にする）。
 * 閾値: ratio>=1.5 で 'high'、>=1.2 で 'moderate'、それ未満は 'none'。
 * runs が空なら空配列を返す。結果は |deltaUsd| 降順（同値はモデル名昇順）。
 */
export function modelCostRoleBias(runs: RunRecord[]): ModelCostRoleBiasEntry[] {
  if (runs.length === 0) return [];

  const byModel = new Map<
    string,
    { builderCount: number; builderCostUsd: number; adversaryCount: number; adversaryCostUsd: number }
  >();

  const getEntry = (model: string) => {
    let entry = byModel.get(model);
    if (!entry) {
      entry = { builderCount: 0, builderCostUsd: 0, adversaryCount: 0, adversaryCostUsd: 0 };
      byModel.set(model, entry);
    }
    return entry;
  };

  for (const run of runs) {
    const builderEntry = getEntry(run.models.builder);
    builderEntry.builderCount++;
    builderEntry.builderCostUsd += run.cost.builderUsd;

    const adversaryEntry = getEntry(run.models.adversary);
    adversaryEntry.adversaryCount++;
    adversaryEntry.adversaryCostUsd += run.cost.adversaryUsd;
  }

  const result: ModelCostRoleBiasEntry[] = [...byModel.entries()].map(([model, e]) => {
    const builderAvgUsd = e.builderCount === 0 ? 0 : e.builderCostUsd / e.builderCount;
    const adversaryAvgUsd = e.adversaryCount === 0 ? 0 : e.adversaryCostUsd / e.adversaryCount;

    let ratio: number | null = null;
    let biasedRole: 'builder' | 'adversary' | null = null;
    if (e.builderCount > 0 && e.adversaryCount > 0) {
      const hi = Math.max(builderAvgUsd, adversaryAvgUsd);
      const lo = Math.min(builderAvgUsd, adversaryAvgUsd);
      ratio = lo === 0 ? null : hi / lo;
      if (builderAvgUsd !== adversaryAvgUsd) {
        biasedRole = builderAvgUsd > adversaryAvgUsd ? 'builder' : 'adversary';
      }
    }

    const level: CostRoleBiasLevel = ratio === null ? 'none' : ratio >= 1.5 ? 'high' : ratio >= 1.2 ? 'moderate' : 'none';

    return {
      model,
      builderCount: e.builderCount,
      builderAvgUsd,
      adversaryCount: e.adversaryCount,
      adversaryAvgUsd,
      deltaUsd: builderAvgUsd - adversaryAvgUsd,
      ratio,
      biasedRole,
      level,
    };
  });

  return result.sort((a, b) => {
    const diff = Math.abs(b.deltaUsd) - Math.abs(a.deltaUsd);
    if (diff !== 0) return diff;
    return a.model.localeCompare(b.model);
  });
}

export interface BuilderModelSwitchSegment {
  model: string;
  /** この区間の最初の反復番号 */
  fromIteration: number;
  /** この区間の最後の反復番号 */
  toIteration: number;
  /** この区間の反復数（verdict に関係なく全件） */
  count: number;
  /** develop にマージされた割合 0..1。分母は区間内の全件 */
  mergeRate: number;
  /** adversary が approve した割合 0..1。分母は区間内で verify に到達した反復のみ */
  approvalRate: number;
}

export interface BuilderModelSwitchComparison {
  /** 何回目の切り替えか（1始まり） */
  switchIndex: number;
  before: BuilderModelSwitchSegment;
  after: BuilderModelSwitchSegment;
  /** after.approvalRate - before.approvalRate（pt換算前、0..1スケールの差） */
  approvalRateDelta: number;
  /** after.mergeRate - before.mergeRate（pt換算前、0..1スケールの差） */
  mergeRateDelta: number;
  approvalVerdict: ComparisonVerdict;
  mergeVerdict: ComparisonVerdict;
}

function toBuilderModelSwitchSegment(model: string, segmentRuns: RunRecord[]): BuilderModelSwitchSegment {
  const completed = segmentRuns.filter(reachedVerify);
  const approvedCount = completed.filter((r) => r.adversary.approved).length;
  const mergedCount = segmentRuns.filter((r) => r.verdict === 'merged').length;
  return {
    model,
    fromIteration: segmentRuns[0].iteration,
    toIteration: segmentRuns[segmentRuns.length - 1].iteration,
    count: segmentRuns.length,
    mergeRate: mergedCount / segmentRuns.length,
    approvalRate: completed.length === 0 ? 0 : approvedCount / completed.length,
  };
}

/**
 * Builder に使われたモデルが iteration 順で切り替わった各タイミングを「A/Bテスト」として
 * 直前・直後の承認率・マージ率を突き合わせる。modelEffectiveness / ModelApprovalMergeComparisonPanel
 * が時系列を無視してモデルごとに全反復を合算するのに対し、こちらは「切り替え直前の連続区間(A)」対
 * 「切り替え直後の連続区間(B)」という発生順を保った比較に特化する。同じモデルが後で再登板した場合
 * （A→B→A のような揺り戻し）は、そのたびに独立した切り替えイベントとして扱う（=A の合算はしない）。
 * 切り替えが1回も無い（builder が同一モデルのまま）場合は比較対象が無いため空配列を返す。
 */
export function builderModelSwitchComparisons(runs: RunRecord[]): BuilderModelSwitchComparison[] {
  const sorted = byIterationAsc(runs);
  if (sorted.length === 0) return [];

  const segments: { model: string; runs: RunRecord[] }[] = [];
  for (const run of sorted) {
    const lastSegment = segments[segments.length - 1];
    if (lastSegment && lastSegment.model === run.models.builder) {
      lastSegment.runs.push(run);
    } else {
      segments.push({ model: run.models.builder, runs: [run] });
    }
  }

  if (segments.length < 2) return [];

  const comparisons: BuilderModelSwitchComparison[] = [];
  for (let i = 1; i < segments.length; i++) {
    const before = toBuilderModelSwitchSegment(segments[i - 1].model, segments[i - 1].runs);
    const after = toBuilderModelSwitchSegment(segments[i].model, segments[i].runs);
    const approvalRateDelta = after.approvalRate - before.approvalRate;
    const mergeRateDelta = after.mergeRate - before.mergeRate;
    comparisons.push({
      switchIndex: i,
      before,
      after,
      approvalRateDelta,
      mergeRateDelta,
      approvalVerdict: builderMetricVerdict(approvalRateDelta, false),
      mergeVerdict: builderMetricVerdict(mergeRateDelta, false),
    });
  }
  return comparisons;
}

export interface IdeationFailureSummary {
  /** ideation が実際に実行された反復数（cost.ideationUsd > 0）。ready が既に足りていて
   *  ideation 自体がスキップされた反復（ideationUsd === 0）は分母に含めない。 */
  attempted: number;
  /** attempted のうち、次の issue を1件も生成できなかった（nextIssues が空）反復数 */
  failed: number;
  /** 0..1。attempted が0のときは0 */
  failureRate: number;
  /** 失敗した反復番号（昇順） */
  failedIterations: number[];
}

/**
 * ideation（バックログ補充）が実行されたにもかかわらず次の issue を1件も生成できな
 * かった反復の割合。orchestrator/loop.py の _refuel_backlog は ready が
 * ideation_low_water を満たしていれば ideation を呼ばず (0.0, []) を返す一方、
 * ideation_runner が例外を投げた場合も同じ (0.0, []) を返す。つまり
 * ideationUsd === 0 の反復は「未実行（不要）」と「実行したが例外で落ちた」を区別
 * できないため、この指標の母集団には含めない（誤って「失敗」に数えて実際には
 * ideation 自体が不要だった反復を汚染しないため）。ideationUsd > 0 は
 * run_agent の呼び出しが実際にコストを消費して完了したことを意味するので、
 * その中で nextIssues が空なら「呼べたが提案を1件も出せなかった」実際の失敗。
 */
export function ideationFailureSummary(runs: RunRecord[]): IdeationFailureSummary {
  const attempted = byIterationAsc(runs).filter((r) => r.cost.ideationUsd > 0);
  const failedRuns = attempted.filter((r) => r.nextIssues.length === 0);
  return {
    attempted: attempted.length,
    failed: failedRuns.length,
    failureRate: attempted.length === 0 ? 0 : failedRuns.length / attempted.length,
    failedIterations: failedRuns.map((r) => r.iteration),
  };
}

/**
 * ideation 失敗率の累積推移(0..100)。ideation が実行された反復（cost.ideationUsd > 0）
 * だけを対象に、iteration 昇順でその時点までの累積失敗率を点として持つ。
 * 最終点は ideationFailureSummary(runs).failureRate * 100 と一致する。
 */
export function ideationFailureRateTrend(runs: RunRecord[]): TrendPoint[] {
  const attempted = byIterationAsc(runs).filter((r) => r.cost.ideationUsd > 0);
  let failedCount = 0;
  return attempted.map((r, i) => {
    if (r.nextIssues.length === 0) failedCount++;
    return { iteration: r.iteration, value: (failedCount / (i + 1)) * 100 };
  });
}

export interface E2eReviseCorrelation {
  /** verify に到達した run 数（passedCount + failedCount と一致） */
  sampleSize: number;
  /** e2e が成功した反復数 */
  passedCount: number;
  /** e2e が失敗した反復数 */
  failedCount: number;
  /** e2e成功群の平均revise回数。passedCountが0ならmean([])の定義通り0 */
  passedMeanRevise: number;
  /** e2e失敗群の平均revise回数。failedCountが0ならmean([])の定義通り0 */
  failedMeanRevise: number;
  /** failedMeanRevise - passedMeanRevise。正なら失敗群の方がrevise回数が多い */
  delta: number;
  /**
   * e2e失敗(1)/成功(0)とreviseCyclesのPearson相関係数(-1..1)。
   * どちらかの分散が0（全run同じe2e結果、または全run同じrevise回数）だと
   * 定義できないためnull。
   */
  correlationCoefficient: number | null;
  /** e2eが失敗した反復番号（昇順） */
  failedIterations: number[];
}

function pearsonCorrelation(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 2) return null;
  const meanX = mean(xs);
  const meanY = mean(ys);
  let numerator = 0;
  let denomX = 0;
  let denomY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    numerator += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }
  if (denomX === 0 || denomY === 0) return null;
  return numerator / Math.sqrt(denomX * denomY);
}

/**
 * E2Eテスト失敗とrevise回数の相関。reviseCyclesTrend/e2eFailureRateTrendと同じ
 * reachedVerifyの母集団（failed run はrevise/e2e結果が測定されなかったsentinelを
 * 持つため除外）で、e2e成功/失敗の2群のreviseCycles平均を比較し、e2e失敗を1・
 * 成功を0としたPearson相関係数も算出する。相関係数は「revise回数が多いほどe2eが
 * 失敗しやすい」という関係の強さの目安であり、平均比較（delta）は同じ関係を
 * 群ごとの実測値として補足する。
 */
export function e2eFailureReviseCorrelation(runs: RunRecord[]): E2eReviseCorrelation {
  const completed = byIterationAsc(runs).filter(reachedVerify);
  const passed = completed.filter((r) => r.verify.e2ePassed);
  const failed = completed.filter((r) => !r.verify.e2ePassed);

  const xs = completed.map((r) => (r.verify.e2ePassed ? 0 : 1));
  const ys = completed.map((r) => r.reviseCycles);

  const passedMeanRevise = mean(passed.map((r) => r.reviseCycles));
  const failedMeanRevise = mean(failed.map((r) => r.reviseCycles));

  return {
    sampleSize: completed.length,
    passedCount: passed.length,
    failedCount: failed.length,
    passedMeanRevise,
    failedMeanRevise,
    delta: failedMeanRevise - passedMeanRevise,
    correlationCoefficient: pearsonCorrelation(xs, ys),
    failedIterations: failed.map((r) => r.iteration),
  };
}

export interface E2eDiffSizeCorrelation {
  /** verify に到達した run 数（passedCount + failedCount と一致） */
  sampleSize: number;
  /** e2e が成功した反復数 */
  passedCount: number;
  /** e2e が失敗した反復数 */
  failedCount: number;
  /** e2e成功群の平均変更行数。passedCountが0ならmean([])の定義通り0 */
  passedMeanChangedLines: number;
  /** e2e失敗群の平均変更行数。failedCountが0ならmean([])の定義通り0 */
  failedMeanChangedLines: number;
  /** failedMeanChangedLines - passedMeanChangedLines。正なら失敗群の方が変更行数が多い */
  delta: number;
  /**
   * e2e失敗(1)/成功(0)とchangedLinesのPearson相関係数(-1..1)。
   * どちらかの分散が0（全run同じe2e結果、または全run同じ変更行数）だと
   * 定義できないためnull。
   */
  correlationCoefficient: number | null;
  /** e2eが失敗した反復番号（昇順） */
  failedIterations: number[];
}

/**
 * E2Eテスト失敗とコード変更範囲(diff size = changedLines)の相関。
 * e2eFailureReviseCorrelationと同じreachedVerifyの母集団で、e2e成功/失敗の
 * 2群のchangedLines平均を比較し、e2e失敗を1・成功を0としたPearson相関係数も
 * 算出する。「変更範囲が大きいほどE2Eが失敗しやすいか」の目安。
 */
export function e2eFailureDiffSizeCorrelation(runs: RunRecord[]): E2eDiffSizeCorrelation {
  const completed = byIterationAsc(runs).filter(reachedVerify);
  const passed = completed.filter((r) => r.verify.e2ePassed);
  const failed = completed.filter((r) => !r.verify.e2ePassed);

  const xs = completed.map((r) => (r.verify.e2ePassed ? 0 : 1));
  const ys = completed.map((r) => r.changedLines);

  const passedMeanChangedLines = mean(passed.map((r) => r.changedLines));
  const failedMeanChangedLines = mean(failed.map((r) => r.changedLines));

  return {
    sampleSize: completed.length,
    passedCount: passed.length,
    failedCount: failed.length,
    passedMeanChangedLines,
    failedMeanChangedLines,
    delta: failedMeanChangedLines - passedMeanChangedLines,
    correlationCoefficient: pearsonCorrelation(xs, ys),
    failedIterations: failed.map((r) => r.iteration),
  };
}

/** 偏相関が単純相関のこの割合未満に縮んだら「Builder稼働量による見かけ上の相関(交絡)」とみなす閾値。 */
export const E2E_BUILDER_WORKLOAD_SEPARATION_CONFOUND_RATIO = 0.5;

export type E2eBuilderWorkloadSeparationVerdict = 'independent' | 'confounded' | 'undetermined';

export interface E2eBuilderWorkloadSeparation {
  sampleSize: number;
  /** e2e失敗(1)/成功(0)と変更行数(changedLines)の単純Pearson相関(-1..1)。分散0ならnull。 */
  diffSizeCorrelation: number | null;
  /** e2e失敗(1)/成功(0)とBuilder稼働量(cost.builderUsd)の単純Pearson相関(-1..1)。分散0ならnull。 */
  builderWorkloadCorrelation: number | null;
  /** changedLinesとcost.builderUsdの単純Pearson相関(-1..1)。交絡の強さの目安。分散0ならnull。 */
  diffSizeWorkloadCorrelation: number | null;
  /**
   * Builder稼働量を固定した上でのe2e失敗とdiff sizeの偏相関。diffSizeCorrelationとほぼ同じなら
   * diff sizeは独立要因、0に近づくほど交絡（見かけ上の相関）だった疑いが強い。単純相関のいずれかが
   * null、またはrXZ/rYZが±1にごく近く分母が不安定な場合はnull。
   */
  diffSizePartialCorrelation: number | null;
  /** diff sizeを固定した上でのe2e失敗とBuilder稼働量の偏相関。同様の解釈。 */
  builderWorkloadPartialCorrelation: number | null;
  /** diffSizePartialCorrelation/diffSizeCorrelation の縮み幅による判定。算出不能ならundetermined。 */
  verdict: E2eBuilderWorkloadSeparationVerdict;
}

function partialCorrelation(rXY: number | null, rXZ: number | null, rYZ: number | null): number | null {
  if (rXY === null || rXZ === null || rYZ === null) return null;
  // rXZ/rYZ が±1にごく近い(ほぼ完全な共線性)だと浮動小数点誤差でradicandが不安定になるため、閾値未満はnull。
  const radicand = (1 - rXZ * rXZ) * (1 - rYZ * rYZ);
  return radicand < 1e-9 ? null : (rXY - rXZ * rYZ) / Math.sqrt(radicand);
}

function e2eBuilderWorkloadSeparationVerdict(rXY: number | null, partial: number | null): E2eBuilderWorkloadSeparationVerdict {
  if (rXY === null || partial === null || Math.abs(rXY) < 1e-9) return 'undetermined';
  const shrinkRatio = Math.abs(partial) / Math.abs(rXY);
  return shrinkRatio >= E2E_BUILDER_WORKLOAD_SEPARATION_CONFOUND_RATIO ? 'independent' : 'confounded';
}

/**
 * e2eFailureDiffSizeCorrelationが示す「diff sizeが大きいほどe2eが失敗しやすい」相関が、実は
 * Builder稼働量(cost.builderUsd)という別軸に引きずられた見かけ上の関係でないかを、偏相関係数
 * （もう一方を統計的に固定した相関）で切り分ける。母集団はreachedVerifyで絞る（failed runは
 * changedLines/builderUsdが測定されなかったsentinel値のため）。
 */
export function e2eFailureBuilderWorkloadSeparation(runs: RunRecord[]): E2eBuilderWorkloadSeparation {
  const completed = byIterationAsc(runs).filter(reachedVerify);
  const e2eFail = completed.map((r) => (r.verify.e2ePassed ? 0 : 1));
  const diffSize = completed.map((r) => r.changedLines);
  const workload = completed.map((r) => r.cost.builderUsd);

  const diffSizeCorrelation = pearsonCorrelation(e2eFail, diffSize);
  const builderWorkloadCorrelation = pearsonCorrelation(e2eFail, workload);
  const diffSizeWorkloadCorrelation = pearsonCorrelation(diffSize, workload);
  const diffSizePartialCorrelation = partialCorrelation(diffSizeCorrelation, builderWorkloadCorrelation, diffSizeWorkloadCorrelation);
  const builderWorkloadPartialCorrelation = partialCorrelation(builderWorkloadCorrelation, diffSizeCorrelation, diffSizeWorkloadCorrelation);

  return {
    sampleSize: completed.length,
    diffSizeCorrelation,
    builderWorkloadCorrelation,
    diffSizeWorkloadCorrelation,
    diffSizePartialCorrelation,
    builderWorkloadPartialCorrelation,
    verdict: e2eBuilderWorkloadSeparationVerdict(diffSizeCorrelation, diffSizePartialCorrelation),
  };
}

/** カップリング判定に使う直近/直前ウィンドウの反復数（既定値）。 */
export const BUILDER_VOLUME_APPROVAL_COUPLING_WINDOW = 3;
/** 直近/直前ウィンドウの平均変更行数の変化率(%)がこの値未満なら生成量は「変化なし」として扱う。 */
export const BUILDER_VOLUME_APPROVAL_COUPLING_VOLUME_FLAT_THRESHOLD_PCT = 5;
/** 直近/直前ウィンドウの承認率の変化幅(0..1スケール)がこの値未満なら承認率は「変化なし」として扱う。 */
export const BUILDER_VOLUME_APPROVAL_COUPLING_APPROVAL_FLAT_THRESHOLD = 0.05;

/**
 * direct:  生成量(changedLines)と承認率が直近/直前ウィンドウ間で同方向に動いている（両方増加/両方減少）。
 * inverse: 生成量と承認率が逆方向に動いている（例: 生成量が増えるほど承認率が下がる、またはその逆）。
 * flat:    生成量・承認率のどちらか（または両方）の変化が閾値未満で、方向を判定するには小さすぎる。
 */
export type BuilderVolumeApprovalCouplingDirection = 'direct' | 'inverse' | 'flat';

export interface BuilderVolumeApprovalCouplingSignal {
  /** 相関係数算出に使った verify到達 run 数 */
  sampleSize: number;
  /**
   * verify到達run全体を対象にした changedLines と adversary.approved(1/0) の
   * Pearson相関係数(-1..1)。どちらかの分散が0（全run同じ変更行数、または全run同じ
   * 承認結果）だと定義できないためnull。
   */
  correlationCoefficient: number | null;
  /** 実際に比較に使ったウィンドウ幅（データが少ない場合は BUILDER_VOLUME_APPROVAL_COUPLING_WINDOW 未満になりうる） */
  windowSize: number;
  /** windowSize が BUILDER_VOLUME_APPROVAL_COUPLING_WINDOW に満たない（信頼度が低い）かどうか */
  partial: boolean;
  recentAvgChangedLines: number;
  previousAvgChangedLines: number;
  /** 0..1 */
  recentApprovalRate: number;
  /** 0..1 */
  previousApprovalRate: number;
  /** (recentAvgChangedLines - previousAvgChangedLines) / previousAvgChangedLines * 100。previousAvgChangedLinesが0ならnull */
  volumeDeltaPct: number | null;
  /** recentApprovalRate - previousApprovalRate（0..1スケール） */
  approvalRateDelta: number;
  direction: BuilderVolumeApprovalCouplingDirection;
  /** 直近ウィンドウに含まれる反復番号（昇順） */
  recentIterations: number[];
  /** 直前ウィンドウに含まれる反復番号（昇順） */
  previousIterations: number[];
}

function builderVolumeApprovalCouplingDirection(
  volumeDeltaPct: number | null,
  approvalRateDelta: number,
): BuilderVolumeApprovalCouplingDirection {
  if (volumeDeltaPct === null) return 'flat';
  if (
    Math.abs(volumeDeltaPct) < BUILDER_VOLUME_APPROVAL_COUPLING_VOLUME_FLAT_THRESHOLD_PCT ||
    Math.abs(approvalRateDelta) < BUILDER_VOLUME_APPROVAL_COUPLING_APPROVAL_FLAT_THRESHOLD
  ) {
    return 'flat';
  }
  return Math.sign(volumeDeltaPct) === Math.sign(approvalRateDelta) ? 'direct' : 'inverse';
}

/**
 * Builderが1反復あたりに生成するコード量(changedLines)と、その反復がAdversaryに承認
 * された割合(承認率)のカップリング（連動）分析。
 * e2eFailureDiffSizeCorrelation が changedLines と2値結果(e2e成功/失敗)の相関を反復
 * 横断で1つの係数に集約するのに対し、こちらは cycleTimeTrendSignal と同じローリング窓
 * （直近window反復 vs 直前window反復）で「生成量が増えている時期に承認率も一緒に
 * 動いているか」を時系列の方向として捉える。あわせて関係の強さの目安として、
 * verify到達run全体でのPearson相関係数（changedLinesとadversary.approvedの0/1）も返す。
 * reachedVerifyで絞るのは他のchangedLines系関数と同じ理由（failed runはchangedLinesが
 * 測定されなかったsentinel 0のため）。比較対象となる「直前」ウィンドウが取れない
 * （run が1件以下）場合はnull。
 */
export function builderVolumeApprovalCoupling(runs: RunRecord[]): BuilderVolumeApprovalCouplingSignal | null {
  const completed = byIterationAsc(runs).filter(reachedVerify);
  if (completed.length < 2) return null;

  const xs = completed.map((r) => r.changedLines);
  const ys = completed.map((r) => (r.adversary.approved ? 1 : 0));
  const correlationCoefficient = pearsonCorrelation(xs, ys);

  const windowSize = Math.min(BUILDER_VOLUME_APPROVAL_COUPLING_WINDOW, Math.floor(completed.length / 2));
  const recent = completed.slice(completed.length - windowSize);
  const previous = completed.slice(completed.length - windowSize * 2, completed.length - windowSize);

  const approvalRateOf = (group: RunRecord[]) => group.filter((r) => r.adversary.approved).length / group.length;

  const recentAvgChangedLines = mean(recent.map((r) => r.changedLines));
  const previousAvgChangedLines = mean(previous.map((r) => r.changedLines));
  const recentApprovalRate = approvalRateOf(recent);
  const previousApprovalRate = approvalRateOf(previous);
  const volumeDeltaPct =
    previousAvgChangedLines === 0
      ? null
      : ((recentAvgChangedLines - previousAvgChangedLines) / previousAvgChangedLines) * 100;
  const approvalRateDelta = recentApprovalRate - previousApprovalRate;

  return {
    sampleSize: completed.length,
    correlationCoefficient,
    windowSize,
    partial: windowSize < BUILDER_VOLUME_APPROVAL_COUPLING_WINDOW,
    recentAvgChangedLines,
    previousAvgChangedLines,
    recentApprovalRate,
    previousApprovalRate,
    volumeDeltaPct,
    approvalRateDelta,
    direction: builderVolumeApprovalCouplingDirection(volumeDeltaPct, approvalRateDelta),
    recentIterations: recent.map((r) => r.iteration),
    previousIterations: previous.map((r) => r.iteration),
  };
}

/**
 * Adversary承認コメント(adversary.summary)の実効文字数。表示上意味を持たない前後の
 * 空白は VerdictSummaryBubble の bubbleText と同じく trim してから数える。
 */
function adversarySummaryLength(run: RunRecord): number {
  return run.adversary.summary.trim().length;
}

/**
 * Adversary承認コメントの文字数推移。`failed` run の summary は「レビューに到達
 * しなかった」等の定型文（sentinel）であり実際のレビュー内容ではないため、他の
 * trend 系関数と同じ reachedVerify で除外する。
 */
export function adversarySummaryLengthTrend(runs: RunRecord[]): TrendPoint[] {
  return byIterationAsc(runs)
    .filter(reachedVerify)
    .map((r) => ({ iteration: r.iteration, value: adversarySummaryLength(r) }));
}

/** Adversaryコメント文字数トレンド判定に使う直近/直前ウィンドウの反復数（既定値）。 */
export const ADVERSARY_COMMENT_TREND_WINDOW = 3;
/**
 * 直近ウィンドウの平均文字数が直前ウィンドウよりこの割合(%)以上変化して初めて
 * 「長文化」「短文化」と判定する。これ未満は「横ばい」として扱う
 * （cycleTimeTrendSignal と同じ考え方だが、コメント文字数は所要時間よりブレが
 * 大きいため、閾値は cycleTimeTrendSignal の5%より緩い10%にしている）。
 */
export const ADVERSARY_COMMENT_TREND_FLAT_THRESHOLD_PCT = 10;

/** lengthening: コメントが長文化（説明が増えている）。shortening: 短文化。 */
export type AdversaryCommentTrendDirection = 'lengthening' | 'shortening' | 'flat';

export interface AdversaryCommentTrendSignal {
  /** 実際に比較に使ったウィンドウ幅（データが少ない場合は ADVERSARY_COMMENT_TREND_WINDOW 未満になりうる） */
  windowSize: number;
  /** windowSize が ADVERSARY_COMMENT_TREND_WINDOW に満たない（信頼度が低い）かどうか */
  partial: boolean;
  recentAvgLength: number;
  previousAvgLength: number;
  /** recentAvgLength - previousAvgLength */
  deltaLength: number;
  /** deltaLength / previousAvgLength * 100。previousAvgLength が 0 のときは定義できないため null */
  deltaPct: number | null;
  direction: AdversaryCommentTrendDirection;
  /** 直近ウィンドウに含まれる反復番号（昇順） */
  recentIterations: number[];
  /** 直前ウィンドウに含まれる反復番号（昇順） */
  previousIterations: number[];
}

function adversaryCommentDirection(
  deltaLength: number,
  previousAvgLength: number,
): AdversaryCommentTrendDirection {
  if (previousAvgLength === 0) return deltaLength === 0 ? 'flat' : 'lengthening';
  const deltaPct = (deltaLength / previousAvgLength) * 100;
  if (Math.abs(deltaPct) < ADVERSARY_COMMENT_TREND_FLAT_THRESHOLD_PCT) return 'flat';
  return deltaPct > 0 ? 'lengthening' : 'shortening';
}

/**
 * Adversary承認コメントの文字数トレンド観測。cycleTimeTrendSignal と同じローリング窓
 * 比較（直近window/直前windowの平均）で、レビューコメントが長文化/短文化しているか
 * （横ばいも含め）を判定する。母集団は adversarySummaryLengthTrend と同じ
 * reachedVerify（failed run の summary は sentinel であり実測ではないため除外）。
 * 比較対象となる「直前」ウィンドウが取れない（対象反復が1件以下）場合は null。
 */
export function adversaryCommentTrendSignal(runs: RunRecord[]): AdversaryCommentTrendSignal | null {
  const completed = byIterationAsc(runs).filter(reachedVerify);
  if (completed.length < 2) return null;

  const windowSize = Math.min(ADVERSARY_COMMENT_TREND_WINDOW, Math.floor(completed.length / 2));
  const recent = completed.slice(completed.length - windowSize);
  const previous = completed.slice(completed.length - windowSize * 2, completed.length - windowSize);

  const recentAvgLength = mean(recent.map(adversarySummaryLength));
  const previousAvgLength = mean(previous.map(adversarySummaryLength));
  const deltaLength = recentAvgLength - previousAvgLength;

  return {
    windowSize,
    partial: windowSize < ADVERSARY_COMMENT_TREND_WINDOW,
    recentAvgLength,
    previousAvgLength,
    deltaLength,
    deltaPct: previousAvgLength === 0 ? null : (deltaLength / previousAvgLength) * 100,
    direction: adversaryCommentDirection(deltaLength, previousAvgLength),
    recentIterations: recent.map((r) => r.iteration),
    previousIterations: previous.map((r) => r.iteration),
  };
}

export interface AdversaryApprovalCommentStats {
  approvedCount: number;
  rejectedCount: number;
  approvedAvgLength: number;
  rejectedAvgLength: number;
  approvedMedianLength: number;
  rejectedMedianLength: number;
  /** rejectedAvgLength - approvedAvgLength。正なら却下時の方が説明が長い */
  delta: number;
}

/**
 * 承認(approved)/却下(not approved) でAdversaryコメントの文字数がどう違うかの比較。
 * reachedVerify で failed run（sentinel summary）を除外するのは
 * adversarySummaryLengthTrend と同じ理由。mean/median は空配列に対し 0 を返す
 * 定義（このファイル冒頭の mean/median）なので、承認/却下のどちらかが0件でも
 * NaN にならない。
 */
export function adversaryApprovalCommentStats(runs: RunRecord[]): AdversaryApprovalCommentStats {
  const completed = byIterationAsc(runs).filter(reachedVerify);
  const approvedLengths = completed.filter((r) => r.adversary.approved).map(adversarySummaryLength);
  const rejectedLengths = completed.filter((r) => !r.adversary.approved).map(adversarySummaryLength);
  const approvedAvgLength = mean(approvedLengths);
  const rejectedAvgLength = mean(rejectedLengths);

  return {
    approvedCount: approvedLengths.length,
    rejectedCount: rejectedLengths.length,
    approvedAvgLength,
    rejectedAvgLength,
    approvedMedianLength: median(approvedLengths),
    rejectedMedianLength: median(rejectedLengths),
    delta: rejectedAvgLength - approvedAvgLength,
  };
}

/** ダイジェストに表示する直近Adversaryコメントの最大件数。 */
export const ADVERSARY_COMMENT_DIGEST_LIMIT = 5;

export interface AdversaryCommentDigestEntry {
  iteration: number;
  issueNumber: number;
  issueTitle: string;
  approved: boolean;
  verdict: Verdict;
  summary: string;
  length: number;
}

/**
 * 直近Adversaryコメントの要約ダイジェスト。VerdictSummaryBubble が最新1件だけを
 * 吹き出し表示するのに対し、こちらは直近 ADVERSARY_COMMENT_DIGEST_LIMIT 件を新しい
 * 順に並べて一覧化し、トレンド（長文化/短文化）と合わせて「何が起きているか」を
 * 実際のコメント文面で裏付けられるようにする。reachedVerify で failed run を除外
 * するのは adversarySummaryLengthTrend と同じ理由。
 */
export function recentAdversaryComments(runs: RunRecord[]): AdversaryCommentDigestEntry[] {
  const completed = byIterationAsc(runs).filter(reachedVerify);
  return completed
    .slice(-ADVERSARY_COMMENT_DIGEST_LIMIT)
    .reverse()
    .map((r) => ({
      iteration: r.iteration,
      issueNumber: r.issue.number,
      issueTitle: r.issue.title,
      approved: r.adversary.approved,
      verdict: r.verdict,
      summary: r.adversary.summary.trim(),
      length: adversarySummaryLength(r),
    }));
}

/**
 * costPerApprovedPrTrend が返す点数の上限。CostEfficiencyPanel は各点を
 * flex-1 + gap-1 の棒として描画するため、run数が増えるほど棒1本あたりの
 * 幅が縮み、run数が数十〜百件規模になると隙間(gap)の合計だけでパネル幅を
 * 超えてしまい、末尾の棒の実描画幅が0になって非表示扱いになる
 * （e2e『Cost効率パネル』テストが最終点の棒を検出できなくなる）。
 * 直近 COST_PER_APPROVED_PR_TREND_LIMIT 件に絞ることで棒の最小幅を確保する。
 */
export const COST_PER_APPROVED_PR_TREND_LIMIT = 30;

/**
 * 承認PRあたり累計コストの推移。iteration 昇順に「その時点までの累計コスト ÷
 * その時点までの累計承認PR数」を各点に持つ。承認PRが1件も出ていない区間は
 * 分母が0で無意味なため、最初の承認PRが出た iteration 以降だけ点を持つ
 * （costTrend が全run区間で点を持つのとは異なる）。点数は直近
 * COST_PER_APPROVED_PR_TREND_LIMIT 件までに絞る（理由は同定数のコメント参照）。
 */
export function costPerApprovedPrTrend(runs: RunRecord[]): TrendPoint[] {
  let cumulativeCost = 0;
  let cumulativeApproved = 0;
  const points: TrendPoint[] = [];
  for (const r of byIterationAsc(runs)) {
    cumulativeCost += r.cost.totalUsd;
    if (isApprovedPr(r)) cumulativeApproved++;
    if (cumulativeApproved > 0) {
      // 浮動小数点の丸め誤差 (0.1+0.2 等) が積み上がるため、表示に不要な桁を丸めて除去する。
      const value = Math.round((cumulativeCost / cumulativeApproved) * 1e9) / 1e9;
      points.push({ iteration: r.iteration, value });
    }
  }
  return points.slice(-COST_PER_APPROVED_PR_TREND_LIMIT);
}

export interface IdeationBatchQuality {
  /** ideation を実行し issue を提案した反復番号 */
  iteration: number;
  /** この反復が提案した issue 数（nextIssues.length） */
  proposedCount: number;
  /** 提案 issue 1件あたりのideationコスト(USD) = cost.ideationUsd / proposedCount */
  costPerIssueUsd: number;
  /** 提案 issue のうち、実際に別反復として着手された（後続反復の issue.number に現れた）件数 */
  attemptedCount: number;
  /**
   * 着手された提案issueのうち、verify到達済みでadversaryが承認した割合(0..1)。
   * 1件も着手されていなければ null（まだ結果が出ていないだけ、と「全て却下された」を区別するため）。
   */
  childApprovalRate: number | null;
  /** 着手された提案issueのうち、developにマージされた割合(0..1)。着手0件ならnull */
  childMergeRate: number | null;
}

export interface IdeationCostQualityCorrelation {
  /** ideation を実行し、かつ1件以上提案した反復ごとの内訳。iteration昇順 */
  batches: IdeationBatchQuality[];
  /** 提案issue1件あたりコストと、着手後の承認率のPearson相関係数(-1..1)。算出可能なbatchが2件未満ならnull */
  costVsApprovalRateCorrelation: number | null;
  /** 相関算出に使ったbatch数（childApprovalRateがnullでないbatchの数） */
  approvalRateSampleSize: number;
  /** 提案issue1件あたりコストと、着手後のマージ率のPearson相関係数(-1..1)。算出可能なbatchが2件未満ならnull */
  costVsMergeRateCorrelation: number | null;
  /** 相関算出に使ったbatch数（childMergeRateがnullでないbatchの数） */
  mergeRateSampleSize: number;
}

/**
 * Ideation（バックログ補充）のコスト効率と、実際に提案したissueが後で着手されたときの
 * 生成品質（承認率・マージ率）の関連性分析。costEfficiency が「承認PR 1件あたりの実コスト」
 * という単一指標なのに対し、こちらは ideation が提案した issue の単価（安く大量提案 vs
 * 高くても厳選提案）と、その提案が実際に良い結果（承認・マージ）に繋がったかを反復ごとに
 * 対応付けて相関を見る。
 *
 * 「着手」は、提案した issue 番号が後続反復の issue.number として現れたことで判定する
 * （orchestrator は nextIssues をそのまま次の issue として起票するため、issue番号が
 * 実際の作業単位を一意に特定できる）。iteration > 提案元の iteration に限定するのは、
 * data/runs/0014.json のように nextIssues が提案元自身の issue番号を含む（同issueの
 * 再提案）ケースがあり、それを「自分自身が自分の提案に着手した」と誤カウントしないため。
 *
 * childMergeRate は e2eFailureReviseCorrelation 等と異なり reachedVerify で絞り込まない
 * （マージ判定は verdict なので failed run でも意味を持つ値が付く。costTrend と同じ理由）。
 * childApprovalRate は adversary.approved が failed run では測定されなかった sentinel の
 * ため、reachedVerify な child run のみを対象にする（approvalRateTrend と同じ理由）。
 */
export function ideationCostQualityCorrelation(runs: RunRecord[]): IdeationCostQualityCorrelation {
  const sorted = byIterationAsc(runs);

  const byIssueNumber = new Map<number, RunRecord[]>();
  for (const r of sorted) {
    const list = byIssueNumber.get(r.issue.number);
    if (list) {
      list.push(r);
    } else {
      byIssueNumber.set(r.issue.number, [r]);
    }
  }

  const proposingRuns = sorted.filter((r) => r.cost.ideationUsd > 0 && r.nextIssues.length > 0);

  const batches: IdeationBatchQuality[] = proposingRuns.map((r) => {
    const childRuns = r.nextIssues
      .flatMap((issueNumber) => byIssueNumber.get(issueNumber) ?? [])
      .filter((child) => child.iteration > r.iteration);
    const childCompleted = childRuns.filter(reachedVerify);

    return {
      iteration: r.iteration,
      proposedCount: r.nextIssues.length,
      costPerIssueUsd: r.cost.ideationUsd / r.nextIssues.length,
      attemptedCount: childRuns.length,
      childApprovalRate:
        childCompleted.length === 0
          ? null
          : childCompleted.filter((c) => c.adversary.approved).length / childCompleted.length,
      childMergeRate:
        childRuns.length === 0 ? null : childRuns.filter((c) => c.verdict === 'merged').length / childRuns.length,
    };
  });

  const approvalSamples = batches.filter((b) => b.childApprovalRate !== null);
  const mergeSamples = batches.filter((b) => b.childMergeRate !== null);

  return {
    batches,
    costVsApprovalRateCorrelation: pearsonCorrelation(
      approvalSamples.map((b) => b.costPerIssueUsd),
      approvalSamples.map((b) => b.childApprovalRate as number),
    ),
    approvalRateSampleSize: approvalSamples.length,
    costVsMergeRateCorrelation: pearsonCorrelation(
      mergeSamples.map((b) => b.costPerIssueUsd),
      mergeSamples.map((b) => b.childMergeRate as number),
    ),
    mergeRateSampleSize: mergeSamples.length,
  };
}

export interface IdeationProposalConsumptionRow {
  /** 提案されたissue番号 */
  issueNumber: number;
  /** 提案した(nextIssuesに含めた)反復番号 */
  proposedIteration: number;
  /** 提案時点の単価(USD) = 提案元反復の cost.ideationUsd ÷ 提案件数 */
  proposedCostUsd: number;
  /** 実際にissue.numberとして着手された反復番号。未着手ならnull */
  startIteration: number | null;
  /** 着手反復が実際に消費した総コスト(USD) = 着手反復の cost.totalUsd。未着手ならnull */
  actualCostUsd: number | null;
  /** 着手反復の結果。未着手ならnull */
  verdict: Verdict | null;
}

export interface IdeationProposalConsumption {
  /** 提案issueごとの対応行。提案された順（提案元反復のiteration昇順、同反復内はnextIssuesの記載順） */
  rows: IdeationProposalConsumptionRow[];
  /** ユニーク提案issue数 */
  proposedCount: number;
  /** 実際に着手された件数 */
  startedCount: number;
  /** 提案時点の単価の合計(USD)。着手有無を問わず全提案issue分を含む */
  proposedTotalUsd: number;
  /** 着手済みissueが実際に消費した総コスト(USD)の合計 */
  actualConsumedTotalUsd: number;
  /**
   * 着手済みissueに限定した「実消費 ÷ 提案時点コスト」の倍率。1より大きいほど、提案段階の
   * コスト単価に対して実際の生成コストが上回っていることを示す。着手0件、または着手済みissueの
   * 提案コスト合計が0ならnull。
   */
  consumptionRatio: number | null;
}

/**
 * Ideationが提案した issue と、その issue が実際に着手されたときに消費した実コストとの
 * 1件ずつの対応関係。ideationCostQualityCorrelation が反復(batch)単位で単価と承認率/マージ率の
 * 相関を見るのに対し、こちらは issue 単位で「見積り（提案時点の単価）」と「実績（着手反復の
 * cost.totalUsd）」を直接突き合わせる。着手判定・自己参照の除外は ideationCostQualityCorrelation /
 * ideationToStartLeadTimes と同じ（提案元より後のiterationでissue.numberとして現れた最初の反復）。
 */
export function ideationProposalConsumption(runs: RunRecord[]): IdeationProposalConsumption {
  const sorted = byIterationAsc(runs);

  const proposedBy = new Map<number, RunRecord>();
  for (const r of sorted) {
    if (r.cost.ideationUsd <= 0 || r.nextIssues.length === 0) continue;
    for (const issueNumber of r.nextIssues) {
      if (!proposedBy.has(issueNumber)) proposedBy.set(issueNumber, r);
    }
  }

  const startedBy = new Map<number, RunRecord>();
  for (const r of sorted) {
    const proposer = proposedBy.get(r.issue.number);
    if (!proposer || proposer.iteration >= r.iteration) continue;
    if (!startedBy.has(r.issue.number)) startedBy.set(r.issue.number, r);
  }

  const rows: IdeationProposalConsumptionRow[] = Array.from(proposedBy.entries()).map(([issueNumber, proposer]) => {
    const started = startedBy.get(issueNumber) ?? null;
    return {
      issueNumber,
      proposedIteration: proposer.iteration,
      proposedCostUsd: proposer.cost.ideationUsd / proposer.nextIssues.length,
      startIteration: started ? started.iteration : null,
      actualCostUsd: started ? started.cost.totalUsd : null,
      verdict: started ? started.verdict : null,
    };
  });

  const startedRows = rows.filter((r) => r.startIteration !== null);
  const proposedTotalUsd = rows.reduce((sum, r) => sum + r.proposedCostUsd, 0);
  const actualConsumedTotalUsd = startedRows.reduce((sum, r) => sum + (r.actualCostUsd as number), 0);
  const startedProposedTotalUsd = startedRows.reduce((sum, r) => sum + r.proposedCostUsd, 0);

  return {
    rows,
    proposedCount: rows.length,
    startedCount: startedRows.length,
    proposedTotalUsd,
    actualConsumedTotalUsd,
    consumptionRatio:
      startedRows.length === 0 || startedProposedTotalUsd === 0
        ? null
        : actualConsumedTotalUsd / startedProposedTotalUsd,
  };
}

export interface IdeationConfidenceTrendPoint {
  iteration: number;
  issueNumber: number;
  successCount: number;
  totalCount: number;
  /** 生の成功率 0..1 = successCount / totalCount */
  rawSuccessRate: number;
  /** modelConfidenceWeightedScores と同じ定義: totalCount / (totalCount + priorWeight) */
  confidence: number;
  /** ベイズ平均後の成功率 0..1 = (totalCount*rawSuccessRate + priorWeight*globalMeanSuccessRate) / (totalCount+priorWeight) */
  weightedScore: number;
}

/**
 * modelConfidenceWeightedScores(builderモデル別マージ率のベイズ縮約)と同じ考え方を、
 * Ideationの提案(nextIssues)が着手されmergedに至ったかという成功率に適用する。
 * 提案・着手の判定は ideationProposalConsumption と同一。着手済みissueを
 * startIteration 昇順に並べ、逐次的な累積 successCount/totalCount から各点を計算する。
 *
 * globalMeanSuccessRateは「着手済みissue自身の最終成功率」ではなく、modelConfidenceWeightedScores
 * が個々のモデルを全モデル込みのマージ率に縮約するのと同じく、全run(ideation発の着手issueに
 * 限らない)のマージ率を使う。着手issueの母集団自身を事前分布にすると、最終点では
 * successCount/totalCount が定義上そのままglobalMeanSuccessRateと一致してしまい、
 * priorWeightに関わらずweightedScore(最終点)=rawSuccessRate(最終点)という縮約が一切効かない
 * 恒等式になる（凡例の「最新X%」は常に生の成功率と同じ値を表示してしまう）。母集団を
 * 「全run」という外側の集合に置くことで、この最終点での退化を避ける。
 * 着手済みが0件なら空配列。
 */
export function ideationConfidenceTrend(
  runs: RunRecord[],
  priorWeight: number = CONFIDENCE_PRIOR_WEIGHT,
): IdeationConfidenceTrendPoint[] {
  const sorted = byIterationAsc(runs);

  const proposedBy = new Map<number, RunRecord>();
  for (const r of sorted) {
    if (r.cost.ideationUsd <= 0 || r.nextIssues.length === 0) continue;
    for (const issueNumber of r.nextIssues) {
      if (!proposedBy.has(issueNumber)) proposedBy.set(issueNumber, r);
    }
  }

  const startedBy = new Map<number, RunRecord>();
  for (const r of sorted) {
    const proposer = proposedBy.get(r.issue.number);
    if (!proposer || proposer.iteration >= r.iteration) continue;
    if (!startedBy.has(r.issue.number)) startedBy.set(r.issue.number, r);
  }

  const started = [...startedBy.entries()]
    .map(([issueNumber, run]) => ({ issueNumber, run }))
    .sort((a, b) => a.run.iteration - b.run.iteration);

  if (started.length === 0) return [];

  const overallMergedCount = sorted.filter((r) => r.verdict === 'merged').length;
  const globalMeanSuccessRate = overallMergedCount / sorted.length;

  let successCount = 0;
  return started.map(({ issueNumber, run }, idx) => {
    if (run.verdict === 'merged') successCount += 1;
    const totalCount = idx + 1;
    const rawSuccessRate = successCount / totalCount;
    const weightedScore =
      (totalCount * rawSuccessRate + priorWeight * globalMeanSuccessRate) / (totalCount + priorWeight);
    return {
      iteration: run.iteration,
      issueNumber,
      successCount,
      totalCount,
      rawSuccessRate,
      confidence: totalCount / (totalCount + priorWeight),
      weightedScore,
    };
  });
}

export interface IdeationToStartLeadTimePoint {
  issueNumber: number;
  /** issue を提案した(nextIssuesに含めた)反復番号 */
  proposedIteration: number;
  /** 提案時刻(提案元反復のfinishedAt) */
  proposedAt: string;
  /** issue.number として実際に着手された反復番号 */
  startIteration: number;
  /** 着手時刻(着手反復のstartedAt) */
  startedAt: string;
  /** 提案からの着手までのリードタイム(秒) = startedAt - proposedAt */
  leadTimeSec: number;
}

/**
 * Ideationが提案してから、実際にその issue が別反復として着手される(issue.number に
 * 現れる)までのリードタイム(秒)の一覧。issueResolutionTimeTrend が「クローズ」（merged/
 * abandoned）までを終点にするのに対し、こちらは「着手」（verdict を問わず後続反復が
 * issue.number として受け取った瞬間）を終点にする。ゲートの結果が出るまでの実行時間を含めず
 * 「バックログに積まれてからビルダーが手を付けるまで」だけを切り出すのが狙い。
 *
 * 「提案」は issueResolutionTimeTrend / ideationCostQualityCorrelation と同じく、issue番号が
 * 最初にどこかの反復の nextIssues に現れた時点（その反復の finishedAt）。「着手」は
 * ideationCostQualityCorrelation の attemptedCount と同じ判定（提案元より後のiterationで
 * issue.number として現れた最初の反復）だが、こちらは verdict を問わず reachedVerify の
 * 絞り込みもしない（failed でも「着手はした」という事実は変わらないため）。自己参照
 * （nextIssuesが提案元自身のissue番号を含む）を除外する理由も issueResolutionTimeTrend と同じ。
 * 複数回dispatchされたissueは最初の着手だけを1点として数える。
 */
export function ideationToStartLeadTimes(runs: RunRecord[]): IdeationToStartLeadTimePoint[] {
  const sorted = byIterationAsc(runs);

  const createdBy = new Map<number, RunRecord>();
  for (const r of sorted) {
    for (const issueNumber of r.nextIssues) {
      if (!createdBy.has(issueNumber)) createdBy.set(issueNumber, r);
    }
  }

  const startedIssueNumbers = new Set<number>();
  const points: IdeationToStartLeadTimePoint[] = [];

  for (const r of sorted) {
    const created = createdBy.get(r.issue.number);
    if (!created || created.iteration >= r.iteration) continue;
    if (startedIssueNumbers.has(r.issue.number)) continue;

    startedIssueNumbers.add(r.issue.number);
    const leadTimeSec = (new Date(r.startedAt).getTime() - new Date(created.finishedAt).getTime()) / 1000;
    points.push({
      issueNumber: r.issue.number,
      proposedIteration: created.iteration,
      proposedAt: created.finishedAt,
      startIteration: r.iteration,
      startedAt: r.startedAt,
      leadTimeSec,
    });
  }

  return points;
}

/** トレンド判定に使う直近/直前ウィンドウの着手件数(既定値)。issueResolutionTimeTrendSignal と揃えている。 */
export const IDEATION_TO_START_LEAD_TIME_TREND_WINDOW = 3;
/** 直近ウィンドウの平均が直前ウィンドウよりこの割合(%)以上変化して初めて増加/減少と判定する。 */
export const IDEATION_TO_START_LEAD_TIME_TREND_FLAT_THRESHOLD_PCT = 5;

/** increasing: 着手までのリードタイムが悪化(長期化)傾向。decreasing: 改善(短縮)傾向。 */
export type IdeationToStartLeadTimeTrendDirection = 'increasing' | 'decreasing' | 'flat';

export interface IdeationToStartLeadTimeTrendSignal {
  windowSize: number;
  partial: boolean;
  recentAvgSec: number;
  previousAvgSec: number;
  deltaSec: number;
  deltaPct: number | null;
  direction: IdeationToStartLeadTimeTrendDirection;
  recentIterations: number[];
  previousIterations: number[];
}

function ideationToStartLeadTimeDirection(
  deltaSec: number,
  previousAvgSec: number,
): IdeationToStartLeadTimeTrendDirection {
  if (previousAvgSec === 0) return deltaSec === 0 ? 'flat' : 'increasing';
  const deltaPct = (deltaSec / previousAvgSec) * 100;
  if (Math.abs(deltaPct) < IDEATION_TO_START_LEAD_TIME_TREND_FLAT_THRESHOLD_PCT) return 'flat';
  return deltaPct > 0 ? 'increasing' : 'decreasing';
}

/**
 * Ideation提案から着手までのリードタイムのトレンド観測。issueResolutionTimeTrendSignal と
 * 同じローリング窓比較（直近window件の平均 vs 直前window件の平均）を、
 * ideationToStartLeadTimes が返す着手済みissueの母集団（着手した順、= startIteration昇順）
 * に対して行う。比較対象となる「直前」ウィンドウが取れない（着手済みissueが1件以下）場合は
 * null。
 */
export function ideationToStartLeadTimeTrendSignal(runs: RunRecord[]): IdeationToStartLeadTimeTrendSignal | null {
  const points = ideationToStartLeadTimes(runs);
  if (points.length < 2) return null;

  const windowSize = Math.min(IDEATION_TO_START_LEAD_TIME_TREND_WINDOW, Math.floor(points.length / 2));
  const recent = points.slice(points.length - windowSize);
  const previous = points.slice(points.length - windowSize * 2, points.length - windowSize);

  const recentAvgSec = mean(recent.map((p) => p.leadTimeSec));
  const previousAvgSec = mean(previous.map((p) => p.leadTimeSec));
  const deltaSec = recentAvgSec - previousAvgSec;

  return {
    windowSize,
    partial: windowSize < IDEATION_TO_START_LEAD_TIME_TREND_WINDOW,
    recentAvgSec,
    previousAvgSec,
    deltaSec,
    deltaPct: previousAvgSec === 0 ? null : (deltaSec / previousAvgSec) * 100,
    direction: ideationToStartLeadTimeDirection(deltaSec, previousAvgSec),
    recentIterations: recent.map((p) => p.startIteration),
    previousIterations: previous.map((p) => p.startIteration),
  };
}

export interface IdeationStartSuccessSummary {
  /** Ideationが提案した(いずれかの反復のnextIssuesに現れた)ユニークissue数 */
  proposedTotal: number;
  /** 提案issueのうち、実際に別反復として着手された件数 */
  startedCount: number;
  /** 提案issueのうち、まだ一度も着手されていない件数 */
  notStartedCount: number;
  /** startedCount / proposedTotal。proposedTotal が0ならnull（提案自体が無い） */
  startRate: number | null;
  /** まだ着手されていない issue 番号(昇順)。バックログに滞留している提案 */
  notStartedIssueNumbers: number[];
}

/**
 * Ideationが提案したissueのうち、実際にどれだけの割合が着手（別反復のissue.numberとして
 * 実行）まで至ったかの着手成功率サマリー。ideationFailureSummary が「ideationが提案を0件
 * 出せたか」という生成側の失敗を見るのに対し、こちらは「生成された提案がバックログで
 * 放置されず実際に手が付けられたか」という消化側の成功率を見る。判定方法は
 * ideationToStartLeadTimes と同じ（提案元より後のiterationでissue.numberとして現れたか）。
 */
export function ideationStartSuccessSummary(runs: RunRecord[]): IdeationStartSuccessSummary {
  const sorted = byIterationAsc(runs);

  const createdBy = new Map<number, RunRecord>();
  for (const r of sorted) {
    for (const issueNumber of r.nextIssues) {
      if (!createdBy.has(issueNumber)) createdBy.set(issueNumber, r);
    }
  }

  const startedIssueNumbers = new Set(ideationToStartLeadTimes(runs).map((p) => p.issueNumber));
  const proposedIssueNumbers = [...createdBy.keys()];
  const notStartedIssueNumbers = proposedIssueNumbers
    .filter((issueNumber) => !startedIssueNumbers.has(issueNumber))
    .sort((a, b) => a - b);

  return {
    proposedTotal: proposedIssueNumbers.length,
    startedCount: startedIssueNumbers.size,
    notStartedCount: notStartedIssueNumbers.length,
    startRate: proposedIssueNumbers.length === 0 ? null : startedIssueNumbers.size / proposedIssueNumbers.length,
    notStartedIssueNumbers,
  };
}

/**
 * 提案されてからこの反復数以上経っても着手されなければ「ドロップ」と判定する猶予期間。
 * ideationStartSuccessSummary の notStartedIssueNumbers は「まだ着手されていない」を
 * 無条件に列挙するため、提案直後（まだバックログで順番待ちしているだけ）のissueまで
 * 「ドロップ」と誤認してしまう。猶予期間を設けることで「見送られた」issueだけを対象にする。
 */
export const IDEATION_DROP_STALENESS_ITERATIONS = 5;

/** ドロップ判定済みissueが末尾から何件連続したら「ドロップレート悪化」として発報するか。 */
export const IDEATION_DROP_RATE_STREAK_THRESHOLD = 2;

export interface IdeationDropJudgment {
  issueNumber: number;
  /** issue を提案した(nextIssuesに含めた)反復番号 */
  proposedIteration: number;
  status: 'started' | 'dropped';
  /** started の場合のみ、着手した反復番号 */
  startIteration: number | null;
  /** 提案から判定時点(startedならstartIteration、droppedならlatestIteration)までの反復数差 */
  ageIterations: number;
}

export interface IdeationDropRateSignal {
  staleAfterIterations: number;
  /** データセット中の最新反復番号(ドロップ判定の基準点) */
  latestIteration: number;
  /** 提案された(いずれかのnextIssuesに現れた)ユニークissue総数 */
  proposedTotal: number;
  /** 判定済み(着手 or ドロップが確定した)issue数。まだ猶予期間内の提案は含まない */
  judgedTotal: number;
  /** 判定済みのうち着手されたissue数 */
  startedCount: number;
  /** 判定済みのうちドロップと判定されたissue数 */
  droppedCount: number;
  /** 提案されたがまだ猶予期間内で判定できないissue数 */
  pendingCount: number;
  /** droppedCount / judgedTotal。judgedTotalが0ならnull(判定可能なissueがまだ無い) */
  dropRate: number | null;
  /** 提案順で末尾から連続してドロップと判定された件数 */
  streak: number;
  /** streak >= IDEATION_DROP_RATE_STREAK_THRESHOLD */
  triggered: boolean;
  /** streak 分のドロップ記録(提案順) */
  streakDrops: IdeationDropJudgment[];
  /** 判定済みの全ドロップ記録(提案順)。streakDropsより広く、過去分も含む */
  droppedIssues: IdeationDropJudgment[];
}

/**
 * Issue提案(ideationのnextIssues)から初着手までのドロップレート検知。
 * ideationStartSuccessSummary が「今この瞬間まだ着手されていない」を無条件に数えるのに
 * 対し、こちらは IDEATION_DROP_STALENESS_ITERATIONS 反復分の猶予を与えたうえで
 * 「見送られた(ドロップした)」issueだけを判定対象にし、さらに提案順で末尾から連続して
 * ドロップした件数(streak)を builderUtilizationDeclineSignal と同じトレイリング判定で
 * 見ることで「直近、提案しても拾われなくなってきている」傾向を検知する。
 * 提案が1件も無い場合は null。
 */
export function ideationDropRateSignal(runs: RunRecord[]): IdeationDropRateSignal | null {
  const sorted = byIterationAsc(runs);
  if (sorted.length === 0) return null;

  const createdBy = new Map<number, RunRecord>();
  for (const r of sorted) {
    for (const issueNumber of r.nextIssues) {
      if (!createdBy.has(issueNumber)) createdBy.set(issueNumber, r);
    }
  }
  if (createdBy.size === 0) return null;

  const latestIteration = sorted[sorted.length - 1].iteration;
  const startPoints = new Map(ideationToStartLeadTimes(runs).map((p) => [p.issueNumber, p]));

  const proposedEntries = [...createdBy.entries()].sort((a, b) => {
    const iterDiff = a[1].iteration - b[1].iteration;
    return iterDiff !== 0 ? iterDiff : a[0] - b[0];
  });

  const judgments: IdeationDropJudgment[] = [];
  for (const [issueNumber, created] of proposedEntries) {
    const startPoint = startPoints.get(issueNumber);
    if (startPoint) {
      judgments.push({
        issueNumber,
        proposedIteration: created.iteration,
        status: 'started',
        startIteration: startPoint.startIteration,
        ageIterations: startPoint.startIteration - created.iteration,
      });
      continue;
    }

    const age = latestIteration - created.iteration;
    if (age < IDEATION_DROP_STALENESS_ITERATIONS) continue;
    judgments.push({
      issueNumber,
      proposedIteration: created.iteration,
      status: 'dropped',
      startIteration: null,
      ageIterations: age,
    });
  }

  const droppedIssues = judgments.filter((j) => j.status === 'dropped');
  const startedCount = judgments.length - droppedIssues.length;

  let streak = 0;
  for (let i = judgments.length - 1; i >= 0; i--) {
    if (judgments[i].status !== 'dropped') break;
    streak++;
  }
  const streakDrops = streak === 0 ? [] : judgments.slice(judgments.length - streak);

  return {
    staleAfterIterations: IDEATION_DROP_STALENESS_ITERATIONS,
    latestIteration,
    proposedTotal: proposedEntries.length,
    judgedTotal: judgments.length,
    startedCount,
    droppedCount: droppedIssues.length,
    pendingCount: proposedEntries.length - judgments.length,
    dropRate: judgments.length === 0 ? null : droppedIssues.length / judgments.length,
    streak,
    triggered: streak >= IDEATION_DROP_RATE_STREAK_THRESHOLD,
    streakDrops,
    droppedIssues,
  };
}

export interface IdeationBatchDropQuality {
  /** ideation を実行し issue を提案した反復番号 */
  iteration: number;
  /** この反復が提案した issue 数（nextIssues.length） */
  proposedCount: number;
  /** 提案 issue 1件あたりのideationコスト(USD) = cost.ideationUsd / proposedCount */
  costPerIssueUsd: number;
  /** この反復が最初に提案した(createdByで重複排除した)issueのうち、猶予期間を過ぎて着手/ドロップが確定した件数 */
  judgedCount: number;
  /** judgedCountのうちドロップと判定された件数 */
  droppedCount: number;
  /** droppedCount / judgedCount。judgedCountが0ならnull（まだ判定できるissueが無いだけで、品質が低いわけではない） */
  dropRate: number | null;
}

export interface IdeationProposalQualityDropCorrelation {
  /** ideation を実行し、かつ1件以上提案した反復ごとの内訳。iteration昇順 */
  batches: IdeationBatchDropQuality[];
  /** 提案バッチ規模(proposedCount)とそのbatchのドロップ率のPearson相関係数(-1..1)。算出可能なbatchが2件未満ならnull */
  batchSizeVsDropRateCorrelation: number | null;
  /** 提案issue1件あたりコスト(単価)とそのbatchのドロップ率のPearson相関係数(-1..1) */
  costPerIssueVsDropRateCorrelation: number | null;
  /** 相関算出に使ったbatch数(dropRateがnullでないbatch数) */
  sampleSize: number;
}

/**
 * ideationCostQualityCorrelation が「着手された提案の承認率・マージ率」という着手後の
 * 品質を見るのに対し、こちらは ideationDropRateSignal と同じ着手/ドロップ判定を反復
 * (=1回にまとめて提案したbatch)単位に集計し、提案の「量」(proposedCount)や「単価」が
 * そもそも拾われる(着手される)かどうか自体と関係しているかを相関で見る。issue番号の
 * 重複排除は ideationDropRateSignal と同じ createdBy（最初の提案元）を使い、同じissueが
 * 複数回再提案されても最初の提案元batchにのみ帰属させ二重計上を避ける。
 */
export function ideationProposalQualityDropCorrelation(runs: RunRecord[]): IdeationProposalQualityDropCorrelation {
  const sorted = byIterationAsc(runs);
  const proposingRuns = sorted.filter((r) => r.cost.ideationUsd > 0 && r.nextIssues.length > 0);
  if (proposingRuns.length === 0) {
    return {
      batches: [],
      batchSizeVsDropRateCorrelation: null,
      costPerIssueVsDropRateCorrelation: null,
      sampleSize: 0,
    };
  }

  const createdBy = new Map<number, RunRecord>();
  for (const r of sorted) {
    for (const issueNumber of r.nextIssues) {
      if (!createdBy.has(issueNumber)) createdBy.set(issueNumber, r);
    }
  }

  const latestIteration = sorted[sorted.length - 1].iteration;
  const startPoints = new Map(ideationToStartLeadTimes(runs).map((p) => [p.issueNumber, p]));

  const judgedByIteration = new Map<number, { judged: number; dropped: number }>();
  for (const [issueNumber, created] of createdBy.entries()) {
    let entry = judgedByIteration.get(created.iteration);
    if (!entry) {
      entry = { judged: 0, dropped: 0 };
      judgedByIteration.set(created.iteration, entry);
    }
    if (startPoints.has(issueNumber)) {
      entry.judged++;
      continue;
    }
    const age = latestIteration - created.iteration;
    if (age < IDEATION_DROP_STALENESS_ITERATIONS) continue;
    entry.judged++;
    entry.dropped++;
  }

  const batches: IdeationBatchDropQuality[] = proposingRuns.map((r) => {
    const entry = judgedByIteration.get(r.iteration) ?? { judged: 0, dropped: 0 };
    return {
      iteration: r.iteration,
      proposedCount: r.nextIssues.length,
      costPerIssueUsd: r.cost.ideationUsd / r.nextIssues.length,
      judgedCount: entry.judged,
      droppedCount: entry.dropped,
      dropRate: entry.judged === 0 ? null : entry.dropped / entry.judged,
    };
  });

  const samples = batches.filter((b) => b.dropRate !== null);

  return {
    batches,
    batchSizeVsDropRateCorrelation: pearsonCorrelation(
      samples.map((b) => b.proposedCount),
      samples.map((b) => b.dropRate as number),
    ),
    costPerIssueVsDropRateCorrelation: pearsonCorrelation(
      samples.map((b) => b.costPerIssueUsd),
      samples.map((b) => b.dropRate as number),
    ),
    sampleSize: samples.length,
  };
}

/** 着手した反復の revise 回数がこれ以下で abandoned になった場合を「早期abandonment」とみなす。0回=一度もreviseせず即見送り。 */
export const EARLY_ABANDONMENT_MAX_REVISE_CYCLES = 0;
/** トレンド判定に使う直近/直前ウィンドウの着手件数。他のTrendSignal系と揃えている。 */
export const EARLY_ABANDONMENT_TREND_WINDOW = 3;
/** 直近ウィンドウの早期abandonment率が直前ウィンドウよりこのpt以上変化して初めて増加/減少と判定する。 */
export const EARLY_ABANDONMENT_TREND_FLAT_THRESHOLD_PT = 5;

export type EarlyAbandonmentTrendDirection = 'increasing' | 'decreasing' | 'flat';

export interface IdeationEarlyAbandonmentRun {
  issueNumber: number;
  /** issue を提案した(nextIssuesに含めた)反復番号 */
  proposedIteration: number;
  /** issue.number として実際に着手された反復番号 */
  startIteration: number;
  verdict: Verdict;
  reviseCycles: number;
  durationSec: number;
  /** verdict === 'abandoned' かつ reviseCycles <= EARLY_ABANDONMENT_MAX_REVISE_CYCLES */
  isEarlyAbandonment: boolean;
}

export interface IdeationEarlyAbandonmentSignal {
  maxReviseCycles: number;
  /** ideation提案経由で着手されたissue数（着手順、= startIteration昇順） */
  startedTotal: number;
  earlyAbandonedCount: number;
  earlyAbandonmentRate: number;
  /** 比較用: ideation提案が起源でない(人間作成等の)issueのうち着手された件数 */
  baselineStartedTotal: number;
  baselineEarlyAbandonedCount: number;
  /** baselineStartedTotalが0ならnull */
  baselineEarlyAbandonmentRate: number | null;
  windowSize: number;
  partial: boolean;
  recentRate: number | null;
  previousRate: number | null;
  deltaPt: number | null;
  direction: EarlyAbandonmentTrendDirection;
  /** direction === 'increasing'（早期abandonment率が悪化傾向） */
  triggered: boolean;
  /** ideation提案経由で着手された全run（着手順） */
  runs: IdeationEarlyAbandonmentRun[];
}

function earlyAbandonmentDirection(deltaPt: number): EarlyAbandonmentTrendDirection {
  if (Math.abs(deltaPt) < EARLY_ABANDONMENT_TREND_FLAT_THRESHOLD_PT) return 'flat';
  return deltaPt > 0 ? 'increasing' : 'decreasing';
}

/**
 * ideationDropRateSignal が「提案されてから一度も着手されない」ドロップを検知するのに
 * 対し、こちらは「着手はしたのに、ほぼreviseもせず(EARLY_ABANDONMENT_MAX_REVISE_CYCLES回以下)
 * すぐabandonedになった」早期abandonmentを検知する。着手直後に見送られるのは、issue自体の
 * 記述が曖昧/実装不能などideation生成物の品質問題を示唆するため、着手済みissueの中でも
 * 「粘って revise を重ねた末の abandoned」とは区別する。ideation提案が起源でないissueの
 * 同じ指標(baseline)も併記し、ideation起源のissueだけが悪化しているのか、ゲート全体が
 * 厳しくなっているだけなのかを切り分けられるようにする。トレンドは他のTrendSignal系と
 * 同じ直近/直前ウィンドウ比較（着手順）。ideation提案が1件も無い、または1件も着手されて
 * いない場合はnull。
 */
export function ideationEarlyAbandonmentSignal(runs: RunRecord[]): IdeationEarlyAbandonmentSignal | null {
  const sorted = byIterationAsc(runs);
  if (sorted.length === 0) return null;

  const createdBy = new Map<number, RunRecord>();
  for (const r of sorted) {
    for (const issueNumber of r.nextIssues) {
      if (!createdBy.has(issueNumber)) createdBy.set(issueNumber, r);
    }
  }
  if (createdBy.size === 0) return null;

  const isEarly = (r: RunRecord) => r.verdict === 'abandoned' && r.reviseCycles <= EARLY_ABANDONMENT_MAX_REVISE_CYCLES;

  const seenIdeation = new Set<number>();
  const ideationRuns: IdeationEarlyAbandonmentRun[] = [];
  const seenBaseline = new Set<number>();
  let baselineStartedTotal = 0;
  let baselineEarlyAbandonedCount = 0;

  for (const r of sorted) {
    const created = createdBy.get(r.issue.number);
    if (created && created.iteration < r.iteration) {
      if (seenIdeation.has(r.issue.number)) continue;
      seenIdeation.add(r.issue.number);
      ideationRuns.push({
        issueNumber: r.issue.number,
        proposedIteration: created.iteration,
        startIteration: r.iteration,
        verdict: r.verdict,
        reviseCycles: r.reviseCycles,
        durationSec: r.durationSec,
        isEarlyAbandonment: isEarly(r),
      });
    } else {
      if (seenBaseline.has(r.issue.number)) continue;
      seenBaseline.add(r.issue.number);
      baselineStartedTotal++;
      if (isEarly(r)) baselineEarlyAbandonedCount++;
    }
  }

  if (ideationRuns.length === 0) return null;

  const earlyAbandonedCount = ideationRuns.filter((r) => r.isEarlyAbandonment).length;

  const windowSize = Math.min(EARLY_ABANDONMENT_TREND_WINDOW, Math.floor(ideationRuns.length / 2));
  let recentRate: number | null = null;
  let previousRate: number | null = null;
  let deltaPt: number | null = null;
  let direction: EarlyAbandonmentTrendDirection = 'flat';
  if (windowSize > 0) {
    const recent = ideationRuns.slice(ideationRuns.length - windowSize);
    const previous = ideationRuns.slice(ideationRuns.length - windowSize * 2, ideationRuns.length - windowSize);
    recentRate = recent.filter((r) => r.isEarlyAbandonment).length / recent.length;
    previousRate = previous.filter((r) => r.isEarlyAbandonment).length / previous.length;
    deltaPt = (recentRate - previousRate) * 100;
    direction = earlyAbandonmentDirection(deltaPt);
  }

  return {
    maxReviseCycles: EARLY_ABANDONMENT_MAX_REVISE_CYCLES,
    startedTotal: ideationRuns.length,
    earlyAbandonedCount,
    earlyAbandonmentRate: earlyAbandonedCount / ideationRuns.length,
    baselineStartedTotal,
    baselineEarlyAbandonedCount,
    baselineEarlyAbandonmentRate: baselineStartedTotal === 0 ? null : baselineEarlyAbandonedCount / baselineStartedTotal,
    windowSize,
    partial: windowSize < EARLY_ABANDONMENT_TREND_WINDOW,
    recentRate,
    previousRate,
    deltaPt,
    direction,
    triggered: direction === 'increasing',
    runs: ideationRuns,
  };
}

/** 面が同時に何件以上悪化を示すとcriticalに引き上げるか。 */
export const IDEATION_QUALITY_DEGRADATION_CRITICAL_THRESHOLD = 3;
/** batchSizeVsDropRateCorrelationがこの値以上(強い正の相関)ならbatchSizeCorrelation面を悪化とみなす。 */
export const IDEATION_QUALITY_DEGRADATION_BATCH_SIZE_CORRELATION_THRESHOLD = 0.5;

export type IdeationQualityDegradationLevel = 'critical' | 'watch' | 'normal';

export type IdeationQualityDegradationFacetKey =
  | 'dropStreak'
  | 'leadTime'
  | 'earlyAbandonment'
  | 'batchSizeCorrelation';

export interface IdeationQualityDegradationFacet {
  key: IdeationQualityDegradationFacetKey;
  label: string;
  /** この面の判定に必要なデータが揃っているか */
  available: boolean;
  /** 品質低下の兆候を示しているか(available=falseなら常にfalse) */
  degraded: boolean;
}

export interface IdeationQualityDegradationSignal {
  level: IdeationQualityDegradationLevel;
  facets: IdeationQualityDegradationFacet[];
  /** available=trueな面のうちdegraded=trueな数 */
  degradedCount: number;
  /** available=trueな面の数 */
  availableCount: number;
  criticalThreshold: number;
}

/**
 * Ideation提案の品質低下を、生成側(dropStreak: 提案が拾われない)・消化の遅さ
 * (leadTime: 着手が遅れる)・消化後の早期離脱(earlyAbandonment: 着手直後に見送られる)・
 * 構造的傾向(batchSizeCorrelation: まとめて提案するほど質が落ちる)という性質の異なる
 * 4つの既存シグナルを「面」として束ね、何面が同時に悪化しているかで早期警戒レベルを
 * 算出する。単一指標だけではノイズと本当の劣化を区別しにくいが、複数面が同時に悪化して
 * いれば劣化の可能性が高いと判断できる。各面は元シグナルがデータ不足でnullを返す場合
 * availableをfalseにし悪化判定から除外する。全ての面が判定不可能な場合のみnullを返す。
 */
export function ideationQualityDegradationSignal(runs: RunRecord[]): IdeationQualityDegradationSignal | null {
  const dropSignal = ideationDropRateSignal(runs);
  const leadTimeSignal = ideationToStartLeadTimeTrendSignal(runs);
  const abandonmentSignal = ideationEarlyAbandonmentSignal(runs);
  const dropCorrelation = ideationProposalQualityDropCorrelation(runs);

  const facets: IdeationQualityDegradationFacet[] = [
    {
      key: 'dropStreak',
      label: '提案ドロップの連続',
      available: dropSignal !== null,
      degraded: dropSignal?.triggered ?? false,
    },
    {
      key: 'leadTime',
      label: '着手リードタイムの悪化傾向',
      available: leadTimeSignal !== null,
      degraded: leadTimeSignal?.direction === 'increasing',
    },
    {
      key: 'earlyAbandonment',
      label: '早期abandonmentの悪化傾向',
      available: abandonmentSignal !== null,
      degraded: abandonmentSignal?.triggered ?? false,
    },
    {
      key: 'batchSizeCorrelation',
      label: '提案規模とドロップ率の相関',
      available: dropCorrelation.batchSizeVsDropRateCorrelation !== null,
      degraded:
        (dropCorrelation.batchSizeVsDropRateCorrelation ?? 0) >=
        IDEATION_QUALITY_DEGRADATION_BATCH_SIZE_CORRELATION_THRESHOLD,
    },
  ];

  const availableFacets = facets.filter((f) => f.available);
  if (availableFacets.length === 0) return null;

  const degradedCount = availableFacets.filter((f) => f.degraded).length;
  const level: IdeationQualityDegradationLevel =
    degradedCount >= IDEATION_QUALITY_DEGRADATION_CRITICAL_THRESHOLD
      ? 'critical'
      : degradedCount > 0
        ? 'watch'
        : 'normal';

  return {
    level,
    facets,
    degradedCount,
    availableCount: availableFacets.length,
    criticalThreshold: IDEATION_QUALITY_DEGRADATION_CRITICAL_THRESHOLD,
  };
}

/**
 * 昇順ソート済み配列に対する線形補間パーセンタイル(0..100)。要素0件なら0、1件ならその値。
 * median() と別関数にしているのは、median が「常に中央2要素の平均」という単一式で
 * off-by-one を避ける設計であるのに対し、任意のpには補間が必須で式の形が異なるため。
 */
function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  if (sortedValues.length === 1) return sortedValues[0];
  const rank = (p / 100) * (sortedValues.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return sortedValues[lower];
  return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * (rank - lower);
}

/** ideationToStartLeadTimeDistribution のヒストグラム区間の上限(秒)。10分/30分/60分/180分。最後の区間は上限なし。 */
const IDEATION_TO_START_LEAD_TIME_BUCKET_EDGES_SEC = [600, 1800, 3600, 10800];
const IDEATION_TO_START_LEAD_TIME_BUCKET_LABELS = ['〜10分', '10〜30分', '30〜60分', '60〜180分', '180分〜'];

export interface IdeationToStartLeadTimeBucket {
  label: string;
  minSec: number;
  /** 最後の区間(180分〜)はnull（上限なし） */
  maxSec: number | null;
  count: number;
}

export interface IdeationToStartLeadTimeDistribution {
  sampleSize: number;
  minSec: number;
  maxSec: number;
  medianSec: number;
  p90Sec: number;
  buckets: IdeationToStartLeadTimeBucket[];
}

/**
 * ideationToStartLeadTimeTrendSignal が「直近window vs 直前window」という時系列の変化しか
 * 見ないのに対し、こちらは着手済み全件の分布そのもの（最小/中央値/p90/最大 とヒストグラム）を見る。
 * トレンドが横ばいでも「実は分布の裾が長く、一部のissueだけ突出して遅い」というボトルネックは
 * 分布を見ないと分からないため、この2つは補完関係にある。サンプル0件ならbucketsは空配列。
 */
export function ideationToStartLeadTimeDistribution(runs: RunRecord[]): IdeationToStartLeadTimeDistribution {
  const values = ideationToStartLeadTimes(runs).map((p) => p.leadTimeSec);
  if (values.length === 0) {
    return { sampleSize: 0, minSec: 0, maxSec: 0, medianSec: 0, p90Sec: 0, buckets: [] };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const buckets = IDEATION_TO_START_LEAD_TIME_BUCKET_LABELS.map((label, i) => {
    const minSec = i === 0 ? 0 : IDEATION_TO_START_LEAD_TIME_BUCKET_EDGES_SEC[i - 1];
    const maxSec = i < IDEATION_TO_START_LEAD_TIME_BUCKET_EDGES_SEC.length ? IDEATION_TO_START_LEAD_TIME_BUCKET_EDGES_SEC[i] : null;
    const count = values.filter((v) => v >= minSec && (maxSec === null || v < maxSec)).length;
    return { label, minSec, maxSec, count };
  });

  return {
    sampleSize: values.length,
    minSec: sorted[0],
    maxSec: sorted[sorted.length - 1],
    medianSec: median(values),
    p90Sec: percentile(sorted, 90),
    buckets,
  };
}

/** started-late 判定に十分な着手済みサンプル数の下限。これ未満だとp90自体が不安定なため判定しない。 */
export const IDEATION_TO_START_BOTTLENECK_MIN_SAMPLES = 4;
/** リードタイムが中央値の何倍を超えたら「明確に遅い」とみなすか。p90条件と併用しANDで絞り込む。 */
export const IDEATION_TO_START_BOTTLENECK_MEDIAN_MULTIPLIER = 2;
/** still-waiting 判定の反復数の下限。着手済みサンプルが無く典型ラグが算出できない場合のフォールバック値。 */
export const IDEATION_TO_START_STILL_WAITING_MIN_ITERATIONS = 3;
/** still-waiting 判定で「典型的な着手までの反復数(中央値)」の何倍を超えたら滞留とみなすか。 */
export const IDEATION_TO_START_STILL_WAITING_LAG_MULTIPLIER = 2;

export type IdeationToStartBottleneckKind = 'started-late' | 'still-waiting';

export interface IdeationToStartBottleneck {
  issueNumber: number;
  kind: IdeationToStartBottleneckKind;
  proposedIteration: number;
  /** started-late のみ。still-waiting は null（まだ着手されていないため終点が無い） */
  leadTimeSec: number | null;
  /** still-waiting のみ。提案から runs 全体の最新反復までに経過した反復数。started-late は null */
  waitingIterations: number | null;
}

/**
 * リードタイムのボトルネックを2種類検知する。
 * - started-late: 着手はされたが、他の着手済みissueと比べて明確に遅かったもの
 *   （閾値 = max(p90, 中央値 × MEDIAN_MULTIPLIER) を超える）。閾値自体が不安定になる
 *   IDEATION_TO_START_BOTTLENECK_MIN_SAMPLES 未満のサンプル数では判定しない。
 * - still-waiting: まだ着手されていない提案のうち、着手済みissueの典型的な着手ラグ
 *   （提案〜着手の反復数の中央値）の STILL_WAITING_LAG_MULTIPLIER 倍（最低でも
 *   STILL_WAITING_MIN_ITERATIONS 反復）以上放置されているもの。abandonedIterationDetails
 *   と同じく、経過を時刻ではなく反復数で測る（ビルド時刻に依存しない決定的な値にするため）。
 * 戻り値は proposedIteration 昇順（古い提案ほど先＝優先度が高いとみなす）。
 */
export function ideationToStartBottlenecks(runs: RunRecord[]): IdeationToStartBottleneck[] {
  const sorted = byIterationAsc(runs);
  const points = ideationToStartLeadTimes(runs);
  const bottlenecks: IdeationToStartBottleneck[] = [];

  if (points.length >= IDEATION_TO_START_BOTTLENECK_MIN_SAMPLES) {
    const values = points.map((p) => p.leadTimeSec);
    const sortedValues = [...values].sort((a, b) => a - b);
    const threshold = Math.max(percentile(sortedValues, 90), median(values) * IDEATION_TO_START_BOTTLENECK_MEDIAN_MULTIPLIER);
    for (const p of points) {
      if (p.leadTimeSec > threshold) {
        bottlenecks.push({
          issueNumber: p.issueNumber,
          kind: 'started-late',
          proposedIteration: p.proposedIteration,
          leadTimeSec: p.leadTimeSec,
          waitingIterations: null,
        });
      }
    }
  }

  if (sorted.length > 0) {
    const latestIteration = sorted[sorted.length - 1].iteration;
    const createdBy = new Map<number, RunRecord>();
    for (const r of sorted) {
      for (const issueNumber of r.nextIssues) {
        if (!createdBy.has(issueNumber)) createdBy.set(issueNumber, r);
      }
    }

    const startLagIterations = points.map((p) => p.startIteration - p.proposedIteration);
    const typicalLagIterations = startLagIterations.length > 0 ? median(startLagIterations) : 0;
    const waitThreshold = Math.max(
      IDEATION_TO_START_STILL_WAITING_MIN_ITERATIONS,
      typicalLagIterations * IDEATION_TO_START_STILL_WAITING_LAG_MULTIPLIER,
    );

    const { notStartedIssueNumbers } = ideationStartSuccessSummary(runs);
    for (const issueNumber of notStartedIssueNumbers) {
      const created = createdBy.get(issueNumber);
      if (!created) continue;
      const waitingIterations = latestIteration - created.iteration;
      if (waitingIterations >= waitThreshold) {
        bottlenecks.push({
          issueNumber,
          kind: 'still-waiting',
          proposedIteration: created.iteration,
          leadTimeSec: null,
          waitingIterations,
        });
      }
    }
  }

  return bottlenecks.sort((a, b) => a.proposedIteration - b.proposedIteration);
}

/** execution/consumption のどちらかの間隔がもう一方の何倍以上離れたら「ズレ」と判定するか。 */
export const IDEATION_EXECUTION_CONSUMPTION_GAP_RATIO_THRESHOLD = 2;

/** execution-ahead: 生産過多(バックログ増加方向)。consumption-ahead: 消費過多(在庫枯渇方向)。 */
export type IdeationExecutionConsumptionGapDirection = 'execution-ahead' | 'consumption-ahead' | 'aligned';

export interface IdeationExecutionConsumptionGapSignal {
  /** Ideationが1件以上issueを提案した(実行した)反復数 */
  executionCount: number;
  /** いずれかの提案issueが着手された反復数（ideationToStartLeadTimesの母集団と同じ） */
  consumptionCount: number;
  /** 実行反復どうしの反復番号の差の平均 */
  avgExecutionIntervalIterations: number;
  /** 着手反復どうしの反復番号の差の平均 */
  avgConsumptionIntervalIterations: number;
  /** avgConsumptionIntervalIterations / avgExecutionIntervalIterations。1に近いほどペースが一致 */
  ratio: number;
  direction: IdeationExecutionConsumptionGapDirection;
  /** direction が 'aligned' 以外 */
  triggered: boolean;
  /** 実行があった反復番号(昇順) */
  executionIterations: number[];
  /** 着手があった反復番号(昇順) */
  consumptionIterations: number[];
}

function averageConsecutiveInterval(sortedValues: number[]): number {
  const diffs: number[] = [];
  for (let i = 1; i < sortedValues.length; i++) diffs.push(sortedValues[i] - sortedValues[i - 1]);
  return mean(diffs);
}

/**
 * Ideationの「実行」（提案した反復。判定は ideationProposalConsumption と同じ）間隔と、
 * 提案issueの「消費」（ideationToStartLeadTimes と同じ着手判定）間隔を比較し、issue単位の
 * リードタイムではなく両イベントの発生リズムのズレを検知する。いずれかが2件未満ならnull。
 */
export function ideationExecutionConsumptionGapSignal(runs: RunRecord[]): IdeationExecutionConsumptionGapSignal | null {
  const sorted = byIterationAsc(runs);

  const executionIterations = sorted
    .filter((r) => r.cost.ideationUsd > 0 && r.nextIssues.length > 0)
    .map((r) => r.iteration);

  const consumptionIterations = ideationToStartLeadTimes(runs).map((p) => p.startIteration);

  if (executionIterations.length < 2 || consumptionIterations.length < 2) return null;

  const avgExecutionIntervalIterations = averageConsecutiveInterval(executionIterations);
  const avgConsumptionIntervalIterations = averageConsecutiveInterval(consumptionIterations);
  const ratio = avgConsumptionIntervalIterations / avgExecutionIntervalIterations;

  const direction: IdeationExecutionConsumptionGapDirection =
    ratio >= IDEATION_EXECUTION_CONSUMPTION_GAP_RATIO_THRESHOLD
      ? 'execution-ahead'
      : ratio <= 1 / IDEATION_EXECUTION_CONSUMPTION_GAP_RATIO_THRESHOLD
        ? 'consumption-ahead'
        : 'aligned';

  return {
    executionCount: executionIterations.length,
    consumptionCount: consumptionIterations.length,
    avgExecutionIntervalIterations,
    avgConsumptionIntervalIterations,
    ratio,
    direction,
    triggered: direction !== 'aligned',
    executionIterations,
    consumptionIterations,
  };
}

/**
 * abandoned（ゲートを再試行しても満たせず、人間に振らず自動で見送った）反復専用の
 * 追跡・分析サマリー。gateFailureTypeBreakdown は failed/abandoned/needs-human を
 * 横並びに集計するため、abandoned 単体の「実際にどれだけコストを浪費し、何が支配的な
 * 原因か」が他の類型の平均に薄まって見えない。こちらは abandoned だけに絞り込み、
 * gateReasonBreakdown を再利用してそのカテゴリ内訳の先頭（最多カテゴリ）まで含める。
 */
export interface AbandonedSummary {
  /** abandoned だった反復数 */
  count: number;
  /** 0..1。分母は全反復数（verdict は全 run で必ず記録されるため reachedVerify では絞り込まない） */
  rate: number;
  /**
   * abandoned に至った反復が消費した合計コスト(USD)。costTrend/costBreakdown と同じ理由で
   * verdict に関係なく実際に発生した値をそのまま合算する（＝「浪費」した実コスト）。
   */
  totalCostUsd: number;
  /** abandoned 反復の平均 revise 回数。abandoned が0件なら mean([]) の定義通り0 */
  avgReviseCycles: number;
  /** abandoned 反復の gateReasons で最も多く出現したカテゴリ。abandoned が1件も無ければ null */
  topGateReasonCategory: GateReasonCategory | null;
  /** topGateReasonCategory の出現件数。topGateReasonCategory が null なら0 */
  topGateReasonCount: number;
}

export function abandonedSummary(runs: RunRecord[]): AbandonedSummary {
  const abandoned = runs.filter((r) => r.verdict === 'abandoned');
  // gateReasonBreakdown は count 降順で返すため、先頭が最多カテゴリ。
  const [top] = gateReasonBreakdown(abandoned);

  return {
    count: abandoned.length,
    rate: runs.length === 0 ? 0 : abandoned.length / runs.length,
    totalCostUsd: abandoned.reduce((sum, r) => sum + r.cost.totalUsd, 0),
    avgReviseCycles: mean(abandoned.map((r) => r.reviseCycles)),
    topGateReasonCategory: top ? top.category : null,
    topGateReasonCount: top ? top.count : 0,
  };
}

/**
 * abandoned率の累積推移(0..100)。mergeRateTrend と同じ母集団定義（全run）・累積計算
 * 方式で、最終点は abandonedSummary(runs).rate * 100 と一致する。verdict は全 run で
 * 必ず記録されるため、costTrend/mergeRateTrend と同様 reachedVerify では絞り込まない。
 */
export function abandonedRateTrend(runs: RunRecord[]): TrendPoint[] {
  const sorted = byIterationAsc(runs);
  let abandonedCount = 0;
  return sorted.map((r, i) => {
    if (r.verdict === 'abandoned') abandonedCount++;
    return { iteration: r.iteration, value: (abandonedCount / (i + 1)) * 100 };
  });
}

export interface AbandonedIterationDetail {
  iteration: number;
  issueNumber: number;
  issueTitle: string;
  /** この反復の gateReasons（生の理由文字列。分類は表示側で classifyGateReason を使う） */
  gateReasons: string[];
  reviseCycles: number;
  costUsd: number;
  durationSec: number;
  builderModel: string;
}

/**
 * abandoned 反復ごとの追跡用詳細一覧。recentAdversaryComments と同様、新しい反復から
 * 順に並べることで「直近何が起きて自動見送りになったか」をそのまま読める並びにする。
 * ADVERSARY_COMMENT_DIGEST_LIMIT のような件数の打ち切りは設けない: abandoned は failed
 * 同様に発生頻度が低いことを前提にした調査用の一覧であり、打ち切ると原因調査に必要な
 * 反復が欠落しうるため。
 */
export function abandonedIterationDetails(runs: RunRecord[]): AbandonedIterationDetail[] {
  return byIterationAsc(runs)
    .filter((r) => r.verdict === 'abandoned')
    .reverse()
    .map((r) => ({
      iteration: r.iteration,
      issueNumber: r.issue.number,
      issueTitle: r.issue.title,
      gateReasons: r.gateReasons,
      reviseCycles: r.reviseCycles,
      costUsd: r.cost.totalUsd,
      durationSec: r.durationSec,
      builderModel: r.models.builder,
    }));
}

/**
 * abandoned（打ち止め）反復だけに絞り込んだゲート不通過理由のカテゴリ内訳。
 * abandonedSummary.topGateReasonCategory は最多カテゴリ1件しか持たないため、
 * 「abandonedの中でカテゴリがどう分布しているか」（例: adversary未承認が過半数を
 * 占めるのか、複数原因に分散しているのか）は表現できない。こちらは
 * gateReasonBreakdown をabandonedのみに絞ったrun集合へ適用し、全カテゴリの内訳
 * （count降順、他は評価順で安定）をそのまま返す。gateReasonBreakdown自身が空配列に
 * 対して空配列を返すため、abandonedが0件でも空配列になる。
 */
export function abandonedReasonBreakdown(runs: RunRecord[]): GateReasonCategorySummary[] {
  return gateReasonBreakdown(runs.filter((r) => r.verdict === 'abandoned'));
}

/** abandonedSharePct と overallSharePct の差（ポイント）がこの値以上なら偏りありと判定する。 */
export const ABANDONED_REASON_OVERREPRESENTATION_THRESHOLD_PT = 10;

export interface AbandonedReasonOverrepresentation extends GateReasonCategorySummary {
  /** このカテゴリが abandoned 内訳全体に占める割合(%) */
  abandonedSharePct: number;
  /** このカテゴリが「gateReasonsを持つ全反復」の内訳全体に占める割合(%)。abandonedもこの母集団に含まれる */
  overallSharePct: number;
  /** abandonedSharePct - overallSharePct（パーセントポイント） */
  deltaPct: number;
  /** deltaPct が閾値を超えて偏っているかどうか */
  signal: 'overrepresented' | 'underrepresented' | 'neutral';
}

/**
 * abandonedReasonBreakdown が「abandonedの中でカテゴリがどう分布しているか」しか
 * 示さないのに対し、こちらは各カテゴリの abandoned内での占有率を、gateReasons を
 * 持つ全反復（abandoned以外のfailed/needs-human等も含む母集団）での占有率と比較し、
 * abandonedで相対的に突出している原因（例: 他の非マージ類型では稀だが abandoned では
 * 過半数を占める、等）を検出する。「原因カテゴリの分布」自体は abandonedReasonBreakdown
 * と同じ計算結果を使い、そこに相対比較の軸を1つ足すだけなので、カテゴリの集合・count・
 * iterations・examples はそのまま引き継ぐ（GateReasonCategorySummary を拡張）。
 * abandoned が0件なら空配列を返す（abandonedReasonBreakdown が空配列を返すため）。
 */
export function abandonedReasonOverrepresentation(runs: RunRecord[]): AbandonedReasonOverrepresentation[] {
  const abandonedBreakdown = abandonedReasonBreakdown(runs);
  if (abandonedBreakdown.length === 0) return [];

  const abandonedTotal = abandonedBreakdown.reduce((sum, b) => sum + b.count, 0);
  const overallBreakdown = gateReasonBreakdown(runs);
  const overallTotal = overallBreakdown.reduce((sum, b) => sum + b.count, 0);
  const overallCountByCategory = new Map(overallBreakdown.map((b) => [b.category, b.count]));

  return abandonedBreakdown.map((b) => {
    const abandonedSharePct = (b.count / abandonedTotal) * 100;
    const overallSharePct = overallTotal > 0 ? ((overallCountByCategory.get(b.category) ?? 0) / overallTotal) * 100 : 0;
    const deltaPct = abandonedSharePct - overallSharePct;
    const signal: AbandonedReasonOverrepresentation['signal'] =
      deltaPct >= ABANDONED_REASON_OVERREPRESENTATION_THRESHOLD_PT
        ? 'overrepresented'
        : deltaPct <= -ABANDONED_REASON_OVERREPRESENTATION_THRESHOLD_PT
          ? 'underrepresented'
          : 'neutral';
    return { ...b, abandonedSharePct, overallSharePct, deltaPct, signal };
  });
}

/**
 * types.ts の Verdict コメントの通り、paused は「人間がキルスイッチで止めた」、
 * dry-run は「最初からマージしない設定だった」という別事象。gateReasons はどちらも
 * ゲート自体は通過しているため常に空配列で、abandoned のように理由を分類できない。
 * 「停止理由」はこの2値そのものが表す。
 */
export type PausedDryRunStopReason = 'paused' | 'dry-run';

const PAUSED_DRY_RUN_STOP_REASONS: readonly PausedDryRunStopReason[] = ['paused', 'dry-run'];

export interface PausedDryRunDetail {
  iteration: number;
  issueNumber: number;
  issueTitle: string;
  stopReason: PausedDryRunStopReason;
  /** PRが実際に開かれていれば番号、そうでなければ null */
  prNumber: number | null;
  durationSec: number;
  costUsd: number;
  /**
   * この反復の完了後、runs 全体の最新反復に至るまで何反復が経過したか。
   * paused/dry-run はマージされず PR が開いたまま次の反復に進むため、値が大きいほど
   * 「後続の反復から取り残され、放置され続けている」ことを意味する（＝生存時間）。
   * 経過時刻(Date.now)ではなく反復数で測るのは、このダッシュボードが静的ビルド時点の
   * データのみから決定的に計算する設計だから（ビルド時刻に依存する値は持たない）。
   */
  survivalIterations: number;
}

/**
 * paused/dry-run 反復ごとの追跡用詳細一覧。abandonedIterationDetails と同様、新しい
 * 反復から順に並べる。survivalIterations の基準となる最新反復は runs 全体（paused/dry-run
 * に絞る前）から決める: そうしないと「ループ全体で何反復進んだか」ではなく「他のpaused/
 * dry-run反復と比べて」という別の意味になってしまう。
 */
export function pausedDryRunDetails(runs: RunRecord[]): PausedDryRunDetail[] {
  const sorted = byIterationAsc(runs);
  if (sorted.length === 0) return [];
  const latestIteration = sorted[sorted.length - 1].iteration;

  return sorted
    .filter((r): r is RunRecord & { verdict: PausedDryRunStopReason } => r.verdict === 'paused' || r.verdict === 'dry-run')
    .reverse()
    .map((r) => ({
      iteration: r.iteration,
      issueNumber: r.issue.number,
      issueTitle: r.issue.title,
      stopReason: r.verdict,
      prNumber: r.prNumber,
      durationSec: r.durationSec,
      costUsd: r.cost.totalUsd,
      survivalIterations: latestIteration - r.iteration,
    }));
}

export interface PausedDryRunReasonSummary {
  stopReason: PausedDryRunStopReason;
  count: number;
  avgSurvivalIterations: number;
  maxSurvivalIterations: number;
  /** この停止理由に属する反復の合計コスト(USD)。実際に消費された値をそのまま合算する */
  totalCostUsd: number;
  /** このうち実際に PR が開かれていた（prNumber !== null）件数 */
  openPrCount: number;
}

export interface PausedDryRunSummary {
  /** paused または dry-run だった反復数の合計 */
  count: number;
  /** 停止理由別の内訳。該当反復が0件の理由はここに含めない */
  reasons: PausedDryRunReasonSummary[];
  /** survivalIterations が最大（最も長く放置されている）反復。該当反復が1件も無ければ null */
  longestSurviving: PausedDryRunDetail | null;
}

/**
 * paused/dry-run 反復を「停止理由」（paused か dry-run か）別に集計し、あわせて
 * 「生存時間」(survivalIterations) の平均・最大を見せる。abandonedSummary が
 * gateReasons のカテゴリで分岐するのに対し、こちらは停止理由自体が2値で、かつ
 * ゲート不通過ではなく「通過したのにマージされていない」状態が対象になる。
 */
export function pausedDryRunSummary(runs: RunRecord[]): PausedDryRunSummary {
  const details = pausedDryRunDetails(runs);

  const reasons = PAUSED_DRY_RUN_STOP_REASONS.map((stopReason) => {
    const subset = details.filter((d) => d.stopReason === stopReason);
    return {
      stopReason,
      count: subset.length,
      avgSurvivalIterations: mean(subset.map((d) => d.survivalIterations)),
      maxSurvivalIterations: subset.length === 0 ? 0 : Math.max(...subset.map((d) => d.survivalIterations)),
      totalCostUsd: subset.reduce((sum, d) => sum + d.costUsd, 0),
      openPrCount: subset.filter((d) => d.prNumber !== null).length,
    };
  }).filter((r) => r.count > 0);

  const longestSurviving =
    details.length === 0
      ? null
      : details.reduce((longest, d) => (d.survivalIterations > longest.survivalIterations ? d : longest));

  return { count: details.length, reasons, longestSurviving };
}

/**
 * `paused`（ゲート通過後、キルスイッチでマージ直前に止まった）反復を「どう止まったか」
 * (pattern) と「その後どうなったか」(abandonmentStatus) の2軸で分類する。
 * pausedDryRunSummary が paused/dry-run をまとめて「停止理由」と「生存時間」だけを見るのに
 * 対し、こちらは paused 単体に絞り込み、gate通過からマージまでの「離脱」を検知する:
 * 同じ issue が後続反復で再度実行されていれば、そのpausedは実質的に見捨てられ
 * やり直された(reattempted)と判定できる。再実行が無い場合は、生存時間が
 * GATE_PAUSE_STALE_THRESHOLD_ITERATIONS 以上なら「放置され続けている」(stalled)、
 * 未満ならまだ判断がつかない(pending)とする。dry-run は最初からマージしない設定であり
 * 「マージ直前で離脱した」わけではないため対象に含めない。
 */
export type GatePausePattern = 'clean-pause' | 'contested-pause';

/**
 * これ以上 survivalIterations が経過しても再実行されていない paused を「放置(stalled)」と
 * みなす閾値。BREAKER_THRESHOLD/EARLY_WARNING_WINDOW と同じ3回を表示用の目安として使う。
 */
export const GATE_PAUSE_STALE_THRESHOLD_ITERATIONS = 3;

export type GatePauseAbandonmentStatus = 'reattempted' | 'stalled' | 'pending';

export interface GatePauseClassification {
  iteration: number;
  issueNumber: number;
  issueTitle: string;
  prNumber: number | null;
  /** clean-pause: revise無しで承認され即pause / contested-pause: revise後に承認されてpause */
  pattern: GatePausePattern;
  reviseCycles: number;
  /** pausedDryRunDetail.survivalIterations と同じ定義（runs全体の最新反復からの経過反復数） */
  survivalIterations: number;
  abandonmentStatus: GatePauseAbandonmentStatus;
  /** abandonmentStatus が reattempted のとき、同じissueが再実行された反復番号（iteration昇順）。それ以外は空配列 */
  reattemptedAtIterations: number[];
  costUsd: number;
  durationSec: number;
}

/**
 * paused 反復ごとの分類一覧。abandonedIterationDetails/pausedDryRunDetails と同様、
 * 新しい反復から順に並べる。survivalIterations・reattempt判定の基準となる「最新反復」は
 * runs 全体（pausedに絞る前）から決める: pausedDryRunDetails と同じ理由で、
 * 「他のpaused反復と比べて」ではなく「ループ全体で何反復進んだか」を測るため。
 */
export function gatePauseClassifications(runs: RunRecord[]): GatePauseClassification[] {
  const sorted = byIterationAsc(runs);
  if (sorted.length === 0) return [];
  const latestIteration = sorted[sorted.length - 1].iteration;

  return sorted
    .filter((r) => r.verdict === 'paused')
    .map((r) => {
      const survivalIterations = latestIteration - r.iteration;
      const reattemptedAtIterations = sorted
        .filter((other) => other.issue.number === r.issue.number && other.iteration > r.iteration)
        .map((other) => other.iteration);

      const abandonmentStatus: GatePauseAbandonmentStatus =
        reattemptedAtIterations.length > 0
          ? 'reattempted'
          : survivalIterations >= GATE_PAUSE_STALE_THRESHOLD_ITERATIONS
            ? 'stalled'
            : 'pending';
      const pattern: GatePausePattern = r.reviseCycles === 0 ? 'clean-pause' : 'contested-pause';

      return {
        iteration: r.iteration,
        issueNumber: r.issue.number,
        issueTitle: r.issue.title,
        prNumber: r.prNumber,
        pattern,
        reviseCycles: r.reviseCycles,
        survivalIterations,
        abandonmentStatus,
        reattemptedAtIterations,
        costUsd: r.cost.totalUsd,
        durationSec: r.durationSec,
      };
    })
    .reverse();
}

const GATE_PAUSE_PATTERN_ORDER: readonly GatePausePattern[] = ['clean-pause', 'contested-pause'];
const GATE_PAUSE_ABANDONMENT_STATUS_ORDER: readonly GatePauseAbandonmentStatus[] = [
  'reattempted',
  'stalled',
  'pending',
];

export interface GatePausePatternCount {
  pattern: GatePausePattern;
  count: number;
}

export interface GatePauseAbandonmentCount {
  status: GatePauseAbandonmentStatus;
  count: number;
}

export interface GatePauseSummary {
  /** paused だった反復数の合計 */
  count: number;
  /** pattern別の内訳。該当反復が0件のpatternはここに含めない */
  patterns: GatePausePatternCount[];
  /** abandonmentStatus別の内訳。該当反復が0件のstatusはここに含めない */
  abandonment: GatePauseAbandonmentCount[];
  /** stalled のうち survivalIterations が最大（最も離脱リスクが高い）反復。stalledが1件も無ければ null */
  mostAtRisk: GatePauseClassification | null;
}

/**
 * gatePauseClassifications を pattern別・abandonmentStatus別に集計し、あわせて最も
 * 離脱リスクが高い(stalledかつ最長放置)反復を返す。pausedDryRunSummary が停止理由の
 * 2値で分岐するのに対し、こちらは「ゲート通過後の停止のされ方」と「その後離脱したか」の
 * 2軸で paused 単体を分析する。
 */
export function gatePauseSummary(runs: RunRecord[]): GatePauseSummary {
  const classifications = gatePauseClassifications(runs);

  const patterns = GATE_PAUSE_PATTERN_ORDER.map((pattern) => ({
    pattern,
    count: classifications.filter((c) => c.pattern === pattern).length,
  })).filter((p) => p.count > 0);

  const abandonment = GATE_PAUSE_ABANDONMENT_STATUS_ORDER.map((status) => ({
    status,
    count: classifications.filter((c) => c.abandonmentStatus === status).length,
  })).filter((s) => s.count > 0);

  const stalled = classifications.filter((c) => c.abandonmentStatus === 'stalled');
  const mostAtRisk =
    stalled.length === 0
      ? null
      : stalled.reduce((worst, c) => (c.survivalIterations > worst.survivalIterations ? c : worst));

  return { count: classifications.length, patterns, abandonment, mostAtRisk };
}

interface PausedDryRunResumeDetail {
  iteration: number;
  /** 同じissueが後続反復で再実行(再開)されていれば true */
  resumed: boolean;
  /** resumed=true かつ、再実行のいずれかが最終的に merged に至っていれば true。まだ再実行されていなければ false */
  resumeSucceeded: boolean;
}

/**
 * paused/dry-run 反復ごとに「同じissueが後続反復で再実行(再開)されたか」「再開が最終的に
 * mergedに至ったか(再開成功)」を判定する。gatePauseClassifications の reattemptedAtIterations
 * と同じ検出方法（同じissue.numberを持つ後続反復の有無）をpaused/dry-run両方に適用するが、
 * gatePauseClassifications が「離脱したか」(reattempted/stalled/pending)だけを見るのに対し、
 * こちらは再実行後の実際の結末（マージまで漕ぎ着けたか）まで踏み込む。複数回再実行されて
 * いても、runs全体でそのうち1件でもmergedに至っていれば成功とみなす。
 */
function pausedDryRunResumeDetails(runs: RunRecord[]): PausedDryRunResumeDetail[] {
  const sorted = byIterationAsc(runs);
  return sorted
    .filter((r): r is RunRecord & { verdict: PausedDryRunStopReason } => r.verdict === 'paused' || r.verdict === 'dry-run')
    .map((r) => {
      const later = sorted.filter((other) => other.issue.number === r.issue.number && other.iteration > r.iteration);
      return {
        iteration: r.iteration,
        resumed: later.length > 0,
        resumeSucceeded: later.some((o) => o.verdict === 'merged'),
      };
    });
}

export interface PausedDryRunResumeSummary {
  /** paused/dry-runだった反復数の合計。pausedDryRunSummary.countと同じ母集団 */
  totalCount: number;
  /** うち同じissueが後続反復で再実行された件数 */
  resumedCount: number;
  /** resumedCountのうち最終的にmergedに至った件数 */
  resumeSucceededCount: number;
  /** resumeSucceededCount / resumedCount * 100。resumedCount=0のときは0（再開自体がまだ無く定義できないため） */
  resumeSuccessRatePct: number;
  /** まだ一度も再実行されていない件数 */
  notResumedCount: number;
}

export function pausedDryRunResumeSummary(runs: RunRecord[]): PausedDryRunResumeSummary {
  const details = pausedDryRunResumeDetails(runs);
  const resumed = details.filter((d) => d.resumed);
  const succeeded = resumed.filter((d) => d.resumeSucceeded);
  return {
    totalCount: details.length,
    resumedCount: resumed.length,
    resumeSucceededCount: succeeded.length,
    resumeSuccessRatePct: resumed.length === 0 ? 0 : (succeeded.length / resumed.length) * 100,
    notResumedCount: details.length - resumed.length,
  };
}

/**
 * 再開された(resumed=true)paused/dry-run反復に絞り、その累積再開成功率(0..100)の推移を
 * 元のiteration昇順で返す。approvalRateTrend等と同じ「対象母集団に絞ってからの累積割合」
 * という考え方だが、母集団は「再開された反復」のみ: まだ再開されていない反復を分母に
 * 含めると「再開すらされていない」ことと「再開したが失敗した」ことが区別できず、率が
 * 見かけ上低く出てしまうため。
 */
export function pausedDryRunResumeSuccessTrend(runs: RunRecord[]): TrendPoint[] {
  const resumed = pausedDryRunResumeDetails(runs)
    .filter((d) => d.resumed)
    .sort((a, b) => a.iteration - b.iteration);
  let successCount = 0;
  return resumed.map((d, i) => {
    if (d.resumeSucceeded) successCount++;
    return { iteration: d.iteration, value: (successCount / (i + 1)) * 100 };
  });
}

export interface AdversaryOutcomeDivergenceSummary {
  model: string;
  /** adversary の判定対象になった件数（verify に到達した run のみ。failed はレビュー自体に未到達のため除く） */
  decidedCount: number;
  approvedCount: number;
  rejectedCount: number;
  /** 承認した(approved=true)のに実結果が merged にならなかった件数＝見落とし */
  falseApproveCount: number;
  /** falseApproveCount / approvedCount の百分率。approvedCount=0 のときは0 */
  falseApproveRatePct: number;
  /** 却下した(approved=false)のに実結果が merged になった件数 */
  falseRejectCount: number;
  /** falseRejectCount / rejectedCount の百分率。rejectedCount=0 のときは0 */
  falseRejectRatePct: number;
  /** (falseApproveCount + falseRejectCount) / decidedCount の百分率。承認⇔実結果の全体乖離率 */
  divergenceRatePct: number;
  /** 見落とし（false approve）が発生した反復番号。古い→新しい順 */
  falseApproveIterations: number[];
  /** この adversary モデルが判定した全反復番号。古い→新しい順 */
  iterations: number[];
}

/**
 * Adversary の「承認したか」という判断(adversary.approved)と、その反復が最終的にどうなったか
 * という「実結果」(verdict === 'merged')を adversary モデルごとに突き合わせ、両者が食い違う
 * ケース（見落とし）を定量化する。ModelApprovalMergeComparisonPanel が builder モデル別に
 * 承認率とマージ率という2本の集計値のギャップ(pt)を見せるのに対し、こちらは adversary モデル別に
 * 「個々の反復単位で判断と実結果が一致していたか」を件数ベースで突き合わせる点が異なる
 * （集計値の差分では、承認したPRのうち何件が実際に非マージだったかという発生率は分からない）。
 * 承認したのに非マージだった＝見落とし(falseApprove)を主指標とし、理論上は起きないはずの
 * 却下したのにマージされた(falseReject)も対称に算出する。failed（レビュー未到達）は
 * reachedVerify と同じ基準で母集団から除く。
 */
export function adversaryOutcomeDivergence(runs: RunRecord[]): AdversaryOutcomeDivergenceSummary[] {
  const byModel = new Map<string, RunRecord[]>();

  for (const run of byIterationAsc(runs)) {
    if (!reachedVerify(run)) continue;
    const model = run.models.adversary;
    const list = byModel.get(model);
    if (list) {
      list.push(run);
    } else {
      byModel.set(model, [run]);
    }
  }

  return [...byModel.entries()]
    .map(([model, modelRuns]) => {
      const approved = modelRuns.filter((r) => r.adversary.approved);
      const rejected = modelRuns.filter((r) => !r.adversary.approved);
      const falseApprove = approved.filter((r) => r.verdict !== 'merged');
      const falseReject = rejected.filter((r) => r.verdict === 'merged');

      return {
        model,
        decidedCount: modelRuns.length,
        approvedCount: approved.length,
        rejectedCount: rejected.length,
        falseApproveCount: falseApprove.length,
        falseApproveRatePct: approved.length === 0 ? 0 : (falseApprove.length / approved.length) * 100,
        falseRejectCount: falseReject.length,
        falseRejectRatePct: rejected.length === 0 ? 0 : (falseReject.length / rejected.length) * 100,
        divergenceRatePct: ((falseApprove.length + falseReject.length) / modelRuns.length) * 100,
        falseApproveIterations: falseApprove.map((r) => r.iteration),
        iterations: modelRuns.map((r) => r.iteration),
      };
    })
    .sort((a, b) => {
      if (b.divergenceRatePct !== a.divergenceRatePct) return b.divergenceRatePct - a.divergenceRatePct;
      return a.model.localeCompare(b.model);
    });
}

/**
 * adversaryModelVerdictMissMatrix の列として扱う verdict。'merged' は見落としの定義上
 * （承認したのに merged にならなかった、というのが見落としなので）ここには現れない
 * （merged行が0件なら見落としようがないため、常に列として出す意味が無い）。
 * 'failed' は adversaryOutcomeDivergence と同じ理由（レビュー未到達）で reachedVerify により
 * 事前に除外される。表示順は非マージの深刻度が上がる順（ReviseVerdictMatrixPanel の
 * VERDICT_ORDER と揃える）。
 */
const MISS_MATRIX_VERDICT_ORDER: readonly Verdict[] = ['dry-run', 'paused', 'needs-human', 'abandoned'];

export interface AdversaryModelVerdictMissCell {
  verdict: Verdict;
  /** この adversary モデルがこの verdict を出した反復数 */
  count: number;
  /** そのうち adversary.approved === true だった件数（＝見落とし） */
  missCount: number;
  /** missCount / count の百分率。count=0 のときは0（このverdictは列に現れないため実際には未使用） */
  missRatePct: number;
  /** 見落とし（missCount側）が発生した反復番号。昇順 */
  iterations: number[];
}

export interface AdversaryModelVerdictMissMatrixRow {
  model: string;
  /** verify に到達したこのモデルの全反復数（merged含む） */
  decidedCount: number;
  /** merged を除いた反復数（このマトリクスの分母合計） */
  nonMergedCount: number;
  totalMissCount: number;
  /** totalMissCount / nonMergedCount の百分率。nonMergedCount=0 のときは0 */
  overallMissRatePct: number;
  /** 実際に出現した verdict だけを MISS_MATRIX_VERDICT_ORDER の順で持つ（0件のverdictは含めない） */
  cells: AdversaryModelVerdictMissCell[];
}

/**
 * adversaryOutcomeDivergence は adversary モデル別に「承認したのにmergedにならなかった」
 * 件数(falseApprove)を verdict の種類を問わず1本の集計値に潰す。しかし abandoned・
 * needs-human・paused・dry-run のどこで見落としが起きやすいかはモデルによって傾向が
 * 異なりうる（例: あるモデルは needs-human で見落としが集中し、別のモデルは abandoned に
 * 集中する、等）。本関数はモデル×verdictのクロス集計として見落とし率を分解し、
 * 「どのモデルの、どの verdict 種別で見落としが集中しているか」を可視化するための
 * データを提供する。adversaryApprovalByReasonAndModel（ゲート理由×モデル）と対になる
 * 構造だが、対象がゲート理由ではなく verdict である点が異なる。
 * failed（レビュー未到達）は adversaryOutcomeDivergence と同じ基準で母集団から除く。
 */
export function adversaryModelVerdictMissMatrix(runs: RunRecord[]): AdversaryModelVerdictMissMatrixRow[] {
  const byModel = new Map<string, RunRecord[]>();

  for (const run of byIterationAsc(runs)) {
    if (!reachedVerify(run)) continue;
    const model = run.models.adversary;
    const list = byModel.get(model);
    if (list) {
      list.push(run);
    } else {
      byModel.set(model, [run]);
    }
  }

  return [...byModel.entries()]
    .map(([model, modelRuns]) => {
      const nonMerged = modelRuns.filter((r) => r.verdict !== 'merged');
      const cells: AdversaryModelVerdictMissCell[] = [];
      let totalMissCount = 0;

      for (const verdict of MISS_MATRIX_VERDICT_ORDER) {
        const verdictRuns = nonMerged.filter((r) => r.verdict === verdict);
        if (verdictRuns.length === 0) continue;
        const missed = verdictRuns.filter((r) => r.adversary.approved);
        totalMissCount += missed.length;
        cells.push({
          verdict,
          count: verdictRuns.length,
          missCount: missed.length,
          missRatePct: (missed.length / verdictRuns.length) * 100,
          iterations: missed.map((r) => r.iteration).sort((a, b) => a - b),
        });
      }

      return {
        model,
        decidedCount: modelRuns.length,
        nonMergedCount: nonMerged.length,
        totalMissCount,
        overallMissRatePct: nonMerged.length === 0 ? 0 : (totalMissCount / nonMerged.length) * 100,
        cells,
      };
    })
    .sort((a, b) => {
      if (b.overallMissRatePct !== a.overallMissRatePct) return b.overallMissRatePct - a.overallMissRatePct;
      return a.model.localeCompare(b.model);
    });
}

/**
 * 隣接する2反復（iteration昇順で連続する2件）間の verdict 遷移を分類したラベル。
 * - recovered: 非merged → merged（ゲート不通過から回復した）
 * - regressed: merged → 非merged（直前は通過していたのに今回は不通過になった）
 * - sustainedSuccess: merged → merged（連続してゲートを通過している）
 * - repeatedFailure: 非merged → 同じverdictの非merged（同じ型で足踏みしている）
 * - shiftedFailure: 非merged → 別のverdictの非merged（不通過の性質が変わった）
 */
export type VerdictTransitionKind = 'recovered' | 'regressed' | 'sustainedSuccess' | 'repeatedFailure' | 'shiftedFailure';

export interface VerdictTransition {
  fromIteration: number;
  toIteration: number;
  from: Verdict;
  to: Verdict;
  kind: VerdictTransitionKind;
}

function classifyVerdictTransition(from: Verdict, to: Verdict): VerdictTransitionKind {
  const fromMerged = from === 'merged';
  const toMerged = to === 'merged';
  if (!fromMerged && toMerged) return 'recovered';
  if (fromMerged && !toMerged) return 'regressed';
  if (fromMerged && toMerged) return 'sustainedSuccess';
  return from === to ? 'repeatedFailure' : 'shiftedFailure';
}

/**
 * 反復を跨いだ verdict の遷移を、隣接する2反復ごとに自動分類する。breakerStreak が
 * 「非マージの連続数」という単一指標に潰すのに対し、こちらは遷移1件ごとに
 * 「回復した/悪化した/連続成功している/足踏みしている/不通過の性質が変わった」を
 * 分類し、パターンをそのまま追える形で返す。iteration昇順で隣接ペアを作るため、
 * runs が1件以下（比較対象となる隣接ペアが無い）場合は空配列。
 */
export function verdictTransitions(runs: RunRecord[]): VerdictTransition[] {
  const sorted = byIterationAsc(runs);
  const transitions: VerdictTransition[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const from = sorted[i - 1];
    const to = sorted[i];
    transitions.push({
      fromIteration: from.iteration,
      toIteration: to.iteration,
      from: from.verdict,
      to: to.verdict,
      kind: classifyVerdictTransition(from.verdict, to.verdict),
    });
  }
  return transitions;
}

/** count 同値のときの表示順（改善→悪化の軸で、まず良い遷移から並べる）。 */
const VERDICT_TRANSITION_KIND_ORDER: readonly VerdictTransitionKind[] = [
  'sustainedSuccess',
  'recovered',
  'repeatedFailure',
  'shiftedFailure',
  'regressed',
];

export interface VerdictTransitionKindSummary {
  kind: VerdictTransitionKind;
  count: number;
  /** count / 全遷移数 * 100。全遷移数が0のときは0 */
  pct: number;
}

/**
 * verdictTransitions を種別ごとに集計する。0件の種別は含めない（gateReasonBreakdown と
 * 同様、実際に出現したものだけを見せる）。count降順、同数は VERDICT_TRANSITION_KIND_ORDER の順。
 */
export function verdictTransitionSummary(runs: RunRecord[]): VerdictTransitionKindSummary[] {
  const transitions = verdictTransitions(runs);
  const counts = new Map<VerdictTransitionKind, number>();
  for (const t of transitions) {
    counts.set(t.kind, (counts.get(t.kind) ?? 0) + 1);
  }

  return VERDICT_TRANSITION_KIND_ORDER.filter((kind) => (counts.get(kind) ?? 0) > 0)
    .map((kind) => {
      const count = counts.get(kind) ?? 0;
      return { kind, count, pct: transitions.length === 0 ? 0 : (count / transitions.length) * 100 };
    })
    .sort((a, b) => b.count - a.count);
}

export interface VerdictTransitionRootCauseCell {
  rootCause: GateReasonCategory;
  count: number;
  /** count / このkindで根本原因を特定できた遷移数(row.total) * 100 */
  pct: number;
}

export interface VerdictTransitionRootCauseRow {
  kind: VerdictTransitionKind;
  /** このkindのうち根本原因を特定できた遷移数（cellsのcount合計と一致。verdictTransitionSummaryのcountとは母集団が異なりうる） */
  total: number;
  /** 実際に出現したrootCauseだけをcount降順・同数はGATE_REASON_CATEGORY_ORDER順で持つ */
  cells: VerdictTransitionRootCauseCell[];
}

/**
 * verdictTransitions/verdictTransitionSummary が遷移を「種別(kind)」だけで分類するのに
 * 対し、こちらはさらに各遷移に伴う gateReasons[0]（最初にブロックした条件）を根本原因
 * カテゴリとして紐付け、「kind × rootCause」のクロス集計としてパターン化する。例えば
 * repeatedFailure（同型で足踏み）が頻発している場合に、それが verifyFailed による
 * 足踏みなのか adversaryNotApproved による足踏みなのかを区別できる。
 *
 * 根本原因を紐付けられる遷移は以下のみ:
 * - regressed/repeatedFailure/shiftedFailure: 遷移先(to)が非mergedなので、to自身の
 *   gateReasons[0]を採用する（「今回」何が原因でブロックされたか）
 * - recovered: 遷移元(from)が非mergedなので、fromのgateReasons[0]を採用する
 *   （何を乗り越えて回復したか）
 * - sustainedSuccess: 両方mergedでgateReasonsが常に空のため対象外
 *
 * paused/dry-run は evaluate_gate が意図的に gateReasons を積まない非マージ
 * （gateReasonBreakdown 等と同じ前提）なので、これらが上記の判定対象側（regressed等の
 * to、recoveredのfrom）に来る遷移は根本原因を特定できず、その遷移自体を集計から除く
 * （row.total にも数えない）。
 */
export function verdictTransitionRootCausePatterns(runs: RunRecord[]): VerdictTransitionRootCauseRow[] {
  const sorted = byIterationAsc(runs);
  const byKind = new Map<VerdictTransitionKind, GateReasonCategory[]>();

  for (let i = 1; i < sorted.length; i++) {
    const from = sorted[i - 1];
    const to = sorted[i];
    const kind = classifyVerdictTransition(from.verdict, to.verdict);

    let rootCause: GateReasonCategory | null = null;
    if (kind === 'recovered') {
      if (from.gateReasons.length > 0) rootCause = rootCauseCategory(from);
    } else if (kind === 'regressed' || kind === 'repeatedFailure' || kind === 'shiftedFailure') {
      if (to.gateReasons.length > 0) rootCause = rootCauseCategory(to);
    }
    if (rootCause === null) continue;

    const list = byKind.get(kind);
    if (list) {
      list.push(rootCause);
    } else {
      byKind.set(kind, [rootCause]);
    }
  }

  return VERDICT_TRANSITION_KIND_ORDER.filter((kind) => byKind.has(kind)).map((kind) => {
    const rootCauses = byKind.get(kind)!;
    const counts = new Map<GateReasonCategory, number>();
    for (const rc of rootCauses) counts.set(rc, (counts.get(rc) ?? 0) + 1);

    const cells: VerdictTransitionRootCauseCell[] = GATE_REASON_CATEGORY_ORDER.filter(
      (category) => (counts.get(category) ?? 0) > 0,
    )
      .map((category) => {
        const count = counts.get(category)!;
        return { rootCause: category, count, pct: (count / rootCauses.length) * 100 };
      })
      .sort((a, b) => b.count - a.count);

    return { kind, total: rootCauses.length, cells };
  });
}

/** 離脱パターン判定の対象とする最小連続長。1回だけの非マージはまだ「パターン」ではないため2以上を対象にする。 */
export const DROPOUT_STREAK_MIN_LENGTH = 2;

/**
 * recovered: 連続の直後に merged が来た（回復した）
 * droppedOut: データの終端まで連続が続き、かつ連続内の最後の verdict が abandoned
 *             （ゲートを再試行しても満たせず自動で見送った＝回復を試みず離脱した）
 * ongoing: データの終端まで連続が続いているが、最後の verdict が abandoned ではない
 *          （failed/needs-human/paused/dry-run で止まっている、まだ結末の付いていない連続）
 */
export type DropoutOutcome = 'recovered' | 'droppedOut' | 'ongoing';

export interface DropoutStreak {
  startIteration: number;
  endIteration: number;
  /** 連続に含まれる反復数（DROPOUT_STREAK_MIN_LENGTH 以上） */
  length: number;
  /** 連続に含まれるverdict（iteration昇順） */
  verdicts: Verdict[];
  /** 連続に含まれる反復番号（iteration昇順） */
  iterations: number[];
  outcome: DropoutOutcome;
  /** 連続の最後のverdictが abandoned だったか（recovered でも離脱を経て回復したことを示せる） */
  endedInAbandonment: boolean;
  /** 連続に含まれる反復の cost.totalUsd 合計（浪費コストの目安） */
  totalCostUsd: number;
}

/**
 * 「離脱パターン」＝非マージ verdict が DROPOUT_STREAK_MIN_LENGTH 回以上連続した区間を
 * 検知する。breakerRunway/breakerStreak が「最新の連続」だけを見て発火判定するのに対し、
 * こちらは過去分も含めた全ての連続区間を抽出し、各区間が最終的に回復したか(recovered)・
 * 離脱に終わったか(droppedOut)・まだ進行中か(ongoing)を分類する。
 * BREAKER_TRIP_VERDICTS（failed/abandoned/needs-human）とは異なり paused/dry-run も
 * 連続の一部として扱う: これらはブレーカ発火の対象ではないが、ゲート通過(merged)には
 * 至っていないため「離脱パターン」としては連続を構成する非マージ事象の一種とみなす方が
 * 実態に合う（breakerStreakとは母集団の定義が異なることに注意）。
 */
export function dropoutStreaks(runs: RunRecord[]): DropoutStreak[] {
  const sorted = byIterationAsc(runs);
  const streaks: DropoutStreak[] = [];
  let current: RunRecord[] = [];

  const finalize = (followedByMerged: boolean) => {
    if (current.length < DROPOUT_STREAK_MIN_LENGTH) {
      current = [];
      return;
    }
    const last = current[current.length - 1];
    const endedInAbandonment = last.verdict === 'abandoned';
    streaks.push({
      startIteration: current[0].iteration,
      endIteration: last.iteration,
      length: current.length,
      verdicts: current.map((r) => r.verdict),
      iterations: current.map((r) => r.iteration),
      outcome: followedByMerged ? 'recovered' : endedInAbandonment ? 'droppedOut' : 'ongoing',
      endedInAbandonment,
      totalCostUsd: current.reduce((sum, r) => sum + r.cost.totalUsd, 0),
    });
    current = [];
  };

  for (const run of sorted) {
    if (run.verdict === 'merged') {
      finalize(true);
    } else {
      current.push(run);
    }
  }
  finalize(false);

  return streaks;
}

/** モデルの成功率が「pressure(revise回数)が増えても崩れない」とみなす、bucket間の変化幅(pt)の下限。 */
export const MODEL_SKILL_PRESSURE_FLAT_THRESHOLD_PCT = 5;

/**
 * degrades:          revise 0回帯から観測できる最も高い pressure 帯にかけて成功率が
 *                     MODEL_SKILL_PRESSURE_FLAT_THRESHOLD_PCT(pt) 以上下落した
 *                     （負荷がかかるほど成功率が崩れる＝pressure耐性が低い）
 * improves:           逆に同じ幅以上で上昇した（少数サンプルでの偶然の可能性もある）
 * resilient:          変化幅が閾値未満（pressureが増えても成功率がほぼ保たれている）
 * insufficient-data:  revise 0回帯とそれより高い帯の両方に、比較できるだけのデータが無い
 */
export type ModelSkillPressureVerdict = 'degrades' | 'improves' | 'resilient' | 'insufficient-data';

export interface ModelSkillPressureCell {
  bucket: ReviseVerdictBucketLabel;
  count: number;
  mergedCount: number;
  /** count===0のとき0 */
  mergeRate: number;
  /** 該当した反復番号（昇順） */
  iterations: number[];
}

export interface ModelSkillStratification {
  model: string;
  /** データに実際に出現した bucket のみ、0 → 1 → 2 → 3+ の順 */
  cells: ModelSkillPressureCell[];
  totalCount: number;
  /**
   * 観測できた最も高い pressure 帯の mergeRate - 最も低い pressure 帯の mergeRate（pt）。
   * 負の値ほど「revise回数が増えるほど成功率が下がる」ことを示す。
   * 比較できる bucket が2つ未満（1種類の pressure 帯しかデータが無い）場合は null。
   */
  pressureDeltaPct: number | null;
  verdict: ModelSkillPressureVerdict;
}

function modelSkillPressureVerdict(deltaPct: number | null): ModelSkillPressureVerdict {
  if (deltaPct === null) return 'insufficient-data';
  if (deltaPct <= -MODEL_SKILL_PRESSURE_FLAT_THRESHOLD_PCT) return 'degrades';
  if (deltaPct >= MODEL_SKILL_PRESSURE_FLAT_THRESHOLD_PCT) return 'improves';
  return 'resilient';
}

/**
 * builder モデル別に、revise回数(pressure)の bucket(0/1/2/3+。reviseVerdictMatrix と同じ区分)
 * ごとの成功率(mergeRate)を集計する。reviseCyclesByModel(モデル別revise回数分布)と
 * reviseVerdictMatrix(全モデル合算のbucket別verdict分布)を掛け合わせ、「同じモデルでも
 * revise(adversaryの棄却によるやり直し)を重ねるほど成功率がどう変化するか」という
 * モデル別のpressure耐性を見せる（＝ Revise-Cycle Pressure Analysis）。
 * approvalRateTrendByModel と同じ reachedVerify で failed run を除外する: failed run の
 * reviseCycles は「クラッシュするまでの値」で、他の run と同じ意味の bucket にならない。
 * モデルは totalCount 降順（データが豊富な順）、同数はモデル名昇順で並べる。
 */
export function modelSkillStratification(runs: RunRecord[]): ModelSkillStratification[] {
  const completed = byIterationAsc(runs).filter(reachedVerify);

  const byModel = new Map<string, RunRecord[]>();
  for (const run of completed) {
    const model = run.models.builder;
    const list = byModel.get(model);
    if (list) {
      list.push(run);
    } else {
      byModel.set(model, [run]);
    }
  }

  return [...byModel.entries()]
    .map(([model, modelRuns]) => {
      const byBucket = new Map<ReviseVerdictBucketLabel, { count: number; mergedCount: number; iterations: number[] }>();
      for (const run of modelRuns) {
        const bucket = reviseVerdictBucket(run.reviseCycles);
        let entry = byBucket.get(bucket);
        if (!entry) {
          entry = { count: 0, mergedCount: 0, iterations: [] };
          byBucket.set(bucket, entry);
        }
        entry.count++;
        if (run.verdict === 'merged') entry.mergedCount++;
        entry.iterations.push(run.iteration);
      }

      const cells: ModelSkillPressureCell[] = REVISE_VERDICT_BUCKET_ORDER.filter((b) => byBucket.has(b)).map(
        (bucket) => {
          const entry = byBucket.get(bucket)!;
          return {
            bucket,
            count: entry.count,
            mergedCount: entry.mergedCount,
            mergeRate: entry.count === 0 ? 0 : entry.mergedCount / entry.count,
            iterations: entry.iterations,
          };
        },
      );

      const pressureDeltaPct =
        cells.length < 2 ? null : (cells[cells.length - 1].mergeRate - cells[0].mergeRate) * 100;

      return {
        model,
        cells,
        totalCount: modelRuns.length,
        pressureDeltaPct,
        verdict: modelSkillPressureVerdict(pressureDeltaPct),
      };
    })
    .sort((a, b) => {
      if (b.totalCount !== a.totalCount) return b.totalCount - a.totalCount;
      return a.model.localeCompare(b.model);
    });
}

/**
 * adversary が approve した（＝内容を読んで許可を出した）にもかかわらず、builder 側の
 * 要因でゲートを通過できなかった反復を検出する。「Adversary 承認⇔実結果 乖離」の
 * falseApprove は verdict の一致/不一致だけを見て非マージ全般を一括りにするのに対し、
 * こちらは gateReasons を classifyGateReason で分類し、adversaryNotApproved /
 * adversaryUnparseable（adversary 自身の判断内容の分類。定義上 approved=true の反復には
 * 現れないはずだが、不整合データに備えて明示的に除外する）を除いた「builder が
 * 実装として失敗した」ことを示す理由（verify失敗・e2e失敗・変更行数超過・保護パス変更・
 * 変更なし・例外クラッシュ等）を持つ反復だけに絞り込む。paused/dry-run のように
 * ゲート自体は通過している（gateReasons が空）反復は対象外になる。
 */
const ADVERSARY_SIDE_GATE_REASON_CATEGORIES: ReadonlySet<GateReasonCategory> = new Set([
  'adversaryNotApproved',
  'adversaryUnparseable',
]);

export interface ApprovedButBuilderFailedIteration {
  iteration: number;
  issueNumber: number;
  issueTitle: string;
  verdict: Verdict;
  gateReasons: string[];
  categories: GateReasonCategory[];
  builderModel: string;
  adversaryModel: string;
  costUsd: number;
}

export function approvedButBuilderFailedIterations(runs: RunRecord[]): ApprovedButBuilderFailedIteration[] {
  return byIterationAsc(runs)
    .filter((r) => r.adversary.approved && r.verdict !== 'merged')
    .map((r) => ({
      r,
      categories: r.gateReasons
        .map((reason) => classifyGateReason(reason, r.adversary.summary))
        .filter((c) => !ADVERSARY_SIDE_GATE_REASON_CATEGORIES.has(c)),
    }))
    .filter(({ categories }) => categories.length > 0)
    .map(({ r, categories }) => ({
      iteration: r.iteration,
      issueNumber: r.issue.number,
      issueTitle: r.issue.title,
      verdict: r.verdict,
      gateReasons: r.gateReasons,
      categories,
      builderModel: r.models.builder,
      adversaryModel: r.models.adversary,
      costUsd: r.cost.totalUsd,
    }))
    .reverse();
}

export interface ApprovedButBuilderFailedSummary {
  /** 検知した反復数 */
  count: number;
  /** 分母。adversary.approved が true だった反復数（verdict は問わない） */
  approvedCount: number;
  /** 0..100。approvedCount が0なら0 */
  ratePct: number;
  /** 検知した反復が消費した合計コスト(USD) */
  totalCostUsd: number;
  /** 検知した反復の中で最も多く出現した builder 側カテゴリ。0件なら null */
  topCategory: GateReasonCategory | null;
  /** topCategory の出現件数（1反復が複数カテゴリを持つ場合は複数カウント）。topCategory が null なら0 */
  topCategoryCount: number;
}

export function approvedButBuilderFailedSummary(runs: RunRecord[]): ApprovedButBuilderFailedSummary {
  const details = approvedButBuilderFailedIterations(runs);
  const approvedCount = runs.filter((r) => r.adversary.approved).length;
  const totalCostUsd = details.reduce((sum, d) => sum + d.costUsd, 0);

  const categoryCounts = new Map<GateReasonCategory, number>();
  for (const d of details) {
    for (const c of d.categories) {
      categoryCounts.set(c, (categoryCounts.get(c) ?? 0) + 1);
    }
  }
  let topCategory: GateReasonCategory | null = null;
  let topCategoryCount = 0;
  for (const category of GATE_REASON_CATEGORY_ORDER) {
    const c = categoryCounts.get(category) ?? 0;
    if (c > topCategoryCount) {
      topCategoryCount = c;
      topCategory = category;
    }
  }

  return {
    count: details.length,
    approvedCount,
    ratePct: approvedCount === 0 ? 0 : (details.length / approvedCount) * 100,
    totalCostUsd,
    topCategory,
    topCategoryCount,
  };
}

/** modelPairCompatibilityDivergence が「乖離あり」と判定するために必要な最小サンプル数 */
export const MODEL_PAIR_MIN_SAMPLE = 3;
/** 乖離ありと判定する |実測 - 期待| の閾値(pt)。ノイズと区別できる程度の幅を確保する */
export const MODEL_PAIR_DIVERGENCE_THRESHOLD_PT = 15;

export interface ModelPairCompatibilityRow {
  builder: string;
  adversary: string;
  /** このペアの反復数（verdict に関係なく全件） */
  count: number;
  mergedCount: number;
  /** このペアの実測マージ率(pt, 0..100) */
  actualMergeRatePct: number;
  /** builder 単体（相手のadversaryを問わず全反復）のマージ率(pt) */
  builderMarginalMergeRatePct: number;
  /** adversary 単体（相手のbuilderを問わず全反復）のマージ率(pt) */
  adversaryMarginalMergeRatePct: number;
  /** 全反復に対するマージ率(pt) */
  baselineMergeRatePct: number;
  /**
   * 「builder と adversary の間に相互作用が無い」と仮定した場合の期待マージ率(pt, 0..100)。
   * builderMarginalMergeRatePct + adversaryMarginalMergeRatePct - baselineMergeRatePct
   * （二元配置の加法モデル。両モデルの単体効果を baseline からの差分として足し合わせる）を
   * 0..100 にクランプする。
   */
  expectedMergeRatePct: number;
  /** actualMergeRatePct - expectedMergeRatePct（pt）。正なら期待以上に相性が良い、負なら相性が悪い */
  divergencePt: number;
  /**
   * この builder が当該 adversary 以外とも組んだ実績があり、かつこの adversary も当該 builder
   * 以外とも組んだ実績があるか。どちらか一方でも false だと、単体効果とペア固有の効果が
   * 完全に交絡し（このペアの実測値がそのまま単体マージ率になる）、divergencePt は統計的に
   * 意味を持たない（常に0近辺になる）。isDivergent の判定はこれが true の行に限る。
   */
  identifiable: boolean;
  /** identifiable && count >= MODEL_PAIR_MIN_SAMPLE && |divergencePt| >= MODEL_PAIR_DIVERGENCE_THRESHOLD_PT */
  isDivergent: boolean;
  /** 該当した反復番号（昇順） */
  iterations: number[];
}

function clampPct(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function mergeRatePct(runs: RunRecord[]): number {
  if (runs.length === 0) return 0;
  return (runs.filter((r) => r.verdict === 'merged').length / runs.length) * 100;
}

/**
 * builder モデルと adversary モデルの「組み合わせ」単位で、実測マージ率が両モデルの単体成績
 * から期待される水準からどれだけ乖離しているかを検知する。modelEffectiveness や
 * adversaryOutcomeDivergence がモデルを builder/adversary それぞれ単独の軸で評価するのに対し、
 * こちらは「特定の builder × 特定の adversary という組み合わせ自体に、単体成績の合算では
 * 説明できない相性（相互作用）があるか」を二元配置の加法モデル（期待値 = builder単体率 +
 * adversary単体率 - 全体平均）で検出する。期待値との差が大きい組み合わせほど、
 * その2モデルの相性が（良い方にも悪い方にも）通常の想定から外れていることを示す。
 * builder が常に同じ adversary としか組んだことが無い（交絡）場合は identifiable=false とし、
 * isDivergent の対象から外す（このとき divergencePt は定義上0になる）。
 * 乖離度（isDivergent true を優先し、その中で |divergencePt| 降順）で並べる。
 */
export function modelPairCompatibilityDivergence(runs: RunRecord[]): ModelPairCompatibilityRow[] {
  const sorted = byIterationAsc(runs);
  if (sorted.length === 0) return [];

  const baseline = mergeRatePct(sorted);

  const byBuilder = new Map<string, RunRecord[]>();
  const byAdversary = new Map<string, RunRecord[]>();
  const byPair = new Map<string, RunRecord[]>();
  const adversariesByBuilder = new Map<string, Set<string>>();
  const buildersByAdversary = new Map<string, Set<string>>();

  for (const run of sorted) {
    const { builder, adversary } = run.models;
    const pairKey = `${builder}:${adversary}`;

    for (const [map, key] of [
      [byBuilder, builder],
      [byAdversary, adversary],
    ] as const) {
      const list = map.get(key);
      if (list) list.push(run);
      else map.set(key, [run]);
    }

    const pairList = byPair.get(pairKey);
    if (pairList) pairList.push(run);
    else byPair.set(pairKey, [run]);

    const advSet = adversariesByBuilder.get(builder);
    if (advSet) advSet.add(adversary);
    else adversariesByBuilder.set(builder, new Set([adversary]));

    const builderSet = buildersByAdversary.get(adversary);
    if (builderSet) builderSet.add(builder);
    else buildersByAdversary.set(adversary, new Set([builder]));
  }

  const rows: ModelPairCompatibilityRow[] = [...byPair.values()].map((pairRuns) => {
    const { builder, adversary } = pairRuns[0].models;
    const count = pairRuns.length;
    const mergedCount = pairRuns.filter((r) => r.verdict === 'merged').length;
    const actualMergeRatePct = mergeRatePct(pairRuns);
    const builderMarginalMergeRatePct = mergeRatePct(byBuilder.get(builder) ?? []);
    const adversaryMarginalMergeRatePct = mergeRatePct(byAdversary.get(adversary) ?? []);
    const expectedMergeRatePct = clampPct(
      builderMarginalMergeRatePct + adversaryMarginalMergeRatePct - baseline,
    );
    const divergencePt = actualMergeRatePct - expectedMergeRatePct;
    const identifiable =
      (adversariesByBuilder.get(builder)?.size ?? 0) >= 2 && (buildersByAdversary.get(adversary)?.size ?? 0) >= 2;
    const isDivergent =
      identifiable && count >= MODEL_PAIR_MIN_SAMPLE && Math.abs(divergencePt) >= MODEL_PAIR_DIVERGENCE_THRESHOLD_PT;

    return {
      builder,
      adversary,
      count,
      mergedCount,
      actualMergeRatePct,
      builderMarginalMergeRatePct,
      adversaryMarginalMergeRatePct,
      baselineMergeRatePct: baseline,
      expectedMergeRatePct,
      divergencePt,
      identifiable,
      isDivergent,
      iterations: pairRuns.map((r) => r.iteration),
    };
  });

  return rows.sort((a, b) => {
    if (a.isDivergent !== b.isDivergent) return a.isDivergent ? -1 : 1;
    const diff = Math.abs(b.divergencePt) - Math.abs(a.divergencePt);
    if (diff !== 0) return diff;
    if (a.builder !== b.builder) return a.builder.localeCompare(b.builder);
    return a.adversary.localeCompare(b.adversary);
  });
}

/**
 * orchestrator/config.py の ideation_low_water 既定値(6)に合わせた表示用の基準線。
 * dashboard は Python 設定も実際の ready 件数(GitHub側)も読めないため
 * （BREAKER_THRESHOLD と同じ理由）、この既定値を起点とした相対残量として近似する。
 */
export const IDEATION_LOW_WATER = 6;

/** 消費速度(velocity)の算出に使う直近反復数。EARLY_WARNING_WINDOW 等と同じトレイリング窓。 */
export const BACKLOG_ETA_WINDOW = 5;

export interface BacklogLowWaterEta {
  lowWater: number;
  /** velocity 算出に使った反復数。データが window 未満なら全件。 */
  windowSize: number;
  /** IDEATION_LOW_WATER を起点に、各反復の正味増減(nextIssues.length - 1)を積算した相対残量。 */
  currentBalance: number;
  /** 直近 windowSize 反復での1反復あたりの正味増減平均。負なら純減（枯渇方向）。 */
  velocity: number;
  /** currentBalance が lowWater 以下（既に低水位に達している） */
  belowLowWater: boolean;
  /** 低水位到達までの推定反復数。既に belowLowWater なら 0。velocity が 0 以上なら null。 */
  etaIterations: number | null;
  /** 対象window内の反復番号（古い→新しい順） */
  iterations: number[];
}

/**
 * バックログ枯渇予測: ready の消費速度から low_water 到達までの ETA（反復数）を推定する。
 * data/runs に ready 件数は記録されないため、各反復は ready を1件消費しnextIssues件を
 * 補充するという orchestrator/loop.py の挙動から相対残量を再構成する。runs が空ならnull。
 */
export function backlogLowWaterEta(runs: RunRecord[]): BacklogLowWaterEta | null {
  const sorted = byIterationAsc(runs);
  if (sorted.length === 0) return null;

  let balance = IDEATION_LOW_WATER;
  const balances: number[] = [];
  for (const run of sorted) {
    balance += run.nextIssues.length - 1;
    balances.push(balance);
  }

  const windowSize = Math.min(BACKLOG_ETA_WINDOW, sorted.length);
  const currentBalance = balances[balances.length - 1];
  const beforeWindowBalance =
    sorted.length > windowSize ? balances[sorted.length - windowSize - 1] : IDEATION_LOW_WATER;
  const velocity = (currentBalance - beforeWindowBalance) / windowSize;

  const belowLowWater = currentBalance <= IDEATION_LOW_WATER;
  const etaIterations = belowLowWater
    ? 0
    : velocity < 0
      ? Math.ceil((currentBalance - IDEATION_LOW_WATER) / -velocity)
      : null;

  return {
    lowWater: IDEATION_LOW_WATER,
    windowSize,
    currentBalance,
    velocity,
    belowLowWater,
    etaIterations,
    iterations: sorted.slice(sorted.length - windowSize).map((r) => r.iteration),
  };
}

export interface BacklogFlowPoint {
  iteration: number;
  /** この反復が ideation で生成した issue 数（nextIssues.length）。 */
  inflow: number;
  /** この反復が処理した issue 数。1反復は必ず1件を消費するため常に1。 */
  outflow: number;
  /** inflow - outflow。正なら純増、負なら純減、0なら収支ゼロ。 */
  net: number;
  /** backlogLowWaterEta と同じ基準（IDEATION_LOW_WATER 起点）で net を積算した相対残量。 */
  balance: number;
}

/**
 * 反復ごとのバックログ増減フロー。backlogLowWaterEta が直近window分の集計値
 * （速度・ETA）のみを返すのに対し、こちらは全反復それぞれの inflow/outflow/net/balance
 * を古い→新しい順で返し、フロー可視化（増減の推移）に使う。runs が空なら空配列。
 */
export function backlogFlowByIteration(runs: RunRecord[]): BacklogFlowPoint[] {
  const sorted = byIterationAsc(runs);
  let balance = IDEATION_LOW_WATER;
  return sorted.map((run) => {
    const inflow = run.nextIssues.length;
    const outflow = 1;
    const net = inflow - outflow;
    balance += net;
    return { iteration: run.iteration, inflow, outflow, net, balance };
  });
}

/** 生成レートの移動平均に使う直近反復数。 */
export const GENERATION_RATE_WINDOW = 5;

/** 1反復あたり必ず1件消費されるため、生成レートがこれを下回ると持続不可能（先細り）。 */
export const GENERATION_RATE_SUSTAINABLE = 1;

/** 生成不足（1件未満）が何反復連続したら発報するか。 */
export const GENERATION_RATE_ALERT_STREAK = 3;

export interface BacklogGenerationRatePoint {
  iteration: number;
  /** その反復が ideation で生成した issue 数（nextIssues.length）。 */
  generated: number;
}

export interface BacklogGenerationRateSignal {
  /** recentAverageRate の算出に使った反復数（GENERATION_RATE_WINDOW を上限にruns件数で制限）。 */
  windowSize: number;
  /** 直近windowSize反復の平均生成数。 */
  recentAverageRate: number;
  /** 全反復を通した平均生成数（比較用のベースライン）。 */
  overallAverageRate: number;
  /** recentAverageRate が GENERATION_RATE_SUSTAINABLE を下回っている。 */
  belowSustainableRate: boolean;
  /** 直近から遡って、生成数が持続可能レート未満の反復が連続している数。 */
  lowRateStreak: number;
  /** lowRateStreak が GENERATION_RATE_ALERT_STREAK 以上（発報）。 */
  triggered: boolean;
  /** 全反復の生成点列（古い→新しい順）。 */
  points: BacklogGenerationRatePoint[];
  /** recentAverageRate の対象iteration（古い→新しい順）。 */
  iterations: number[];
}

/**
 * バックログ生成レート監視: 直近の生成数(nextIssues.length)平均が、1反復あたり
 * 必ず1件消費される持続可能レートを下回っていないかを監視する。balance/ETA系の既存
 * パネルとは異なり、生成数そのものの推移と不足streakを追跡する。runsが空ならnull。
 */
export function backlogGenerationRateSignal(runs: RunRecord[]): BacklogGenerationRateSignal | null {
  const sorted = byIterationAsc(runs);
  if (sorted.length === 0) return null;

  const points: BacklogGenerationRatePoint[] = sorted.map((run) => ({
    iteration: run.iteration,
    generated: run.nextIssues.length,
  }));

  const windowSize = Math.min(GENERATION_RATE_WINDOW, points.length);
  const windowPoints = points.slice(points.length - windowSize);
  const recentAverageRate = windowPoints.reduce((sum, p) => sum + p.generated, 0) / windowSize;
  const overallAverageRate = points.reduce((sum, p) => sum + p.generated, 0) / points.length;
  const belowSustainableRate = recentAverageRate < GENERATION_RATE_SUSTAINABLE;

  let lowRateStreak = 0;
  for (let i = points.length - 1; i >= 0; i--) {
    if (points[i].generated < GENERATION_RATE_SUSTAINABLE) {
      lowRateStreak += 1;
    } else {
      break;
    }
  }
  const triggered = lowRateStreak >= GENERATION_RATE_ALERT_STREAK;

  return {
    windowSize,
    recentAverageRate,
    overallAverageRate,
    belowSustainableRate,
    lowRateStreak,
    triggered,
    points,
    iterations: windowPoints.map((p) => p.iteration),
  };
}

/** コスト-品質弾性トレンドの比較に使う直近/直前ウィンドウの反復数。 */
export const ELASTICITY_WINDOW = 5;
/** 弾性(絶対値)の変化率(%)がこの値未満なら「横ばい」とする。cycleTimeTrendSignalの5%よりブレが大きいため緩めの10%。 */
export const ELASTICITY_TREND_FLAT_THRESHOLD_PCT = 10;

/** recentApprovalRate/previousApprovalRateは0..100。*ChangePctはゼロ除算/未定義になる場合null。 */
export interface CostQualityElasticityPoint {
  iteration: number;
  recentAvgCostUsd: number;
  previousAvgCostUsd: number;
  costChangePct: number | null;
  recentApprovalRate: number;
  previousApprovalRate: number;
  qualityChangePct: number | null;
  /** qualityChangePct / costChangePct。costChangePctが0の場合もnull */
  elasticity: number | null;
}

function avgApprovalRatePct(group: RunRecord[]): number {
  return (group.filter((r) => r.adversary.approved).length / group.length) * 100;
}
/**
 * コスト増加に対する品質向上の弾性率（Cost-Quality ROI）の推移。ELASTICITY_WINDOW幅の
 * 「直前→直近」ウィンドウ平均のコスト変化率(%)と承認率変化率(%)の比を1反復ずつスライド
 * させて点列を返す。完了反復数がELASTICITY_WINDOWの2倍未満なら空配列。
 */
export function costQualityElasticityTrend(runs: RunRecord[]): CostQualityElasticityPoint[] {
  const completed = byIterationAsc(runs).filter(reachedVerify);
  const w = ELASTICITY_WINDOW;
  if (completed.length < w * 2) return [];
  const points: CostQualityElasticityPoint[] = [];
  for (let i = w * 2 - 1; i < completed.length; i++) {
    const recent = completed.slice(i - w + 1, i + 1);
    const previous = completed.slice(i - w * 2 + 1, i - w + 1);
    const recentAvgCostUsd = mean(recent.map((r) => r.cost.totalUsd));
    const previousAvgCostUsd = mean(previous.map((r) => r.cost.totalUsd));
    const recentApprovalRate = avgApprovalRatePct(recent);
    const previousApprovalRate = avgApprovalRatePct(previous);
    const costChangePct =
      previousAvgCostUsd === 0 ? null : ((recentAvgCostUsd - previousAvgCostUsd) / previousAvgCostUsd) * 100;
    const qualityChangePct =
      previousApprovalRate === 0 ? null : ((recentApprovalRate - previousApprovalRate) / previousApprovalRate) * 100;
    const elasticity =
      costChangePct === null || qualityChangePct === null || costChangePct === 0
        ? null
        : qualityChangePct / costChangePct;
    points.push({
      iteration: completed[i].iteration,
      recentAvgCostUsd,
      previousAvgCostUsd,
      costChangePct,
      recentApprovalRate,
      previousApprovalRate,
      qualityChangePct,
      elasticity,
    });
  }
  return points;
}

/** strengthening: 直近の弾性(絶対値)が過去平均より強含み。weakening: 弱含み。flat: 横ばい。 */
export type CostQualityElasticityDirection = 'strengthening' | 'weakening' | 'flat';
export interface CostQualityElasticityTrendSignal {
  latestIteration: number;
  latestElasticity: number;
  /** 直近点を除く、elasticityが定義できた過去の点の平均。sampleSizeはその点数 */
  historicalAvgElasticity: number;
  sampleSize: number;
  direction: CostQualityElasticityDirection;
}

function costQualityElasticityDirection(latest: number, historicalAvg: number): CostQualityElasticityDirection {
  const latestMag = Math.abs(latest);
  const historicalMag = Math.abs(historicalAvg);
  if (historicalMag === 0) return latestMag === 0 ? 'flat' : 'strengthening';
  const deltaPct = ((latestMag - historicalMag) / historicalMag) * 100;
  if (Math.abs(deltaPct) < ELASTICITY_TREND_FLAT_THRESHOLD_PCT) return 'flat';
  return deltaPct > 0 ? 'strengthening' : 'weakening';
}

/**
 * costQualityElasticityTrend の最新点が過去平均より強含み/弱含み/横ばいかを判定する（絶対値で比較）。
 * 最新点、または過去の点にelasticityが定義できたものが1つもない場合はnull。
 */
export function costQualityElasticityTrendSignal(runs: RunRecord[]): CostQualityElasticityTrendSignal | null {
  const points = costQualityElasticityTrend(runs);
  if (points.length === 0) return null;
  const latest = points[points.length - 1];
  if (latest.elasticity === null) return null;
  const historical = points.slice(0, -1).filter((p) => p.elasticity !== null);
  if (historical.length === 0) return null;
  const historicalAvgElasticity = mean(historical.map((p) => p.elasticity as number));
  return {
    latestIteration: latest.iteration,
    latestElasticity: latest.elasticity,
    historicalAvgElasticity,
    sampleSize: historical.length,
    direction: costQualityElasticityDirection(latest.elasticity, historicalAvgElasticity),
  };
}
