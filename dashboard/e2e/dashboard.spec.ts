import { test, expect } from '@playwright/test';
import { loadRuns } from '../src/lib/loadData';
import { summarize } from '../src/lib/aggregate';

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
  await expect(page.getByText(latestDurationText, { exact: true })).toBeVisible();
  await expect(page.getByText(`iteration ${summary.latestDurationIteration}`, { exact: true })).toBeVisible();

  // 「平均サイクルタイム」と「直近の所要時間」は値が異なる別カードであり、混同されて
  // はならない。data/runs の内容次第では両者が同値になり得るため、まずこのテストの
  // 前提として2つの表記が異なることを確認してから、カード単位の分離を検証する。
  expect(
    latestDurationText,
    'data/runs の内容が変わり、直近所要時間と平均サイクルタイムが同値になった。この場合カードの分離を検証できないため fixture を見直すこと。',
  ).not.toBe(avgCycleTimeText);

  // ラベルを起点にカード(直近の祖先の rounded-xl コンテナ)へスコープし、
  // それぞれのカードが自分の値だけを含み、相手の値を含まないことを検証する。
  const cycleTimeCard = page.locator('div.rounded-xl').filter({ hasText: 'サイクルタイム' });
  const latestDurationCard = page.locator('div.rounded-xl').filter({ hasText: '直近の所要時間' });
  await expect(cycleTimeCard).toHaveCount(1);
  await expect(latestDurationCard).toHaveCount(1);

  await expect(cycleTimeCard).toContainText(avgCycleTimeText);
  await expect(cycleTimeCard).not.toContainText(latestDurationText);

  await expect(latestDurationCard).toContainText(latestDurationText);
  await expect(latestDurationCard).not.toContainText(avgCycleTimeText);
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

test('実データが数値として描画され、生 float や NaN が漏れない', async ({ page }) => {
  await page.goto('/');

  // フィクスチャの累計コストは 0.09+0.36... の合計で、生値は 1.1099999999999999。
  // 整形されて $1.11 になっていること、生 float / NaN がページに存在しないこと。
  await expect(page.getByText('$1.11')).toBeVisible();

  const body = await page.locator('body').innerText();
  expect(body).not.toContain('1.10999');
  expect(body).not.toContain('NaN');
  expect(body).not.toContain('undefined');
});

test('カバレッジ推移は failed 反復で 0% に急落しない（カードと一致する）', async ({ page }) => {
  await page.goto('/');

  // 最新反復(#5)は failed=カバレッジ未計測。カードは iteration 4 の 84.1% を表示し、
  // 推移グラフのヘッダ現在値も 84.1% を示す（過去、failed の 0% を拾って崩壊表示した回帰の防止）。
  await expect(page.getByText('84.1%').first()).toBeVisible();
  await expect(page.getByRole('img', { name: 'カバレッジ推移' })).toBeVisible();

  // 0 への急落シグナルである "0.0%" がページのどこにも現れないこと。
  await expect(page.getByText('0.0%')).toHaveCount(0);
});
