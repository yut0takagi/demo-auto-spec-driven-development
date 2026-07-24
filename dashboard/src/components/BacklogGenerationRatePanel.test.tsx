import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { BacklogGenerationRatePanel } from './BacklogGenerationRatePanel';
import { GENERATION_RATE_ALERT_STREAK } from '@/lib/aggregate';
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

describe('BacklogGenerationRatePanel', () => {
  it('runが0件なら「データなし」を表示し、パネル本体を描画しない', () => {
    const { container } = render(<BacklogGenerationRatePanel runs={[]} />);
    expect(container.textContent).toContain('データなし');
    expect(container.querySelector('[data-testid="backlog-generation-rate-panel"]')).toBeNull();
  });

  it('生成が消費を上回り続けている場合は平常(emerald)表示になり、未発報', () => {
    const { container } = render(<BacklogGenerationRatePanel runs={makeRunRange(1, 3, 2)} />);
    const panel = container.querySelector('[data-testid="backlog-generation-rate-panel"]');
    expect(panel?.getAttribute('data-triggered')).toBe('false');

    const status = container.querySelector('[data-testid="backlog-generation-rate-status"]');
    expect(status?.textContent).toContain('平常');
    expect(status?.className).toContain('text-emerald-400');

    expect(container.querySelector('[data-testid="backlog-generation-rate-recent"]')?.textContent).toBe('2.00/反復');
    expect(container.querySelector('[data-testid="backlog-generation-rate-streak"]')?.textContent).toBe('0');
  });

  it(`生成不足が${GENERATION_RATE_ALERT_STREAK}反復連続すると発報し、rose表示になる`, () => {
    const runs = makeRunRange(1, GENERATION_RATE_ALERT_STREAK);
    const { container } = render(<BacklogGenerationRatePanel runs={runs} />);
    const panel = container.querySelector('[data-testid="backlog-generation-rate-panel"]');
    expect(panel?.getAttribute('data-triggered')).toBe('true');

    const status = container.querySelector('[data-testid="backlog-generation-rate-status"]');
    expect(status?.textContent).toContain('発報');
    expect(status?.className).toContain('text-rose-400');

    const streak = container.querySelector('[data-testid="backlog-generation-rate-streak"]');
    expect(streak?.textContent).toBe(String(GENERATION_RATE_ALERT_STREAK));
    expect(streak?.className).toContain('text-rose-400');

    expect(container.querySelector('[data-testid="backlog-generation-rate-iterations"]')?.textContent).toContain(
      '対象iteration: 1, 2, 3',
    );
  });

  it('生成不足が発報閾値未満の連続では注意(amber)表示になり、発報しない', () => {
    const runs = makeRunRange(1, GENERATION_RATE_ALERT_STREAK - 1);
    const { container } = render(<BacklogGenerationRatePanel runs={runs} />);
    const panel = container.querySelector('[data-testid="backlog-generation-rate-panel"]');
    expect(panel?.getAttribute('data-triggered')).toBe('false');

    const status = container.querySelector('[data-testid="backlog-generation-rate-status"]');
    expect(status?.textContent).toContain('注意');
    expect(status?.className).toContain('text-amber-400');
  });

  it('全反復の平均と直近window平均が乖離するケースで、それぞれ独立した値を表示する', () => {
    const runs = [...makeRunRange(1, 5, 3), ...makeRunRange(6, 10)];
    const { container } = render(<BacklogGenerationRatePanel runs={runs} />);
    expect(container.querySelector('[data-testid="backlog-generation-rate-recent"]')?.textContent).toBe('0.00/反復');
    expect(container.querySelector('[data-testid="backlog-generation-rate-overall"]')?.textContent).toBe(
      '1.50/反復',
    );
    expect(container.querySelector('[data-testid="backlog-generation-rate-iterations"]')?.textContent).toContain(
      '対象iteration: 6, 7, 8, 9, 10',
    );
  });
});
