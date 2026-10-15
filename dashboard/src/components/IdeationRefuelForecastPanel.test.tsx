import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { IdeationRefuelForecastPanel } from './IdeationRefuelForecastPanel';
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

/** iteration `from`..`to` の run を、各反復 nextIssues 長 `n`（既定0=生成なし）で生成する。 */
function makeRunRange(from: number, to: number, n = 0): RunRecord[] {
  return Array.from({ length: to - from + 1 }, (_, k) =>
    makeRun({ iteration: from + k, nextIssues: Array.from({ length: n }, (_, j) => 1000 * from + k * 10 + j) }),
  );
}

describe('IdeationRefuelForecastPanel', () => {
  it('runが0件なら「データなし」を表示し、パネル本体を描画しない', () => {
    const { container } = render(<IdeationRefuelForecastPanel runs={[]} />);
    expect(container.textContent).toContain('データなし');
    expect(container.querySelector('[data-testid="ideation-refuel-forecast-panel"]')).toBeNull();
  });

  it('補充が消費を上回り続けている場合は平常(emerald)表示になり、警戒しない', () => {
    const { container } = render(<IdeationRefuelForecastPanel runs={makeRunRange(1, 3, 2)} />);
    const panel = container.querySelector('[data-testid="ideation-refuel-forecast-panel"]');
    expect(panel?.getAttribute('data-at-risk')).toBe('false');

    const status = container.querySelector('[data-testid="ideation-refuel-forecast-status"]');
    expect(status?.textContent).toContain('平常');
    expect(status?.className).toContain('text-emerald-400');

    expect(container.querySelector('[data-testid="ideation-refuel-forecast-success-rate"]')?.textContent).toBe(
      '100%',
    );
  });

  it('補充0件が続く場合は警戒(rose)表示になり、繰り越し予測もマイナス方向を示す', () => {
    const runs = makeRunRange(1, 3);
    const { container } = render(<IdeationRefuelForecastPanel runs={runs} />);
    const panel = container.querySelector('[data-testid="ideation-refuel-forecast-panel"]');
    expect(panel?.getAttribute('data-at-risk')).toBe('true');

    const status = container.querySelector('[data-testid="ideation-refuel-forecast-status"]');
    expect(status?.textContent).toContain('警戒');
    expect(status?.className).toContain('text-rose-400');

    expect(container.querySelector('[data-testid="ideation-refuel-forecast-success-rate"]')?.textContent).toBe('0%');
    const successRateEl = container.querySelector('[data-testid="ideation-refuel-forecast-success-rate"]');
    expect(successRateEl?.className).toContain('text-rose-400');

    const carryover = container.querySelector('[data-testid="ideation-refuel-forecast-carryover"]');
    expect(carryover?.className).toContain('text-rose-400');

    expect(container.querySelector('[data-testid="ideation-refuel-forecast-iterations"]')?.textContent).toContain(
      '対象iteration: 1, 2, 3',
    );
  });

  it('全反復の給油成功率と直近window成功率が乖離するケースで、それぞれ独立した値を表示する', () => {
    const runs = [...makeRunRange(1, 5, 3), ...makeRunRange(6, 10)];
    const { container } = render(<IdeationRefuelForecastPanel runs={runs} />);
    expect(container.querySelector('[data-testid="ideation-refuel-forecast-success-rate"]')?.textContent).toBe('0%');
    expect(container.querySelector('[data-testid="ideation-refuel-forecast-overall-rate"]')?.textContent).toBe(
      '50%',
    );
  });
});
