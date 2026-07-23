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

/**
 * gateReasons の分類。orchestrator/gates.py の evaluate_gate 等が生成する文字列
 * テンプレートに合わせている。変更行数・保護パス・例外メッセージは値が動的に埋め込まれる
 * ため、完全一致ではなくプレフィックス/サフィックスで判定する。どれにも合致しなければ 'other'。
 */
export type GateReasonCategory =
  | 'verifyFailed'
  | 'e2eFailed'
  | 'adversaryNotApproved'
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
  'changedLinesExceeded',
  'protectedPathViolation',
  'noChanges',
  'crashed',
  'other',
];

export function classifyGateReason(reason: string): GateReasonCategory {
  if (reason === 'verify(lint/typecheck/unit/build) が失敗している') return 'verifyFailed';
  if (reason === 'e2e(Playwright) が失敗している') return 'e2eFailed';
  if (reason === 'adversary が approve していない') return 'adversaryNotApproved';
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
      const category = classifyGateReason(reason);
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
