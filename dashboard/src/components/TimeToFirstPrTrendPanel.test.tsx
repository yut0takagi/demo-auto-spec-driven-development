import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TimeToFirstPrTrendPanel } from './TimeToFirstPrTrendPanel';
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

describe('TimeToFirstPrTrendPanel', () => {
  it('run が0件なら「データなし」を表示し、パネル本体もsvgも描画しない', () => {
    const { container } = render(<TimeToFirstPrTrendPanel runs={[]} />);
    expect(screen.getByText(/データなし/)).toBeInTheDocument();
    expect(container.querySelector('[data-testid="time-to-first-pr-trend-panel"]')).toBeNull();
    expect(container.querySelector('svg')).toBeNull();
  });

  it('全反復が prNumber: null（PRが一度も作られていない）なら「データなし」を表示する', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'failed', prNumber: null, durationSec: 45 }),
      makeRun({ iteration: 2, verdict: 'abandoned', prNumber: null, durationSec: 90 }),
    ];
    const { container } = render(<TimeToFirstPrTrendPanel runs={runs} />);
    expect(screen.getByText(/データなし/)).toBeInTheDocument();
    expect(container.querySelector('[data-testid="time-to-first-pr-trend-panel"]')).toBeNull();
  });

  it('PRが作られた反復が1件だけなら折れ線とcircleは描画するが、比較対象が無いため傾向は判定不可の注記を出す', () => {
    const runs = [makeRun({ iteration: 5, durationSec: 300, prNumber: 42 })];
    const { container } = render(<TimeToFirstPrTrendPanel runs={runs} />);
    const panel = container.querySelector('[data-testid="time-to-first-pr-trend-panel"]');
    expect(panel).not.toBeNull();
    expect(container.querySelector('svg')).not.toBeNull();
    expect(container.querySelector('circle')).not.toBeNull();
    expect(container.querySelector('[data-testid="time-to-first-pr-trend-signal"]')).toBeNull();
    expect(panel?.textContent).toContain('傾向');
    expect(panel?.textContent).toContain('まだ判定できません');
    expect(screen.getByText(/5\.0分/)).toBeInTheDocument();
  });

  it('PRが作られなかった反復(prNumber: null)は折れ線・比較対象から除外される', () => {
    const runs = [
      makeRun({ iteration: 1, durationSec: 60, prNumber: 11 }),
      // iteration 2 は極端な durationSec だが prNumber: null なので無視されるはず
      makeRun({ iteration: 2, durationSec: 99999, prNumber: null, verdict: 'failed' }),
      makeRun({ iteration: 3, durationSec: 60, prNumber: 13 }),
    ];
    const { container } = render(<TimeToFirstPrTrendPanel runs={runs} />);
    const signalBlock = container.querySelector('[data-testid="time-to-first-pr-trend-signal"]');
    expect(signalBlock).not.toBeNull();
    // 比較対象の反復番号に iteration 2 が含まれない（PR未作成の外れ値に引きずられない）
    expect(signalBlock?.textContent).toContain('直近: 3');
    expect(signalBlock?.textContent).toContain('直前: 1');
    expect(signalBlock?.textContent).not.toContain('2');
    // ヘッダの最新値も iteration 3(60秒=1.0分)であって iteration 2 の巨大値ではない
    const header = container.querySelector('[data-testid="time-to-first-pr-trend-panel"] > div');
    expect(header?.textContent).toContain('1.0分');
  });

  it('直近所要時間が直前より明確に長くなっていると「悪化傾向」を rose で表示する', () => {
    const runs = [
      makeRun({ iteration: 1, durationSec: 60, prNumber: 1 }),
      makeRun({ iteration: 2, durationSec: 60, prNumber: 2 }),
      makeRun({ iteration: 3, durationSec: 60, prNumber: 3 }),
      makeRun({ iteration: 4, durationSec: 600, prNumber: 4 }),
      makeRun({ iteration: 5, durationSec: 600, prNumber: 5 }),
      makeRun({ iteration: 6, durationSec: 600, prNumber: 6 }),
    ];
    const { container } = render(<TimeToFirstPrTrendPanel runs={runs} />);
    const signalBlock = container.querySelector('[data-testid="time-to-first-pr-trend-signal"]');
    expect(signalBlock).not.toBeNull();
    expect(signalBlock?.getAttribute('data-direction')).toBe('increasing');

    const direction = container.querySelector('[data-testid="time-to-first-pr-trend-direction"]');
    expect(direction?.textContent).toContain('悪化傾向');
    expect(direction?.className).toContain('text-rose-400');

    const recentAvg = container.querySelector('[data-testid="time-to-first-pr-trend-recent-avg"]');
    expect(recentAvg?.textContent).toBe('10.0分');
    const previousAvg = container.querySelector('[data-testid="time-to-first-pr-trend-previous-avg"]');
    expect(previousAvg?.textContent).toBe('1.0分');

    expect(signalBlock?.textContent).toContain('直近: 4, 5, 6');
    expect(signalBlock?.textContent).toContain('直前: 1, 2, 3');
  });

  it('直近所要時間が直前より明確に短くなっていると「改善傾向」を emerald で表示する', () => {
    const runs = [
      makeRun({ iteration: 1, durationSec: 600, prNumber: 1 }),
      makeRun({ iteration: 2, durationSec: 600, prNumber: 2 }),
      makeRun({ iteration: 3, durationSec: 600, prNumber: 3 }),
      makeRun({ iteration: 4, durationSec: 60, prNumber: 4 }),
      makeRun({ iteration: 5, durationSec: 60, prNumber: 5 }),
      makeRun({ iteration: 6, durationSec: 60, prNumber: 6 }),
    ];
    const { container } = render(<TimeToFirstPrTrendPanel runs={runs} />);
    const direction = container.querySelector('[data-testid="time-to-first-pr-trend-direction"]');
    expect(direction?.textContent).toContain('改善傾向');
    expect(direction?.className).toContain('text-emerald-400');
  });

  it('変化がわずか（閾値未満）なら「横ばい」を sky で表示する', () => {
    const runs = [
      makeRun({ iteration: 1, durationSec: 100, prNumber: 1 }),
      makeRun({ iteration: 2, durationSec: 100, prNumber: 2 }),
      makeRun({ iteration: 3, durationSec: 100, prNumber: 3 }),
      makeRun({ iteration: 4, durationSec: 101, prNumber: 4 }),
      makeRun({ iteration: 5, durationSec: 101, prNumber: 5 }),
      makeRun({ iteration: 6, durationSec: 101, prNumber: 6 }),
    ];
    const { container } = render(<TimeToFirstPrTrendPanel runs={runs} />);
    const direction = container.querySelector('[data-testid="time-to-first-pr-trend-direction"]');
    expect(direction?.textContent).toContain('横ばい');
    expect(direction?.className).toContain('text-sky-400');
  });

  it('window に満たないデータ数では partial 注記を表示する', () => {
    const runs = [
      makeRun({ iteration: 1, durationSec: 100, prNumber: 1 }),
      makeRun({ iteration: 2, durationSec: 200, prNumber: 2 }),
    ];
    const { container } = render(<TimeToFirstPrTrendPanel runs={runs} />);
    const signalBlock = container.querySelector('[data-testid="time-to-first-pr-trend-signal"]');
    expect(signalBlock?.textContent).toContain('データ不足のため window 未満の反復数で計算');
  });

  it('svg に NaN が紛れ込まない（座標計算の回帰防止）', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', durationSec: 120, prNumber: 1 }),
      makeRun({ iteration: 2, verdict: 'failed', durationSec: 30, prNumber: null }),
    ];
    const { container } = render(<TimeToFirstPrTrendPanel runs={runs} />);
    expect(container.querySelector('svg')?.innerHTML).not.toMatch(/NaN/);
  });
});
