import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CycleTimeTrendPanel } from './CycleTimeTrendPanel';
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

describe('CycleTimeTrendPanel', () => {
  it('run が0件なら「データなし」を表示し、パネル本体もsvgも描画しない', () => {
    const { container } = render(<CycleTimeTrendPanel runs={[]} />);
    expect(screen.getByText(/データなし/)).toBeInTheDocument();
    expect(container.querySelector('[data-testid="cycle-time-trend-panel"]')).toBeNull();
    expect(container.querySelector('svg')).toBeNull();
  });

  it('run が1件だけなら折れ線とcircleは描画するが、比較対象が無いため傾向は判定不可の注記を出す', () => {
    const runs = [makeRun({ iteration: 5, durationSec: 300 })];
    const { container } = render(<CycleTimeTrendPanel runs={runs} />);
    const panel = container.querySelector('[data-testid="cycle-time-trend-panel"]');
    expect(panel).not.toBeNull();
    expect(container.querySelector('svg')).not.toBeNull();
    expect(container.querySelector('circle')).not.toBeNull();
    expect(container.querySelector('[data-testid="cycle-time-trend-signal"]')).toBeNull();
    expect(panel?.textContent).toContain('傾向');
    expect(panel?.textContent).toContain('まだ判定できません');
    // 最新値(5分)がヘッダに表示されている
    expect(screen.getByText(/5\.0分/)).toBeInTheDocument();
  });

  it('直近所要時間が直前より明確に長くなっていると「悪化傾向」を rose で表示する', () => {
    const runs = [
      makeRun({ iteration: 1, durationSec: 60 }),
      makeRun({ iteration: 2, durationSec: 60 }),
      makeRun({ iteration: 3, durationSec: 60 }),
      makeRun({ iteration: 4, durationSec: 600 }),
      makeRun({ iteration: 5, durationSec: 600 }),
      makeRun({ iteration: 6, durationSec: 600 }),
    ];
    const { container } = render(<CycleTimeTrendPanel runs={runs} />);
    const signalBlock = container.querySelector('[data-testid="cycle-time-trend-signal"]');
    expect(signalBlock).not.toBeNull();
    expect(signalBlock?.getAttribute('data-direction')).toBe('increasing');

    const direction = container.querySelector('[data-testid="cycle-time-trend-direction"]');
    expect(direction?.textContent).toContain('悪化傾向');
    expect(direction?.className).toContain('text-rose-400');

    const recentAvg = container.querySelector('[data-testid="cycle-time-trend-recent-avg"]');
    expect(recentAvg?.textContent).toBe('10.0分');
    const previousAvg = container.querySelector('[data-testid="cycle-time-trend-previous-avg"]');
    expect(previousAvg?.textContent).toBe('1.0分');

    expect(signalBlock?.textContent).toContain('直近: 4, 5, 6');
    expect(signalBlock?.textContent).toContain('直前: 1, 2, 3');
  });

  it('直近所要時間が直前より明確に短くなっていると「改善傾向」を emerald で表示する', () => {
    const runs = [
      makeRun({ iteration: 1, durationSec: 600 }),
      makeRun({ iteration: 2, durationSec: 600 }),
      makeRun({ iteration: 3, durationSec: 600 }),
      makeRun({ iteration: 4, durationSec: 60 }),
      makeRun({ iteration: 5, durationSec: 60 }),
      makeRun({ iteration: 6, durationSec: 60 }),
    ];
    const { container } = render(<CycleTimeTrendPanel runs={runs} />);
    const direction = container.querySelector('[data-testid="cycle-time-trend-direction"]');
    expect(direction?.textContent).toContain('改善傾向');
    expect(direction?.className).toContain('text-emerald-400');
  });

  it('変化がわずか（閾値未満）なら「横ばい」を sky で表示する', () => {
    const runs = [
      makeRun({ iteration: 1, durationSec: 100 }),
      makeRun({ iteration: 2, durationSec: 100 }),
      makeRun({ iteration: 3, durationSec: 100 }),
      makeRun({ iteration: 4, durationSec: 101 }),
      makeRun({ iteration: 5, durationSec: 101 }),
      makeRun({ iteration: 6, durationSec: 101 }),
    ];
    const { container } = render(<CycleTimeTrendPanel runs={runs} />);
    const direction = container.querySelector('[data-testid="cycle-time-trend-direction"]');
    expect(direction?.textContent).toContain('横ばい');
    expect(direction?.className).toContain('text-sky-400');
  });

  it('window に満たないデータ数では partial 注記を表示する', () => {
    const runs = [
      makeRun({ iteration: 1, durationSec: 100 }),
      makeRun({ iteration: 2, durationSec: 200 }),
    ];
    const { container } = render(<CycleTimeTrendPanel runs={runs} />);
    const signalBlock = container.querySelector('[data-testid="cycle-time-trend-signal"]');
    expect(signalBlock?.textContent).toContain('データ不足のため window 未満の反復数で計算');
  });

  it('failed run のdurationSecも母集団から除外せずグラフ・折れ線の最新値に反映する', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'merged', durationSec: 120 }),
      makeRun({ iteration: 2, verdict: 'failed', durationSec: 30 }),
    ];
    const { container } = render(<CycleTimeTrendPanel runs={runs} />);
    // 最新(iteration 2)の30秒 = 0.5分がヘッダに出る。
    // recent-avg も window=1 で同じ値(0.5分)になるため、getByText ではなく
    // ヘッダ直下の要素に絞って一致を確認する（曖昧一致による複数ヒットを避ける）。
    const header = container.querySelector('[data-testid="cycle-time-trend-panel"] > div');
    expect(header?.textContent).toContain('0.5分');
    // NaN が座標に紛れ込んでいない
    expect(container.querySelector('svg')?.innerHTML).not.toMatch(/NaN/);
  });
});
