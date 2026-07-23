import { test, expect, type Page } from '@playwright/test';
import { loadRuns } from '../src/lib/loadData';
import {
  summarize,
  e2eFailureRateTrend,
  costBreakdown,
  changedLinesTrend,
  builderComparison,
  earlyWarningSignal,
  gateReasonBreakdown,
  gateReasonBurdenTrend,
  gateReasonTrendSignal,
  gateReasonChains,
  gateFailureTypeBreakdown,
  costEfficiency,
  costPerApprovedPrTrend,
  breakerRunway,
  modelEffectiveness,
  ideationFailureSummary,
  ideationFailureRateTrend,
  ideationCostQualityCorrelation,
  e2eFailureReviseCorrelation,
  cycleTimeTrend,
  cycleTimeTrendSignal,
  timeToFirstPrTrend,
  timeToFirstPrTrendSignal,
  adversarySummaryLengthTrend,
  adversaryCommentTrendSignal,
  adversaryApprovalCommentStats,
  recentAdversaryComments,
  approvalRateTrendByModel,
  abandonedSummary,
  abandonedRateTrend,
  abandonedIterationDetails,
} from '../src/lib/aggregate';

/** modelEffectiveness と同じ算出元だが、パネルはモデル名昇順で描画するため e2e 側でも同じ並びに揃える。 */
function byModelNameAsc<T extends { model: string }>(summaries: T[]): T[] {
  return [...summaries].sort((a, b) => a.model.localeCompare(b.model));
}

/**
 * data/runs/0005.json 等の値をハードコードすると、無人ループが新しい run を
 * 追記するたびにテストが実データと乖離して壊れる（または気づかれずに無意味化する）。
 * ここでは実際の data/ を loadRuns/summarize で読み、UI が表示すべき期待値を
 * その場で導出する。0件だった場合は data/runs が存在しない・空という前提が
 * 崩れているということなので、その旨を示して即座に失敗させる。
 */
function summaryFromRealData() {
  const { runs } = loadRuns();
  expect(runs.length, 'data/runs に有効な run が1件も読めなかった（fixture が壊れている）').toBeGreaterThan(0);
  return summarize(runs);
}

function toMinutes(sec: number): string {
  return `${(sec / 60).toFixed(1)}分`;
}

/**
 * verdict-summary-bubble や adversary-comment-trend-panel のダイジェストは
 * adversary.summary / gateReasons という自由記述（別AIが書いた過去のレビュー文言）を
 * そのまま表示する。そこには QA トピックとして "NaN" や "undefined" という単語
 * そのものが登場しうる（例: data/runs/0036.json の summary）。これは実際の数値
 * フォーマットバグ（計算結果が生の NaN/undefined としてレンダリングされる事故）とは
 * 無関係なので、後者だけを検出したいテストでは自由記述を含む要素を除いた本文で判定する。
 */
async function bodyTextExcludingFreeform(page: Page): Promise<string> {
  return page.evaluate(() => {
    const selectors = ['[data-testid="verdict-summary-bubble"]', '[data-testid="adversary-comment-trend-panel"]'];
    const restores: Array<{ el: HTMLElement; prevDisplay: string }> = [];
    for (const selector of selectors) {
      const el = document.querySelector(selector) as HTMLElement | null;
      if (!el) continue;
      restores.push({ el, prevDisplay: el.style.display });
      el.style.display = 'none';
    }
    const text = document.body.innerText;
    for (const { el, prevDisplay } of restores) el.style.display = prevDisplay;
    return text;
  });
}

test('ダッシュボードが稼働ステータスと主要メトリクスを表示する', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: '自己観測ダッシュボード' })).toBeVisible();

  const badge = page.getByTestId('status-badge');
  await expect(badge).toBeVisible();
  await expect(badge).toHaveAttribute('data-state', /RUNNING|PAUSED|HALTED/);

  // exact 指定: フィクスチャの issue タイトルにも「承認率…」等が含まれ、
  // 部分一致だと strict mode 違反になる。ラベルは完全一致で狙う。
  // 「承認率」はモデル別比較パネル（model-approval-merge-row-*）の行ラベルとしても
  // 表示されるため、getByText 単体だと2要素にヒットして strict mode 違反になる。
  // トップの統計カード群（metric-cards）に限定して探す。
  const metricCards = page.getByTestId('metric-cards');
  await expect(metricCards.getByText('反復数', { exact: true })).toBeVisible();
  await expect(metricCards.getByText('承認率', { exact: true })).toBeVisible();
  await expect(page.getByText('直近の反復', { exact: true })).toBeVisible();

  // 直近 iteration の所要時間が分表記で表示されること。値は data/runs を実際に読んで
  // 導出する（ハードコードすると無人ループが run を追記した際に壊れる／無意味化する）。
  const summary = summaryFromRealData();
  const latestDurationText = toMinutes(summary.latestDurationSec);
  const avgCycleTimeText = toMinutes(summary.avgCycleTimeSec);

  await expect(page.getByText('直近の所要時間', { exact: true })).toBeVisible();
  await expect(page.getByText(`iteration ${summary.latestDurationIteration}`, { exact: true })).toBeVisible();

  // 「平均サイクルタイム」（複数 run の平均）と「直近の所要時間」（最新1件）は算出元が
  // 異なる別々の値だが、小数第1位への丸め表示は偶然一致しうる
  // （例: 21.05分 と 21.12分 はどちらも表示上「21.1分」になる）。
  // そのため表示テキストの一致/不一致でカードを識別せず、各カード固有の testid で
  // 直接値を検証する。これにより2カードが偶然同じ表示になっても、実装が値を
  // 取り違えていれば（testid の指す値が入れ替わっていれば）検知できる。
  const cycleTimeValue = page.getByTestId('metric-value-cycle-time');
  const latestDurationValue = page.getByTestId('metric-value-latest-duration');
  await expect(cycleTimeValue).toHaveText(avgCycleTimeText);
  await expect(latestDurationValue).toHaveText(latestDurationText);
});

test('停止バッジは理由・停止主体・再開手順を常時表示する', async ({ page }) => {
  await page.goto('/');

  // 無人ループを止めた人間が、再開手順まで一目で辿れることを保証する（spec §7）。
  const badge = page.getByTestId('status-badge');
  await expect(badge).toContainText('理由');
  await expect(badge).toContainText('停止主体');
  await expect(badge).toContainText('再開手順');
  await expect(badge).toContainText('LOOP_ENABLED');
});

test('累計コストが $X.XX に整形され、生 float や NaN が漏れない', async ({ page }) => {
  await page.goto('/');

  // 累計コストは生データから導出する（$1.11 のようなハードコードは、無人ループが
  // run を追記して合計が変わるたびに壊れる）。整形されて $X.XX で表示されること。
  const summary = summaryFromRealData();
  const formattedCost = `$${summary.totalCostUsd.toFixed(2)}`;
  await expect(page.getByText(formattedCost, { exact: true }).first()).toBeVisible();

  const body = await bodyTextExcludingFreeform(page);
  // 整形前の高精度 float（例 1.1099999999999999）がそのまま漏れていないこと。
  const rawCost = String(summary.totalCostUsd);
  if (rawCost !== summary.totalCostUsd.toFixed(2)) {
    expect(body).not.toContain(rawCost);
  }
  expect(body).not.toContain('NaN');
  expect(body).not.toContain('undefined');
});

