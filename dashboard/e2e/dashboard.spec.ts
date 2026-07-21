import { test, expect } from '@playwright/test';

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
