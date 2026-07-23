import { test, expect } from '@playwright/test';
import { loadRuns } from '../src/lib/loadData';
import { summarize, e2eFailureRateTrend, costBreakdown } from '../src/lib/aggregate';

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

test('ダッシュボードが稼働ステータスと主要メトリクスを表示する', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: '自己観測ダッシュボード' })).toBeVisible();

  const badge = page.getByTestId('status-badge');
  await expect(badge).toBeVisible();
  await expect(badge).toHaveAttribute('data-state', /RUNNING|PAUSED|HALTED/);

  // exact 指定: フィクスチャの issue タイトルにも「承認率…」等が含まれ、
  // 部分一致だと strict mode 違反になる。ラベルは完全一致で狙う。
  await expect(page.getByText('反復数', { exact: true })).toBeVisible();
  await expect(page.getByText('承認率', { exact: true })).toBeVisible();
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

  const body = await page.locator('body').innerText();
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

  const body = await page.locator('body').innerText();
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
  const approvalCard = page.locator('div.rounded-xl').filter({ hasText: '承認率推移' });
  const mergeCard = page.locator('div.rounded-xl').filter({ hasText: 'マージ率推移' });
  await expect(approvalCard).toContainText(`${(summary.approvalRate * 100).toFixed(1)}%`);
  await expect(mergeCard).toContainText(`${(summary.mergeRate * 100).toFixed(1)}%`);

  const body = await page.locator('body').innerText();
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

  const body = await page.locator('body').innerText();
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

  const body2 = await page.locator('body').innerText();
  expect(body2).not.toContain('NaN');
  expect(body2).not.toContain('undefined');
});