test('カバレッジは failed 反復を拾わず、verify 到達済みの最新測定値と一致する', async ({ page }) => {
  await page.goto('/');

  const { runs } = loadRuns();
  expect(runs.length, 'data/runs に有効な run が1件も読めなかった（fixture が壊れている）').toBeGreaterThan(0);
  const summary = summarize(runs);

  // カード表示は summarize が導出する latestCoveragePct と一致する（生データから導出。
  // 84.1% のようなハードコードはしない）。
  const coverageText = `${summary.latestCoveragePct.toFixed(1)}%`;
  await expect(page.getByText(coverageText, { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('img', { name: 'カバレッジ推移' })).toBeVisible();

  // 回帰防止（値ではなく不変量で検証）: 表示カバレッジは failed 反復の sentinel 0 では
  // なく、verify 到達済み（非 failed）の最新 iteration の測定値であること。最新反復が
  // failed のときは 1 つ前の測定値へフォールバックし stale フラグが立つ。
  const lastNonFailed = [...runs]
    .sort((a, b) => a.iteration - b.iteration)
    .reverse()
    .find((r) => r.verdict !== 'failed');
  expect(lastNonFailed, 'verify 到達済み（非 failed）の run が1件も無い').toBeTruthy();
  expect(summary.latestCoverageIteration).toBe(lastNonFailed!.iteration);

  const body = await bodyTextExcludingFreeform(page);
  expect(body).not.toContain('NaN');
});

test('承認率・マージ率の推移グラフが表示され、最新値が MetricCards の値と一致する', async ({ page }) => {
  await page.goto('/');

  const { runs } = loadRuns();
  expect(runs.length, 'data/runs に有効な run が1件も読めなかった（fixture が壊れている）').toBeGreaterThan(0);
  const summary = summarize(runs);

  // グラフ本体（svg）が両方描画されていること
  const approvalChart = page.getByRole('img', { name: '承認率推移' });
  const mergeChart = page.getByRole('img', { name: 'マージ率推移' });
  await expect(approvalChart).toBeVisible();
  await expect(mergeChart).toBeVisible();

  // 各グラフのヘッダに表示される最新値は、累積推移の最終点＝summarize() の
  // approvalRate/mergeRate と一致するはず（グラフとカードで数値が食い違わないことの検証）。
  // カード全体を hasText で探すと、他パネルの自由記述テキスト（adversary の要約等）に
  // 偶然「承認率推移」等の部分文字列が含まれた場合に strict mode 違反になるため、
  // グラフ本体（svg、name で一意）の直接の親要素をカードとして特定する。
  const approvalCard = approvalChart.locator('xpath=..');
  const mergeCard = mergeChart.locator('xpath=..');
  await expect(approvalCard).toContainText(`${(summary.approvalRate * 100).toFixed(1)}%`);
  await expect(mergeCard).toContainText(`${(summary.mergeRate * 100).toFixed(1)}%`);

  const body = await bodyTextExcludingFreeform(page);
  expect(body).not.toContain('NaN');
});

test('直近の反復サマリー吹き出しが最新 iteration の verdict とレビュー内容を表示する', async ({ page }) => {
  await page.goto('/');

  const { runs } = loadRuns();
  expect(runs.length, 'data/runs に有効な run が1件も読めなかった（fixture が壊れている）').toBeGreaterThan(0);
  const latest = [...runs].sort((a, b) => b.iteration - a.iteration)[0];

  const bubble = page.getByTestId('verdict-summary-bubble');
  await expect(bubble).toBeVisible();
  await expect(bubble).toHaveAttribute('data-verdict', latest.verdict);
  await expect(bubble).toContainText(`#${latest.iteration}`);
  await expect(bubble).toContainText(`issue #${latest.issue.number}`);

  // 吹き出し本文は adversary.summary（空なら gateReasons へフォールバック）。
  // 実データを実装と同じロジックで導出し、ハードコードしない。
  const expectedBody =
    latest.adversary.summary.trim().length > 0
      ? latest.adversary.summary.trim()
      : latest.gateReasons.length > 0
        ? latest.gateReasons.join(' / ')
        : '（この反復にはサマリーが記録されていません）';
  await expect(bubble).toContainText(expectedBody);

  // 他の iteration の verdict が誤って選ばれていないことの回帰防止: 最新と異なる
  // verdict を持つ run が他に存在するなら、吹き出しはその verdict ではなく
  // 「最新 iteration」の verdict を表示しているはず。
  const conflicting = runs.find((r) => r.iteration !== latest.iteration && r.verdict !== latest.verdict);
  if (conflicting) {
    await expect(bubble).not.toHaveAttribute('data-verdict', conflicting.verdict);
  }
});

test('E2E失敗率推移グラフが表示され、最新値が data/runs から導出した累積失敗率と一致する', async ({ page }) => {
  await page.goto('/');

  const { runs } = loadRuns();
  expect(runs.length, 'data/runs に有効な run が1件も読めなかった（fixture が壊れている）').toBeGreaterThan(0);
  const trend = e2eFailureRateTrend(runs);
  const summary = summarize(runs);

  const chart = page.getByRole('img', { name: 'E2E失敗率推移' });
  await expect(chart).toBeVisible();

  const card = page.locator('div.rounded-xl').filter({ hasText: 'E2E失敗率推移' });
  await expect(card).toHaveCount(1);

  // このリポジトリの data/runs は verify に到達した(非 failed の) run を常に含む
  // 前提で運用されている（全 run が failed になるのは breaker が発火する異常事態）。
  // そのため trend が空になる「データなし」分岐は実データでは構造的に到達できず、
  // ここで if 分岐にして「テストしたつもり」にすると実際には検証されない。
  // 空データ時の表示（「データなし」、svg 非描画）は TrendChart.test.tsx で、
  // 空 trend を返す条件（全 run が failed）は aggregate.test.ts の
  // e2eFailureRateTrend テストでそれぞれ単体テスト済み。ここでは前提を明示した
  // 上で「データあり」経路だけを検証する。
  expect(
    trend.length,
    'data/runs に verify 到達済みの run が1件も無い。fixture が全件 failed になっており、' +
      'このテストが検証している「データあり」経路が実行されていない。',
  ).toBeGreaterThan(0);

  // 承認率・マージ率のテストと同様、trend の最終点ではなく summarize()（別の
  // 計算経路）が導出した e2eFailureRate と突き合わせる。trend 自身から期待値を
  // 作ると、実装のバグが期待値にもそのまま乗って検知できなくなるため。
  await expect(card).toContainText(`${(summary.e2eFailureRate * 100).toFixed(1)}%`);
  // 累積失敗率は 0..100 の範囲に収まるべき不変量（実装バグでの負値/100超えを検知）。
  for (const point of trend) {
    expect(point.value).toBeGreaterThanOrEqual(0);
    expect(point.value).toBeLessThanOrEqual(100);
  }

  const body = await bodyTextExcludingFreeform(page);
  expect(body).not.toContain('NaN');
});

test('モデルコストの内訳が役割別合計とモデル別合計を表示し、Summaryの累計コストと一致する', async ({ page }) => {
  await page.goto('/');

  const { runs } = loadRuns();
  expect(runs.length, 'data/runs に有効な run が1件も読めなかった（fixture が壊れている）').toBeGreaterThan(0);
  const summary = summarize(runs);
  const breakdown = costBreakdown(runs);

  expect(
    breakdown.totalUsd,
    'data/runs の合計コストが0のため「モデルコストの内訳」パネルの中身を検証できない。fixture を見直すこと。',
  ).toBeGreaterThan(0);

  const panel = page.getByTestId('model-cost-breakdown');
  await expect(panel).toBeVisible();
  // パネルのヘッダに表示される合計は Summary.totalCostUsd（別の計算経路）と一致するはず
  await expect(panel).toContainText(`$${summary.totalCostUsd.toFixed(2)}`);

  // ロール別の内訳: builder/adversary/ideation の3つ全てがラベルとして表示され、
  // それぞれの金額が costBreakdown() の計算結果と一致する
  for (const role of breakdown.byRole) {
    const label = page.getByTestId(`role-cost-label-${role.role}`);
    await expect(label).toBeVisible();
    await expect(label).toContainText(`$${role.totalUsd.toFixed(2)}`);
    await expect(label).toContainText(`${role.pct.toFixed(1)}%`);
  }

  // モデル別の内訳: 各モデルが1行だけ存在し、合算後の金額を表示する
  for (const entry of breakdown.byModel) {
    const rows = page.getByTestId(`model-cost-row-${entry.model}`);
    await expect(rows).toHaveCount(1);
    await expect(rows).toContainText(`$${entry.totalUsd.toFixed(2)}`);
  }

  const body2 = await bodyTextExcludingFreeform(page);
  expect(body2).not.toContain('NaN');
  expect(body2).not.toContain('undefined');
});

test('ブレーカ発火までのランウェイパネルが実データから導出した残反復数・対象iterationを表示する', async ({ page }) => {
  await page.goto('/');

  const { runs } = loadRuns();
  expect(runs.length, 'data/runs に有効な run が1件も読めなかった（fixture が壊れている）').toBeGreaterThan(0);
  const runway = breakerRunway(runs);

  const panel = page.getByTestId('breaker-runway-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute('data-tripped', String(runway.tripped));

  // 残り回数（別経路の breakerRunway() と一致するはず）
  await expect(page.getByTestId('breaker-runway-remaining')).toHaveText(String(runway.remaining));

  // threshold 個のスロットのうち発火に近い側（末尾）の streak 個が「消費済み」であること
  for (let i = 0; i < runway.threshold; i++) {
    const slot = page.getByTestId(`breaker-runway-slot-${i}`);
    await expect(slot).toHaveAttribute(
      'data-consumed',
      String(i >= runway.threshold - runway.streak),
    );
  }

  // 連続が1件以上あるときだけ対象iteration注記が出る
  if (runway.iterations.length > 0) {
    await expect(panel).toContainText(`対象iteration: ${runway.iterations.join(', ')}`);
  } else {
    await expect(panel).not.toContainText('対象iteration');
  }

  const body = await bodyTextExcludingFreeform(page);
  expect(body).not.toContain('NaN');
  expect(body).not.toContain('undefined');
});

test('変更行数推移グラフが表示され、最新値が data/runs から導出した changedLinesTrend の最終点と一致する', async ({ page }) => {
  await page.goto('/');

  const { runs } = loadRuns();
  expect(runs.length, 'data/runs に有効な run が1件も読めなかった（fixture が壊れている）').toBeGreaterThan(0);
  const trend = changedLinesTrend(runs);

  const chart = page.getByRole('img', { name: '変更行数推移' });
  await expect(chart).toBeVisible();

  // e2eFailureRateTrend のテストと同様の理由で、「データあり」経路のみを検証する
  // 前提を明示する（このリポジトリの data/runs は verify 到達済み run を常に含む）。
  expect(
    trend.length,
    'data/runs に verify 到達済みの run が1件も無い。fixture が全件 failed になっている。',
  ).toBeGreaterThan(0);

  const card = page.locator('div.rounded-xl').filter({ hasText: '変更行数推移' });
  const latestValue = trend[trend.length - 1].value;
  await expect(card).toContainText(`${latestValue.toFixed(1)}行`);

  const body = await bodyTextExcludingFreeform(page);
  expect(body).not.toContain('NaN');
});

test('Builder改善の前反復比較カードが直近2件の測定済み反復の指標と改善/悪化ラベルを表示する', async ({ page }) => {
  await page.goto('/');

  const { runs } = loadRuns();
  expect(runs.length, 'data/runs に有効な run が1件も読めなかった（fixture が壊れている）').toBeGreaterThan(0);
  const comparison = builderComparison(runs);
  expect(
    comparison,
    'data/runs に verify 到達済みの反復が2件以上無く、比較カードの「データあり」経路を検証できない。',
  ).not.toBeNull();

  const panel = page.getByTestId('builder-comparison');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText(`iteration ${comparison!.previousIteration} → ${comparison!.currentIteration}`);

  // 各指標行が実データから導出した previous/current 値と、verdict に対応する
  // 日本語ラベル（改善/悪化/変化なし）を実際に表示していることを検証する。
  for (const m of comparison!.metrics) {
    const row = page.getByTestId(`builder-metric-${m.key}`);
    await expect(row).toBeVisible();
    const verdictEl = page.getByTestId(`builder-metric-verdict-${m.key}`);
    const expectedLabel = m.verdict === 'improved' ? '改善' : m.verdict === 'regressed' ? '悪化' : '変化なし';
    await expect(verdictEl).toContainText(expectedLabel);
  }

  const body = await bodyTextExcludingFreeform(page);
  expect(body).not.toContain('NaN');
  expect(body).not.toContain('undefined');
});

test('高revise + 低承認率の前兆検知カードが実データから導出したレベルと直近window値を表示する', async ({ page }) => {
  await page.goto('/');

  const { runs } = loadRuns();
  expect(runs.length, 'data/runs に有効な run が1件も読めなかった（fixture が壊れている）').toBeGreaterThan(0);
  const signal = earlyWarningSignal(runs);
  expect(
    signal,
    'data/runs に verify 到達済みの反復が1件も無く、前兆検知カードの「データあり」経路を検証できない。',
  ).not.toBeNull();

  const card = page.getByTestId('early-warning-card');
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute('data-level', signal!.level);

  const levelLabel = signal!.level === 'critical' ? '警戒' : signal!.level === 'watch' ? '注視' : '平常';
  await expect(page.getByTestId('early-warning-level')).toContainText(levelLabel);

  // カードが表示する window 内平均revise・承認率は aggregate.earlyWarningSignal（別経路）と一致するはず
  await expect(page.getByTestId('early-warning-revise-value')).toHaveText(
    `${signal!.windowAvgReviseCycles.toFixed(1)}回`,
  );
  await expect(page.getByTestId('early-warning-approval-value')).toHaveText(
    `${(signal!.windowApprovalRate * 100).toFixed(0)}%`,
  );

  await expect(card).toContainText(`対象iteration: ${signal!.iterations.join(', ')}`);

  const body = await bodyTextExcludingFreeform(page);
  expect(body).not.toContain('NaN');
  expect(body).not.toContain('undefined');
});

test('ゲート不通過理由の分類パネルが実データから導出した分類・件数・対象iterationを表示する', async ({ page }) => {
  await page.goto('/');

  const { runs } = loadRuns();
  expect(runs.length, 'data/runs に有効な run が1件も読めなかった（fixture が壊れている）').toBeGreaterThan(0);
  const breakdown = gateReasonBreakdown(runs);
  expect(
    breakdown.length,
    'data/runs に gateReasons を持つ反復が1件も無く、パネルの「データあり」経路を検証できない。',
  ).toBeGreaterThan(0);

  const panel = page.getByTestId('gate-reasons-panel');
  await expect(panel).toBeVisible();

  const totalCount = breakdown.reduce((sum, b) => sum + b.count, 0);
  await expect(panel).toContainText(`${totalCount}件`);

  // 各分類行が gateReasonBreakdown()（別の計算経路）と一致する件数・割合・対象iterationを表示する
  for (const b of breakdown) {
    const countEl = page.getByTestId(`gate-reason-count-${b.category}`);
    const pct = (b.count / totalCount) * 100;
    await expect(countEl).toHaveText(`${b.count}件 (${pct.toFixed(1)}%)`);

    const row = page.getByTestId(`gate-reason-row-${b.category}`);
    await expect(row).toContainText(`対象iteration: ${b.iterations.join(', ')}`);
  }

  // 件数降順で描画されていること（パネルの主張である「分類」の意味を持たせるため）
  const rows = await page.locator('[data-testid^="gate-reason-row-"]').all();
  const renderedCategories = await Promise.all(
    rows.map(async (r) => (await r.getAttribute('data-testid'))!.replace('gate-reason-row-', '')),
  );
  expect(renderedCategories).toEqual(breakdown.map((b) => b.category));

  const body = await bodyTextExcludingFreeform(page);
  expect(body).not.toContain('NaN');
  expect(body).not.toContain('undefined');
});

test('ゲート理由の時系列burdenチャートが実データから導出した反復ごとのカテゴリ別件数を表示する', async ({ page }) => {
  await page.goto('/');

  const { runs } = loadRuns();
  expect(runs.length, 'data/runs に有効な run が1件も読めなかった（fixture が壊れている）').toBeGreaterThan(0);
  const points = gateReasonBurdenTrend(runs);
  expect(
    points.length,
    'data/runs に gateReasons を持つ反復が1件も無く、チャートの「データあり」経路を検証できない。',
  ).toBeGreaterThan(0);

  const chart = page.getByTestId('gate-reason-burden-chart');
  await expect(chart).toBeVisible();

  const latest = points[points.length - 1];
  await expect(chart).toContainText(`直近iteration ${latest.iteration}: ${latest.total}件`);

  // 各反復の列が実際に描画され、count>0のカテゴリだけが棒として存在すること
  // （gateReasonBurdenTrend という別経路の計算結果と突き合わせる）。
  for (const p of points) {
    const column = page.getByTestId(`gate-reason-burden-column-${p.iteration}`);
    await expect(column).toBeVisible();
    for (const [category, count] of Object.entries(p.counts)) {
      const bar = page.getByTestId(`gate-reason-burden-bar-${p.iteration}-${category}`);
      if (count > 0) {
        await expect(bar).toHaveCount(1);
      } else {
        await expect(bar).toHaveCount(0);
      }
    }
  }

  await expect(page.getByTestId('gate-reason-burden-iterations')).toContainText(
    `対象iteration: ${points.map((p) => p.iteration).join(', ')}`,
  );

  const body = await bodyTextExcludingFreeform(page);
  expect(body).not.toContain('NaN');
  expect(body).not.toContain('undefined');
});

test('ゲート不通過理由のカテゴリ別トレンドパネルが実データから導出した悪化/改善カテゴリ・比較windowを表示する', async ({ page }) => {
  await page.goto('/');

  const { runs } = loadRuns();
  expect(runs.length, 'data/runs に有効な run が1件も読めなかった（fixture が壊れている）').toBeGreaterThan(0);
  const signal = gateReasonTrendSignal(runs);

  const panel = page.getByTestId('gate-reason-trend-panel');
  await expect(panel).toBeVisible();

  if (signal === null) {
    // gateReasons を持つ反復が現状データでは1件しか無く（直前windowが取れない）、
    // 判定不能メッセージのみが表示される経路。将来 run が積み増されればこの分岐は
    // 下の else 側（実際の悪化/改善表示）に切り替わる。
    await expect(panel).toContainText('反復数が少なく');
    await expect(page.locator('[data-testid^="gate-reason-trend-row-"]')).toHaveCount(0);
  } else {
    // gateReasonTrendSignal()（別の計算経路）が返すカテゴリのうち横ばい以外を、
    // コンポーネントと同じ「変化幅の大きい順」に並べ替えて期待値を作る。
    const changed = signal.categories
      .filter((c) => c.direction !== 'flat')
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

    if (changed.length === 0) {
      await expect(page.getByTestId('gate-reason-trend-all-flat')).toBeVisible();
    } else {
      const rows = await page.locator('[data-testid^="gate-reason-trend-row-"]').all();
      const renderedCategories = await Promise.all(
        rows.map(async (r) => (await r.getAttribute('data-testid'))!.replace('gate-reason-trend-row-', '')),
      );
      expect(renderedCategories).toEqual(changed.map((c) => c.category));

      for (const c of changed) {
        const delta = page.getByTestId(`gate-reason-trend-delta-${c.category}`);
        await expect(delta).toContainText(`${c.previousAvgCount.toFixed(1)} → ${c.recentAvgCount.toFixed(1)}件/反復`);
      }
    }

    if (signal.partial) {
      await expect(panel).toContainText('データ不足のため window 未満の反復数で計算');
    }
  }

  const body = await bodyTextExcludingFreeform(page);
  expect(body).not.toContain('NaN');
  expect(body).not.toContain('undefined');
});

test('ゲート不通過理由の連鎖パネルが実データから導出したパス別のカテゴリ連鎖を表示する', async ({ page }) => {
  await page.goto('/');

  const { runs } = loadRuns();
  expect(runs.length, 'data/runs に有効な run が1件も読めなかった（fixture が壊れている）').toBeGreaterThan(0);
  const chains = gateReasonChains(runs);
  expect(
    chains.length,
    'data/runs に gateReasons を持つ反復が1件も無く、パネルの「データあり」経路を検証できない。',
  ).toBeGreaterThan(0);

  const panel = page.getByTestId('gate-reason-chain-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText(`${chains.length}パス`);

  // 各パスが gateReasonChains()（別の計算経路）と一致する連鎖カテゴリを新しい順に表示する
  for (const chain of chains) {
    const row = page.getByTestId(`gate-reason-chain-row-${chain.iteration}`);
    await expect(row).toContainText(`issue #${chain.issueNumber}`);
    expect(await row.getAttribute('data-verdict')).toBe(chain.verdict);
    for (const category of chain.categories) {
      await expect(page.getByTestId(`gate-reason-chain-category-${chain.iteration}-${category}`)).toHaveCount(1);
    }
  }

  const rows = await page.locator('[data-testid^="gate-reason-chain-row-"]').all();
  const renderedIterations = await Promise.all(
    rows.map(async (r) => Number((await r.getAttribute('data-testid'))!.replace('gate-reason-chain-row-', ''))),
  );
  expect(renderedIterations).toEqual(chains.map((c) => c.iteration));

  const body = await bodyTextExcludingFreeform(page);
  expect(body).not.toContain('NaN');
  expect(body).not.toContain('undefined');
});

test('ゲート不通過の類型別集計パネルが実データから導出したverdict別件数・対象iterationを表示する', async ({ page }) => {
  await page.goto('/');

  const { runs } = loadRuns();
  expect(runs.length, 'data/runs に有効な run が1件も読めなかった（fixture が壊れている）').toBeGreaterThan(0);
  const breakdown = gateFailureTypeBreakdown(runs);
  expect(
    breakdown.length,
    'data/runs に gateReasons を持つ反復が1件も無く、パネルの「データあり」経路を検証できない。',
  ).toBeGreaterThan(0);

  const panel = page.getByTestId('gate-failure-types-panel');
  await expect(panel).toBeVisible();

  const totalCount = breakdown.reduce((sum, b) => sum + b.count, 0);
  await expect(panel).toContainText(`${totalCount}件`);

  // 各行が gateFailureTypeBreakdown()（別の計算経路）と一致する件数・割合・対象iterationを表示する
  for (const b of breakdown) {
    const countEl = page.getByTestId(`gate-failure-type-count-${b.verdict}`);
    const pct = (b.count / totalCount) * 100;
    await expect(countEl).toHaveText(`${b.count}件 (${pct.toFixed(1)}%)`);

    const row = page.getByTestId(`gate-failure-type-row-${b.verdict}`);
    await expect(row).toContainText(`対象iteration: ${b.iterations.join(', ')}`);
  }

  // 件数降順で描画されていること
  const rows = await page.locator('[data-testid^="gate-failure-type-row-"]').all();
  const renderedVerdicts = await Promise.all(
    rows.map(async (r) => (await r.getAttribute('data-testid'))!.replace('gate-failure-type-row-', '')),
  );
  expect(renderedVerdicts).toEqual(breakdown.map((b) => b.verdict));

  // paused/dry-run は gateReasons が常に空（意図的な非マージ）なので、
  // このパネルの「ゲート不通過」母集団には現れないはずという不変量。
  const pausedOrDryRun = runs.filter((r) => r.verdict === 'paused' || r.verdict === 'dry-run');
  for (const r of pausedOrDryRun) {
    expect(
      r.gateReasons,
      `iteration ${r.iteration} (${r.verdict}) の gateReasons は空である前提が崩れている`,
    ).toEqual([]);
  }
  await expect(page.getByTestId('gate-failure-type-row-paused')).toHaveCount(0);
  await expect(page.getByTestId('gate-failure-type-row-dry-run')).toHaveCount(0);

  const body = await bodyTextExcludingFreeform(page);
  expect(body).not.toContain('NaN');
  expect(body).not.toContain('undefined');
});

test('モデル選択の効果測定パネルが実データから導出したmodel別マージ率・承認率・平均コストを表示する', async ({ page }) => {
  await page.goto('/');

  const { runs } = loadRuns();
  expect(runs.length, 'data/runs に有効な run が1件も読めなかった（fixture が壊れている）').toBeGreaterThan(0);
  const summaries = modelEffectiveness(runs);
  expect(
    summaries.length,
    'data/runs に run が1件もなく、パネルの「データあり」経路を検証できない。',
  ).toBeGreaterThan(0);

  const panel = page.getByTestId('model-effectiveness-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText(`${summaries.length}モデル`);

  // 各モデル行が modelEffectiveness()（別の計算経路）と一致するマージ率・件数・
  // 承認率・e2e失敗率・平均revise・平均カバレッジ・平均コストを表示していること
  for (const s of summaries) {
    const mergeEl = page.getByTestId(`model-effectiveness-merge-${s.model}`);
    await expect(mergeEl).toHaveText(`マージ率${(s.mergeRate * 100).toFixed(1)}% (${s.count}件)`);

    const statsEl = page.getByTestId(`model-effectiveness-stats-${s.model}`);
    await expect(statsEl).toHaveText(
      `承認率${(s.approvalRate * 100).toFixed(1)}% / e2e失敗率${(s.e2eFailureRate * 100).toFixed(1)}% / ` +
        `平均revise${s.avgReviseCycles.toFixed(1)}回 / 平均カバレッジ${s.avgCoveragePct.toFixed(1)}% / ` +
        `平均コスト$${s.avgCostUsd.toFixed(2)}`,
    );

    const row = page.getByTestId(`model-effectiveness-row-${s.model}`);
    await expect(row).toContainText(`対象iteration: ${s.iterations.join(', ')}`);
  }

  // マージ率降順で描画されていること
  const rows = await page.locator('[data-testid^="model-effectiveness-row-"]').all();
  const renderedModels = await Promise.all(
    rows.map(async (r) => (await r.getAttribute('data-testid'))!.replace('model-effectiveness-row-', '')),
  );
  expect(renderedModels).toEqual(summaries.map((s) => s.model));

  const body = await bodyTextExcludingFreeform(page);
  expect(body).not.toContain('NaN');
  expect(body).not.toContain('undefined');
});

test('モデル別 承認率・マージ率比較パネルが実データから導出したモデル名昇順・承認率・マージ率・ギャップを表示する', async ({ page }) => {
  await page.goto('/');

  const { runs } = loadRuns();
  expect(runs.length, 'data/runs に有効な run が1件も読めなかった（fixture が壊れている）').toBeGreaterThan(0);
  const summaries = modelEffectiveness(runs);
  expect(
    summaries.length,
    'data/runs に run が1件もなく、パネルの「データあり」経路を検証できない。',
  ).toBeGreaterThan(0);

  const panel = page.getByTestId('model-approval-merge-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText(`${summaries.length}モデル`);

  // 各モデル行が modelEffectiveness()（別の計算経路）と一致する承認率・マージ率・
  // ギャップ（承認率-マージ率）・件数・対象iterationを表示していること
  for (const s of summaries) {
    const approvalPct = s.approvalRate * 100;
    const mergePct = s.mergeRate * 100;
    const gapPct = approvalPct - mergePct;

    const approvalEl = page.getByTestId(`model-approval-merge-approval-value-${s.model}`);
    await expect(approvalEl).toHaveText(`${approvalPct.toFixed(1)}%`);

    const mergeEl = page.getByTestId(`model-approval-merge-merge-value-${s.model}`);
    await expect(mergeEl).toHaveText(`${mergePct.toFixed(1)}%`);

    const gapEl = page.getByTestId(`model-approval-merge-gap-${s.model}`);
    await expect(gapEl).toHaveText(`承認→マージのギャップ: ${gapPct >= 0 ? '+' : ''}${gapPct.toFixed(1)}pt`);

    const row = page.getByTestId(`model-approval-merge-row-${s.model}`);
    await expect(row).toContainText(`${s.count}件`);
    await expect(row).toContainText(`対象iteration: ${s.iterations.join(', ')}`);
  }

  // ModelEffectivenessPanel はマージ率降順だが、こちらはモデル名昇順で固定されているはず
  const rows = await page.locator('[data-testid^="model-approval-merge-row-"]').all();
  const renderedModels = await Promise.all(
    rows.map(async (r) => (await r.getAttribute('data-testid'))!.replace('model-approval-merge-row-', '')),
  );
  expect(renderedModels).toEqual(byModelNameAsc(summaries).map((s) => s.model));

  const body = await bodyTextExcludingFreeform(page);
  expect(body).not.toContain('NaN');
  expect(body).not.toContain('undefined');
});

test('Cost効率（USD per 承認PR）パネルが実データから導出した総コスト・承認PR件数・単価を表示する', async ({ page }) => {
  await page.goto('/');

  const { runs } = loadRuns();
  expect(runs.length, 'data/runs に有効な run が1件も読めなかった（fixture が壊れている）').toBeGreaterThan(0);
  const efficiency = costEfficiency(runs);
  expect(
    efficiency.approvedPrCount,
    'data/runs に承認PR（adversary承認かつPRが開かれた反復）が1件も無く、パネルの「データあり」経路を検証できない。',
  ).toBeGreaterThan(0);

  const panel = page.getByTestId('cost-efficiency-panel');
  await expect(panel).toBeVisible();

  // ヘッダの総コスト・承認PR件数は costEfficiency()（別の計算経路）と一致するはず
  const totalEl = page.getByTestId('cost-efficiency-total');
  await expect(totalEl).toHaveText(
    `総コスト $${efficiency.totalCostUsd.toFixed(2)} / 承認PR ${efficiency.approvedPrCount}件`,
  );

  // 見出しの単価は totalCostUsd / approvedPrCount と一致するはず
  await expect(page.getByTestId('cost-efficiency-value')).toContainText(`$${efficiency.usdPerApprovedPr!.toFixed(2)}`);

  // 推移バーは costPerApprovedPrTrend()（別の計算経路）の点数と一致し、
  // 最後のバーの iteration が実データの最終点と揃っていること
  const trend = costPerApprovedPrTrend(runs);
  const bars = page.locator('[data-testid^="cost-efficiency-bar-"]');
  await expect(bars).toHaveCount(trend.length);
  const lastPoint = trend[trend.length - 1];
  await expect(page.getByTestId(`cost-efficiency-bar-${lastPoint.iteration}`)).toBeVisible();

  const body = await bodyTextExcludingFreeform(page);
  expect(body).not.toContain('NaN');
  expect(body).not.toContain('undefined');
});

test('Ideation失敗率パネルが実データから導出した実行件数・失敗件数・失敗率を表示する', async ({ page }) => {
  await page.goto('/');

  const { runs } = loadRuns();
  expect(runs.length, 'data/runs に有効な run が1件も読めなかった（fixture が壊れている）').toBeGreaterThan(0);
  const summary = ideationFailureSummary(runs);
  expect(
    summary.attempted,
    'data/runs に ideation が実行された（cost.ideationUsd > 0 の）反復が1件も無く、パネルの「データあり」経路を検証できない。',
  ).toBeGreaterThan(0);

  const panel = page.getByTestId('ideation-failure-panel');
  await expect(panel).toBeVisible();

  // ヘッダの実行件数・失敗件数は ideationFailureSummary()（別の計算経路）と一致するはず
  await expect(page.getByTestId('ideation-failure-attempted')).toHaveText(
    `実行 ${summary.attempted}件中 ${summary.failed}件が提案0件`,
  );
  await expect(page.getByTestId('ideation-failure-value')).toHaveText(`${(summary.failureRate * 100).toFixed(1)}%`);

  if (summary.failedIterations.length > 0) {
    await expect(page.getByTestId('ideation-failure-iterations')).toContainText(
      `対象iteration: ${summary.failedIterations.join(', ')}`,
    );
  } else {
    await expect(page.getByTestId('ideation-failure-iterations')).toHaveCount(0);
  }

  // 推移チャートは ideationFailureRateTrend()（別の計算経路）の点数・対象iterationと一致する
  const trend = ideationFailureRateTrend(runs);
  const trendBars = page.locator('[data-testid^="ideation-failure-trend-bar-"]');
  await expect(trendBars).toHaveCount(trend.length);
  for (const point of trend) {
    await expect(page.getByTestId(`ideation-failure-trend-bar-${point.iteration}`)).toBeVisible();
  }

  const body = await bodyTextExcludingFreeform(page);
  expect(body).not.toContain('NaN');
  expect(body).not.toContain('undefined');
});

test('Ideationコスト効率と生成品質の関連性パネルが実データから導出したbatch内訳・相関係数を表示する', async ({ page }) => {
  await page.goto('/');

  const { runs } = loadRuns();
  expect(runs.length, 'data/runs に有効な run が1件も読めなかった（fixture が壊れている）').toBeGreaterThan(0);
  const stats = ideationCostQualityCorrelation(runs);
  expect(
    stats.batches.length,
    'data/runs に ideation が提案を行った反復が1件も無く、パネルの「データあり」経路を検証できない。',
  ).toBeGreaterThan(0);
  expect(
    stats.mergeRateSampleSize,
    'data/runs に提案issueが実際に着手された反復が1件も無く、相関算出の経路を検証できない。',
  ).toBeGreaterThan(1);

  const panel = page.getByTestId('ideation-cost-quality-panel');
  await expect(panel).toBeVisible();

  const approvalEl = page.getByTestId('ideation-cost-quality-correlation-approval');
  if (stats.costVsApprovalRateCorrelation === null) {
    await expect(approvalEl).toHaveText('算出不可');
  } else {
    await expect(approvalEl).toHaveText(`r = ${stats.costVsApprovalRateCorrelation.toFixed(2)}`);
  }

  const mergeEl = page.getByTestId('ideation-cost-quality-correlation-merge');
  if (stats.costVsMergeRateCorrelation === null) {
    await expect(mergeEl).toHaveText('算出不可');
  } else {
    await expect(mergeEl).toHaveText(`r = ${stats.costVsMergeRateCorrelation.toFixed(2)}`);
  }

  // batch行は ideationCostQualityCorrelation()（別の計算経路）と同数・同iterationで存在するはず
  const rows = page.locator('[data-testid^="ideation-cost-quality-row-"]');
  await expect(rows).toHaveCount(stats.batches.length);
  const lastBatch = stats.batches[stats.batches.length - 1];
  await expect(page.getByTestId(`ideation-cost-quality-row-${lastBatch.iteration}`)).toContainText(
    `$${lastBatch.costPerIssueUsd.toFixed(3)}`,
  );

  const body = await bodyTextExcludingFreeform(page);
  expect(body).not.toContain('NaN');
  expect(body).not.toContain('undefined');
});

test('E2E失敗とrevise回数の相関パネルが実データから導出した群別平均・相関係数を表示する', async ({ page }) => {
  await page.goto('/');

  const { runs } = loadRuns();
  expect(runs.length, 'data/runs に有効な run が1件も読めなかった（fixture が壊れている）').toBeGreaterThan(0);
  const stats = e2eFailureReviseCorrelation(runs);
  expect(
    stats.sampleSize,
    'data/runs に verify 到達済みの反復が1件も無く、パネルの「データあり」経路を検証できない。',
  ).toBeGreaterThan(0);
  expect(
    stats.failedCount,
    'data/runs に e2e 失敗した反復が1件も無く、失敗群の表示を検証できない。',
  ).toBeGreaterThan(0);

  const panel = page.getByTestId('e2e-revise-correlation-panel');
  await expect(panel).toBeVisible();

  // 群別の平均revise回数は e2eFailureReviseCorrelation()（別の計算経路）と一致するはず
  await expect(page.getByTestId('e2e-revise-passed-mean')).toHaveText(`${stats.passedMeanRevise.toFixed(1)}回`);
  await expect(page.getByTestId('e2e-revise-failed-mean')).toHaveText(`${stats.failedMeanRevise.toFixed(1)}回`);

  const coefficientEl = page.getByTestId('e2e-revise-correlation-coefficient');
  if (stats.correlationCoefficient === null) {
    await expect(coefficientEl).toHaveText('算出不可');
  } else {
    await expect(coefficientEl).toHaveText(`r = ${stats.correlationCoefficient.toFixed(2)}`);
  }

  await expect(page.getByTestId('e2e-revise-failed-iterations')).toContainText(
    `E2E失敗した反復: ${stats.failedIterations.join(', ')}`,
  );

  const body = await bodyTextExcludingFreeform(page);
  expect(body).not.toContain('NaN');
  expect(body).not.toContain('undefined');
});

test('CI/ゲート通過時間のトレンド観測パネルが実データから導出した傾向・直近直前平均を表示する', async ({ page }) => {
  await page.goto('/');

  const { runs } = loadRuns();
  expect(runs.length, 'data/runs に有効な run が1件も読めなかった（fixture が壊れている）').toBeGreaterThan(0);
  const points = cycleTimeTrend(runs);
  const signal = cycleTimeTrendSignal(runs);
  expect(
    signal,
    'data/runs の反復数が1件以下で、トレンド判定（直近/直前ウィンドウ比較）の表示経路を検証できない。',
  ).not.toBeNull();

  const panel = page.getByTestId('cycle-time-trend-panel');
  await expect(panel).toBeVisible();

  // 折れ線の最新値（分表記）が cycleTimeTrend()（別の計算経路）の最終点と一致するはず
  const latestMinutes = points[points.length - 1].value / 60;
  await expect(panel).toContainText(`${latestMinutes.toFixed(1)}分`);

  const signalBlock = page.getByTestId('cycle-time-trend-signal');
  await expect(signalBlock).toHaveAttribute('data-direction', signal!.direction);

  const directionLabels: Record<string, string> = {
    increasing: '悪化傾向',
    decreasing: '改善傾向',
    flat: '横ばい',
  };
  await expect(page.getByTestId('cycle-time-trend-direction')).toContainText(directionLabels[signal!.direction]);
  await expect(page.getByTestId('cycle-time-trend-recent-avg')).toHaveText(
    `${(signal!.recentAvgSec / 60).toFixed(1)}分`,
  );
  await expect(page.getByTestId('cycle-time-trend-previous-avg')).toHaveText(
    `${(signal!.previousAvgSec / 60).toFixed(1)}分`,
  );
  await expect(signalBlock).toContainText(`直近: ${signal!.recentIterations.join(', ')}`);
  await expect(signalBlock).toContainText(`直前: ${signal!.previousIterations.join(', ')}`);

  const body = await bodyTextExcludingFreeform(page);
  expect(body).not.toContain('NaN');
  expect(body).not.toContain('undefined');
});

test('Issue開始から初PR作成までの時間トレンド観測パネルが、PRが作られた反復だけを対象に傾向・直近直前平均を表示する', async ({ page }) => {
  await page.goto('/');

  const { runs } = loadRuns();
  expect(runs.length, 'data/runs に有効な run が1件も読めなかった（fixture が壊れている）').toBeGreaterThan(0);
  const points = timeToFirstPrTrend(runs);
  const signal = timeToFirstPrTrendSignal(runs);

  // このリポジトリの data/runs は PR が実際に作られた(prNumber !== null)反復を
  // 複数含む前提で運用されている。0/1件しか無いと「データあり」経路自体を
  // 検証できないため、前提を明示した上で失敗させる。
  expect(
    signal,
    'data/runs に prNumber が設定された(PRが作られた)反復が2件未満で、トレンド判定の表示経路を検証できない。',
  ).not.toBeNull();

  const panel = page.getByTestId('time-to-first-pr-trend-panel');
  await expect(panel).toBeVisible();

  // 折れ線の最新値（分表記）が timeToFirstPrTrend()（別の計算経路）の最終点と一致するはず
  const latestMinutes = points[points.length - 1].value / 60;
  await expect(panel).toContainText(`${latestMinutes.toFixed(1)}分`);

  const signalBlock = page.getByTestId('time-to-first-pr-trend-signal');
  await expect(signalBlock).toHaveAttribute('data-direction', signal!.direction);

  const directionLabels: Record<string, string> = {
    increasing: '悪化傾向',
    decreasing: '改善傾向',
    flat: '横ばい',
  };
  await expect(page.getByTestId('time-to-first-pr-trend-direction')).toContainText(
    directionLabels[signal!.direction],
  );
  await expect(page.getByTestId('time-to-first-pr-trend-recent-avg')).toHaveText(
    `${(signal!.recentAvgSec / 60).toFixed(1)}分`,
  );
  await expect(page.getByTestId('time-to-first-pr-trend-previous-avg')).toHaveText(
    `${(signal!.previousAvgSec / 60).toFixed(1)}分`,
  );
  await expect(signalBlock).toContainText(`直近: ${signal!.recentIterations.join(', ')}`);
  await expect(signalBlock).toContainText(`直前: ${signal!.previousIterations.join(', ')}`);

  // 回帰防止（不変量）: PRが一度も作られなかった(prNumber: null)反復は、この
  // パネルが比較に使う直近/直前ウィンドウの対象iterationに含まれてはいけない。
  const noPrIterations = runs.filter((r) => r.prNumber === null).map((r) => r.iteration);
  for (const it of [...signal!.recentIterations, ...signal!.previousIterations]) {
    expect(noPrIterations).not.toContain(it);
  }

  const body = await bodyTextExcludingFreeform(page);
  expect(body).not.toContain('NaN');
  expect(body).not.toContain('undefined');
});

test('Adversary承認コメントの要約・トレンドパネルが実データから導出した文字数トレンド・承認/却下統計・直近ダイジェストを表示する', async ({ page }) => {
  await page.goto('/');

  const { runs } = loadRuns();
  expect(runs.length, 'data/runs に有効な run が1件も読めなかった（fixture が壊れている）').toBeGreaterThan(0);
  const points = adversarySummaryLengthTrend(runs);
  const signal = adversaryCommentTrendSignal(runs);
  expect(
    signal,
    'data/runs の verify 到達済み反復数が1件以下で、トレンド判定（直近/直前ウィンドウ比較）の表示経路を検証できない。',
  ).not.toBeNull();

  const panel = page.getByTestId('adversary-comment-trend-panel');
  await expect(panel).toBeVisible();

  // ヘッダの最新値は adversarySummaryLengthTrend()（別の計算経路）の最終点と一致するはず
  const latestLength = points[points.length - 1].value;
  await expect(panel).toContainText(`${latestLength.toFixed(1)}文字`);

  const signalBlock = page.getByTestId('adversary-comment-trend-signal');
  await expect(signalBlock).toHaveAttribute('data-direction', signal!.direction);

  const directionLabels: Record<string, string> = {
    lengthening: '長文化傾向',
    shortening: '短文化傾向',
    flat: '横ばい',
  };
  await expect(page.getByTestId('adversary-comment-trend-direction')).toContainText(
    directionLabels[signal!.direction],
  );
  await expect(page.getByTestId('adversary-comment-trend-recent-avg')).toHaveText(
    `${signal!.recentAvgLength.toFixed(1)}文字`,
  );
  await expect(page.getByTestId('adversary-comment-trend-previous-avg')).toHaveText(
    `${signal!.previousAvgLength.toFixed(1)}文字`,
  );
  await expect(signalBlock).toContainText(`直近: ${signal!.recentIterations.join(', ')}`);
  await expect(signalBlock).toContainText(`直前: ${signal!.previousIterations.join(', ')}`);

  // 承認/却下の平均文字数は adversaryApprovalCommentStats()（別の計算経路）と一致するはず
  const stats = adversaryApprovalCommentStats(runs);
  await expect(page.getByTestId('adversary-comment-approved-avg')).toHaveText(
    `${stats.approvedAvgLength.toFixed(1)}文字 (${stats.approvedCount}件)`,
  );
  await expect(page.getByTestId('adversary-comment-rejected-avg')).toHaveText(
    `${stats.rejectedAvgLength.toFixed(1)}文字 (${stats.rejectedCount}件)`,
  );

  // ダイジェストは recentAdversaryComments()（別の計算経路）と件数・iteration・承認バッジが一致する
  const digest = recentAdversaryComments(runs);
  for (const entry of digest) {
    const row = page.getByTestId(`adversary-comment-digest-${entry.iteration}`);
    await expect(row).toBeVisible();
    await expect(row).toHaveAttribute('data-approved', String(entry.approved));
    await expect(row).toContainText(`issue #${entry.issueNumber}`);
  }
  const digestRows = page.locator('[data-testid^="adversary-comment-digest-"]');
  await expect(digestRows).toHaveCount(digest.length);

  const body = await bodyTextExcludingFreeform(page);
  expect(body).not.toContain('NaN');
  expect(body).not.toContain('undefined');
});

test('Model別承認率トレンド観測パネルが実データから導出したモデル別の累積承認率推移・最新値を表示する', async ({ page }) => {
  await page.goto('/');

  const { runs } = loadRuns();
  expect(runs.length, 'data/runs に有効な run が1件も読めなかった（fixture が壊れている）').toBeGreaterThan(0);
  const series = approvalRateTrendByModel(runs);
  expect(
    series.some((s) => s.points.length > 0),
    'data/runs に verify 到達済みの反復を持つ builder モデルが1件も無く、パネルの「データあり」経路を検証できない。',
  ).toBe(true);

  const panel = page.getByTestId('model-approval-rate-trend-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText(`${series.length}モデル`);

  // 各モデルの凡例行が approvalRateTrendByModel()（別の計算経路）と一致する最新値・件数を表示する
  for (const s of series) {
    const legend = page.getByTestId(`model-approval-rate-trend-latest-${s.model}`);
    if (s.count === 0) {
      await expect(legend).toHaveText('データなし (0件)');
      await expect(page.getByTestId(`model-approval-rate-trend-line-${s.model}`)).toHaveCount(0);
      await expect(page.getByTestId(`model-approval-rate-trend-point-${s.model}`)).toHaveCount(0);
    } else {
      await expect(legend).toHaveText(`最新${s.latestRate.toFixed(1)}% (${s.count}件)`);
      // 2点以上なら折れ線(path)、1点だけなら単一点(circle)として描画される
      const lineCount = await page.getByTestId(`model-approval-rate-trend-line-${s.model}`).count();
      const pointCount = await page.getByTestId(`model-approval-rate-trend-point-${s.model}`).count();
      expect(lineCount + pointCount).toBe(1);
    }
  }

  // 凡例の描画順は count 降順・同数はモデル名昇順（approvalRateTrendByModel の並びそのもの）
  const legendRows = await page.locator('[data-testid^="model-approval-rate-trend-legend-"]').all();
  const renderedModels = await Promise.all(
    legendRows.map(async (r) =>
      (await r.getAttribute('data-testid'))!.replace('model-approval-rate-trend-legend-', ''),
    ),
  );
  expect(renderedModels).toEqual(series.map((s) => s.model));

  const body2 = await bodyTextExcludingFreeform(page);
  expect(body2).not.toContain('NaN');
  expect(body2).not.toContain('undefined');
});

test('Abandoned反復の追跡・分析パネルが実データから導出したサマリーと一覧を表示する', async ({ page }) => {
  await page.goto('/');

  const { runs } = loadRuns();
  expect(runs.length, 'data/runs に有効な run が1件も読めなかった（fixture が壊れている）').toBeGreaterThan(0);
  const summary = abandonedSummary(runs);
  expect(
    summary.count,
    'data/runs に abandoned な反復が1件も無く、パネルの「データあり」経路を検証できない。',
  ).toBeGreaterThan(0);

  const panel = page.getByTestId('abandoned-iterations-panel');
  await expect(panel).toBeVisible();

  // ヘッダ・サマリー指標は abandonedSummary()/abandonedRateTrend()（別の計算経路）と一致するはず
  await expect(page.getByTestId('abandoned-count')).toHaveText(`${summary.count}件`);

  const trend = abandonedRateTrend(runs);
  const latestRatePct = trend[trend.length - 1].value;
  await expect(page.getByTestId('abandoned-latest-rate')).toHaveText(`${latestRatePct.toFixed(1)}%`);
  await expect(page.getByTestId('abandoned-total-cost')).toHaveText(`$${summary.totalCostUsd.toFixed(2)}`);
  await expect(page.getByTestId('abandoned-avg-revise')).toHaveText(`${summary.avgReviseCycles.toFixed(1)}`);

  const topReasonEl = page.getByTestId('abandoned-top-reason');
  if (summary.topGateReasonCategory === null) {
    await expect(topReasonEl).toHaveText('なし');
  } else {
    await expect(topReasonEl).toContainText(`${summary.topGateReasonCount}件`);
  }

  // 一覧は abandonedIterationDetails()（別の計算経路）と同数・同iterationで、新しい反復から順に並ぶはず
  const details = abandonedIterationDetails(runs);
  const rows = page.locator('[data-testid^="abandoned-row-"]');
  await expect(rows).toHaveCount(details.length);
  for (const d of details) {
    const row = page.getByTestId(`abandoned-row-${d.iteration}`);
    await expect(row).toContainText(`issue #${d.issueNumber}`);
    await expect(row).toContainText(d.issueTitle);
  }

  const renderedIterations = await Promise.all(
    (await rows.all()).map(async (r) =>
      Number((await r.getAttribute('data-testid'))!.replace('abandoned-row-', '')),
    ),
  );
  expect(renderedIterations).toEqual(details.map((d) => d.iteration));

  // 回帰防止（不変量）: abandoned 以外の verdict はこの一覧に現れてはいけない
  const nonAbandonedIterations = runs.filter((r) => r.verdict !== 'abandoned').map((r) => r.iteration);
  for (const it of renderedIterations) {
    expect(nonAbandonedIterations).not.toContain(it);
  }

  const body = await bodyTextExcludingFreeform(page);
  expect(body).not.toContain('NaN');
  expect(body).not.toContain('undefined');
});
