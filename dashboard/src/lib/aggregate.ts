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

export type CostRole = 'builder' | 'adversary' | 'ideation';

const COST_ROLES: readonly CostRole[] = ['builder', 'adversary', 'ideation'];

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
  /** builder → adversary → ideation の固定順。Summary.totalCostUsd と一致する合計の内訳。 */
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

  const roleTotals: Record<CostRole, number> = { builder: 0, adversary: 0, ideation: 0 };
  const modelTotals = new Map<string, number>();

  for (const r of runs) {
    const roleCost: Record<CostRole, number> = {
      builder: r.cost.builderUsd,
      adversary: r.cost.adversaryUsd,
      ideation: r.cost.ideationUsd,
    };
    for (const role of COST_ROLES) {
      roleTotals[role] += roleCost[role];
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

function reviseVerdictBucket(reviseCycles: number): ReviseVerdictBucketLabel {
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
 * 承認PRあたり累計コストの推移。iteration 昇順に「その時点までの累計コスト ÷
 * その時点までの累計承認PR数」を各点に持つ。承認PRが1件も出ていない区間は
 * 分母が0で無意味なため、最初の承認PRが出た iteration 以降だけ点を持つ
 * （costTrend が全run区間で点を持つのとは異なる）。
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
  return points;
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
