import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IssueResolutionTimeTrendPanel } from './IssueResolutionTimeTrendPanel';
import type { RunRecord } from '@/lib/types';

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

describe('IssueResolutionTimeTrendPanel', () => {
  it('run が0件なら「データなし」を表示し、パネル本体もsvgも描画しない', () => {
    const { container } = render(<IssueResolutionTimeTrendPanel runs={[]} />);
    expect(screen.getByText(/データなし/)).toBeInTheDocument();
    expect(container.querySelector('[data-testid="issue-resolution-time-trend-panel"]')).toBeNull();
    expect(container.querySelector('svg')).toBeNull();
  });

  it('生成元(nextIssues)が特定できないissueしかクローズしていない場合は「データなし」', () => {
    // issue #1 はどの反復の nextIssues にも現れないため解決時間の起点が無い
    const runs = [makeRun({ iteration: 1, issue: { number: 1, title: 't', labels: [] }, verdict: 'merged' })];
    const { container } = render(<IssueResolutionTimeTrendPanel runs={runs} />);
    expect(screen.getByText(/データなし/)).toBeInTheDocument();
    expect(container.querySelector('[data-testid="issue-resolution-time-trend-panel"]')).toBeNull();
  });

  it('生成〜クローズが1件だけなら折れ線とcircleは描画するが、比較対象が無いため傾向は判定不可の注記を出す', () => {
    const runs = [
      makeRun({
        iteration: 1,
        issue: { number: 1, title: 't', labels: [] },
        startedAt: '2026-07-20T00:00:00Z',
        finishedAt: '2026-07-20T00:00:00Z',
        nextIssues: [2],
      }),
      makeRun({
        iteration: 2,
        issue: { number: 2, title: 't2', labels: [] },
        startedAt: '2026-07-20T00:10:00Z',
        finishedAt: '2026-07-20T00:15:00Z',
        verdict: 'merged',
      }),
    ];
    const { container } = render(<IssueResolutionTimeTrendPanel runs={runs} />);
    const panel = container.querySelector('[data-testid="issue-resolution-time-trend-panel"]');
    expect(panel).not.toBeNull();
    expect(container.querySelector('svg')).not.toBeNull();
    expect(container.querySelector('circle')).not.toBeNull();
    expect(container.querySelector('[data-testid="issue-resolution-time-trend-signal"]')).toBeNull();
    expect(panel?.textContent).toContain('傾向');
    expect(panel?.textContent).toContain('まだ判定できません');
    // 生成(00:00) → クローズ(00:15) = 15分
    expect(screen.getByText(/15\.0分/)).toBeInTheDocument();
    const latest = container.querySelector('[data-testid="issue-resolution-time-trend-latest"]');
    expect(latest?.textContent).toContain('issue #2');
    expect(latest?.textContent).toContain('生成 iteration 1');
    expect(latest?.textContent).toContain('クローズ iteration 2');
  });

  it('同一issue番号が複数回dispatchされても、生成後最初にクローズした反復だけを1件として数える', () => {
    const runs = [
      // issue #10 を生成
      makeRun({ iteration: 1, issue: { number: 1, title: 't', labels: [] }, finishedAt: '2026-07-20T00:00:00Z', nextIssues: [10] }),
      // 1回目のdispatchでクローズ(merged)。これが「解決」とみなされるべき
      makeRun({ iteration: 2, issue: { number: 10, title: 'a', labels: [] }, finishedAt: '2026-07-20T00:10:00Z', verdict: 'merged' }),
      // 誤って再度dispatchされ、こちらも merged。重複カウントされてはいけない
      makeRun({ iteration: 3, issue: { number: 10, title: 'a', labels: [] }, finishedAt: '2026-07-20T02:00:00Z', verdict: 'merged' }),
    ];
    const { container } = render(<IssueResolutionTimeTrendPanel runs={runs} />);
    // circle が描画される(=1点のみ)ことで、2件目の重複クローズがカウントされていないことを確認
    expect(container.querySelector('circle')).not.toBeNull();
    const latest = container.querySelector('[data-testid="issue-resolution-time-trend-latest"]');
    // クローズ反復は最初の merged(iteration 2)であり、2回目のiteration 3ではない
    expect(latest?.textContent).toContain('クローズ iteration 2');
    // 生成(00:00)〜最初のクローズ(00:10) = 10分。2回目まで含めた120分ではない
    expect(screen.getByText(/10\.0分/)).toBeInTheDocument();
    expect(screen.queryByText(/120\.0分/)).toBeNull();
  });

  it('生成反復のiterationがクローズ反復以上(自己参照)の場合は対象外', () => {
    // issue #5 の nextIssues に自分自身の番号が含まれる自己参照ケース
    const runs = [
      makeRun({
        iteration: 1,
        issue: { number: 5, title: 't', labels: [] },
        verdict: 'merged',
        nextIssues: [5],
      }),
    ];
    const { container } = render(<IssueResolutionTimeTrendPanel runs={runs} />);
    expect(screen.getByText(/データなし/)).toBeInTheDocument();
    expect(container.querySelector('[data-testid="issue-resolution-time-trend-panel"]')).toBeNull();
  });

  it('failed/paused等クローズしなかった反復は対象外', () => {
    const runs = [
      makeRun({ iteration: 1, issue: { number: 1, title: 't', labels: [] }, nextIssues: [2] }),
      makeRun({ iteration: 2, issue: { number: 2, title: 't2', labels: [] }, verdict: 'failed' }),
      makeRun({ iteration: 3, issue: { number: 2, title: 't2', labels: [] }, verdict: 'paused' }),
    ];
    const { container } = render(<IssueResolutionTimeTrendPanel runs={runs} />);
    expect(screen.getByText(/データなし/)).toBeInTheDocument();
    expect(container.querySelector('[data-testid="issue-resolution-time-trend-panel"]')).toBeNull();
  });

  it('解決時間が直近ほど明確に長くなっていると「悪化傾向」を rose で表示する', () => {
    const runs: RunRecord[] = [];
    // 生成反復(短い解決:60秒 x3, 長い解決:600秒 x3)
    for (let i = 0; i < 6; i++) {
      const genIter = i * 2 + 1;
      const closeIter = i * 2 + 2;
      const durationSec = i < 3 ? 60 : 600;
      runs.push(
        makeRun({
          iteration: genIter,
          issue: { number: 100 + genIter, title: 'g', labels: [] },
          finishedAt: '2026-07-20T00:00:00Z',
          nextIssues: [200 + genIter],
        }),
      );
      runs.push(
        makeRun({
          iteration: closeIter,
          issue: { number: 200 + genIter, title: 'c', labels: [] },
          finishedAt: new Date(new Date('2026-07-20T00:00:00Z').getTime() + durationSec * 1000).toISOString(),
          verdict: 'merged',
        }),
      );
    }
    const { container } = render(<IssueResolutionTimeTrendPanel runs={runs} />);
    const signalBlock = container.querySelector('[data-testid="issue-resolution-time-trend-signal"]');
    expect(signalBlock).not.toBeNull();
    expect(signalBlock?.getAttribute('data-direction')).toBe('increasing');

    const direction = container.querySelector('[data-testid="issue-resolution-time-trend-direction"]');
    expect(direction?.textContent).toContain('悪化傾向');
    expect(direction?.className).toContain('text-rose-400');

    const recentAvg = container.querySelector('[data-testid="issue-resolution-time-trend-recent-avg"]');
    expect(recentAvg?.textContent).toBe('10.0分');
    const previousAvg = container.querySelector('[data-testid="issue-resolution-time-trend-previous-avg"]');
    expect(previousAvg?.textContent).toBe('1.0分');
  });

  it('window に満たないデータ数では partial 注記を表示する', () => {
    const runs = [
      makeRun({ iteration: 1, issue: { number: 1, title: 't', labels: [] }, finishedAt: '2026-07-20T00:00:00Z', nextIssues: [11, 12] }),
      makeRun({
        iteration: 2,
        issue: { number: 11, title: 'a', labels: [] },
        finishedAt: '2026-07-20T00:01:00Z',
        verdict: 'merged',
      }),
      makeRun({
        iteration: 3,
        issue: { number: 12, title: 'b', labels: [] },
        finishedAt: '2026-07-20T00:02:00Z',
        verdict: 'abandoned',
      }),
    ];
    const { container } = render(<IssueResolutionTimeTrendPanel runs={runs} />);
    const signalBlock = container.querySelector('[data-testid="issue-resolution-time-trend-signal"]');
    expect(signalBlock?.textContent).toContain('データ不足のため window 未満の件数で計算');
  });

  it('svg に NaN が紛れ込まない（座標計算の回帰防止）', () => {
    const runs = [
      makeRun({ iteration: 1, issue: { number: 1, title: 't', labels: [] }, finishedAt: '2026-07-20T00:00:00Z', nextIssues: [2] }),
      makeRun({
        iteration: 2,
        issue: { number: 2, title: 't2', labels: [] },
        finishedAt: '2026-07-20T00:05:00Z',
        verdict: 'merged',
      }),
    ];
    const { container } = render(<IssueResolutionTimeTrendPanel runs={runs} />);
    expect(container.querySelector('svg')?.innerHTML).not.toMatch(/NaN/);
  });
});
